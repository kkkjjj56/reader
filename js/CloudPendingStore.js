// Pending cloud work is isolated by account. It is never submitted under a different user.
export class CloudPendingStore {
  constructor(userId, factory = indexedDB) { this.userId=userId; this.factory=factory; }
  async open() {
    if (this.db) return;
    this.db = await new Promise((resolve,reject)=>{
      const request=this.factory.open('one-page-cloud-pending',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('pending',{keyPath:'key'});
      request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('无法打开云端待同步记录，请关闭其他标签页后重试。'));
    });
  }
  async transaction(mode,operation) {
    await this.open();
    return new Promise((resolve,reject)=>{const tx=this.db.transaction('pending',mode);let result;try{result=operation(tx.objectStore('pending'));}catch(error){reject(error);return;}tx.oncomplete=()=>resolve(result?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('待同步记录保存中断。'));});
  }
  key(bookId){return `${this.userId}:${bookId}`;}
  async put(bookId,value){return this.transaction('readwrite',store=>store.put({key:this.key(bookId),owner:this.userId,bookId,...structuredClone(value)}));}
  async get(bookId){return this.transaction('readonly',store=>store.get(this.key(bookId)));}
  async remove(bookId){return this.transaction('readwrite',store=>store.delete(this.key(bookId)));}
  async list(){const all=await this.transaction('readonly',store=>store.getAll());return all.filter(item=>item.owner===this.userId);}
}
