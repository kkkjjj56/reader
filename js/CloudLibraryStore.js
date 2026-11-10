import { Book } from './Book.js';
import { CloudPendingStore } from './CloudPendingStore.js';
import { enqueueProgress, acknowledgeProgress, resolveProgressConflict } from './CloudProgressQueue.js';

// The caller supplies an authenticated Supabase client; no privileged key is used.
export class CloudLibraryStore {
  constructor(client, userId, pending = globalThis.indexedDB ? new CloudPendingStore(userId) : null) { this.client = client; this.userId = userId; this.versions = new Map(); this.operations = new Map(); this.pending = pending; }
  path(id) { return `${this.userId}/${id}.txt`; }
  async load() {
    const {data, error} = await this.client.from('reader_books').select('id,title,encoding,created_at,state,reader_progress(paragraph_index,paragraph_ratio,progress,version,updated_at)').eq('owner_id',this.userId);
    if (error) throw new Error('无法读取云端书架，请检查网络和登录状态。');
    const books = [];
    for (const row of data) {
      if (row.state === 'deleting') { await this.remove(row.id); continue; }
      if (row.state !== 'ready') continue;
      const result = await this.client.storage.from('reader-books').download(this.path(row.id));
      if (result.error) throw new Error(`无法下载《${row.title}》，请检查网络后重试。`);
      const text = await result.data.text();
      const progress = Array.isArray(row.reader_progress) ? row.reader_progress[0] : row.reader_progress;
      this.versions.set(row.id, Number(progress?.version || 0));
      const pending = await this.pending?.get(row.id);
      const latest = pending?.queue && (pending.queue.latest || pending.queue.inFlight.snapshot);
      if (pending?.queue) this.operations.set(row.id,pending.queue);
      const book = new Book({id:row.id,title:row.title,encoding:row.encoding,paragraphs:text.split('\n'),importedAt:Date.parse(row.created_at),lastReadAt:progress?.updated_at ? Date.parse(progress.updated_at) : 0, position:latest ? {index:latest.index,ratio:latest.ratio} : {index:progress?.paragraph_index || 0,ratio:progress?.paragraph_ratio || 0},progress:latest?.progress ?? progress?.progress ?? 0});
      books.push(book);
    }
    // Interrupted uploads keep a local snapshot and can be retried by opening the book.
    for (const item of await this.pending?.list() || []) {
      if (item.upload && !books.some(book => book.id === item.bookId)) books.push(new Book(item.upload));
    }
    books.sort((a,b)=>b.lastReadAt-a.lastReadAt);
    return {books,lastId:books[0]?.id || null};
  }
  async resolveConflict(book, choice) {
    if (!this.conflict || this.conflict.id !== book.id) throw new Error('当前没有可处理的进度冲突。');
    const remote = this.conflict;
    const queue = this.operations.get(book.id) || (await this.pending?.get(book.id))?.queue;
    if (!queue) throw new Error('本机待同步进度已丢失。');
    const result = resolveProgressConflict(queue,remote,choice);
    this.versions.set(book.id,Number(remote.version));
    if (result.queue) { this.operations.set(book.id,result.queue); await this.pending?.put(book.id,{queue:result.queue}); }
    else { this.operations.delete(book.id); await this.pending?.remove(book.id); }
    this.conflict = null;
    if (choice === 'cloud') book.updatePosition({index:remote.paragraph_index,ratio:remote.paragraph_ratio},remote.progress);
    return result;
  }
  async save(book, markRecent = true) {
    const path = this.path(book.id);
    if (!this.versions.has(book.id)) {
      const previous = await this.pending?.get(book.id);
      await this.pending?.put(book.id,{...previous, upload:structuredClone(book)});
      const initial = {id:book.id,owner_id:this.userId,title:book.title,encoding:book.encoding,storage_path:path,state:'uploading'};
      const exists = await this.client.from('reader_books').select('id,state').eq('id',book.id).maybeSingle();
      if (exists.error) throw new Error('无法确认上传状态，请稍后重试。');
      if (!exists.data) {
        const created = await this.client.from('reader_books').insert(initial);
        if (created.error) throw new Error('创建云端书籍失败，请重试。');
      } else if (!['uploading','ready'].includes(exists.data.state)) throw new Error('书籍正在删除，请刷新书架。');
      const content = new Blob([book.paragraphs.join('\n')],{type:'text/plain'});
      if (content.size > 10 * 1024 * 1024) throw new Error('转换后的文本超过云端大小限制。');
      const uploaded = exists.data?.state === 'ready' ? {error:{message:'already exists'}} : await this.client.storage.from('reader-books').upload(path,content,{contentType:'text/plain',upsert:false});
      if (uploaded.error && !/already exists|duplicate/i.test(uploaded.error.message || '')) throw new Error('云端上传失败，请检查网络后重试。');
      // A duplicate is accepted only when the existing bytes match the intended file.
      if (uploaded.error) {
        const existing = await this.client.storage.from('reader-books').download(path);
        if (existing.error || await existing.data.text() !== await content.text()) throw new Error('云端文件与待上传内容不一致，请联系管理员处理。');
      }
      if (exists.data?.state === 'ready') {
        const progress = await this.client.from('reader_progress').select('version').eq('owner_id',this.userId).eq('book_id',book.id).maybeSingle();
        if (progress.error) throw new Error('无法确认云端进度，请重试。');
        if (progress.data) {
          this.versions.set(book.id, Number(progress.data.version));
          if (!previous?.queue) { await this.pending?.remove(book.id); return; }
        }
      } else {
        const ready = await this.client.from('reader_books').update({state:'ready'}).eq('id',book.id).eq('owner_id',this.userId).eq('state','uploading').select('id').maybeSingle();
        if (ready.error || !ready.data) throw new Error('上传完成，但书籍状态未确认；请重试。');
      }
      if (!this.versions.has(book.id)) this.versions.set(book.id,0);
    }
    const saved = await this.pending?.get(book.id);
    let queue = this.operations.get(book.id) || saved?.queue;
    const snapshot = {index:book.position.index,ratio:book.position.ratio,progress:book.progress};
    queue = enqueueProgress(queue,this.versions.get(book.id),snapshot);
    this.operations.set(book.id,queue);
    await this.pending?.put(book.id,{queue});
    while (queue) {
      const point=queue.inFlight.snapshot;
      const result = await this.client.rpc('save_reader_progress',{p_book_id:book.id,p_expected_version:queue.version,p_operation_id:queue.inFlight.id,p_index:point.index,p_ratio:point.ratio,p_progress:point.progress});
      if (result.error || !result.data?.length) throw new Error('阅读进度同步失败，已保留本机待同步记录，请重试。');
      const row = result.data[0];
      if (!row.accepted) {
        this.conflict = {id:book.id, ...row};
        throw new Error(`进度冲突：云端为 ${Math.round(row.progress)}%，本机为 ${Math.round(book.progress)}%。请先处理冲突。`);
      }
      this.versions.set(book.id,Number(row.version));
      queue=acknowledgeProgress(queue,Number(row.version));
      if(queue) {this.operations.set(book.id,queue);await this.pending?.put(book.id,{queue});}
      else {this.operations.delete(book.id);await this.pending?.remove(book.id);}
    }
  }
  async remove(id) {
    const marked = await this.client.from('reader_books').update({state:'deleting'}).eq('id',id).eq('owner_id',this.userId).select('id').maybeSingle();
    if (marked.error) throw new Error('无法标记云端删除，请重试。');
    if (!marked.data) {
      const existing = await this.client.from('reader_books').select('id').eq('id',id).eq('owner_id',this.userId).maybeSingle();
      if (existing.error || existing.data) throw new Error('无法确认云端删除状态，请重试。');
      this.versions.delete(id); this.operations.delete(id); await this.pending?.remove(id); return;
    }
    const removed = await this.client.storage.from('reader-books').remove([this.path(id)]);
    if (removed.error) throw new Error('云端文件删除失败，请重试。');
    const record = await this.client.from('reader_books').delete().eq('id',id).eq('owner_id',this.userId);
    if (record.error) throw new Error('文件已删除，书架记录待清理，请重试。');
    this.versions.delete(id); this.operations.delete(id);
    await this.pending?.remove(id);
  }
}
