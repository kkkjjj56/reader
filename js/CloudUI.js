import { createClient } from './supabase-client.js';
import { CloudAuth } from './CloudAuth.js';
import { CloudLibraryStore } from './CloudLibraryStore.js';

export function setupCloud(app) {
  const dialog = document.createElement('dialog'); dialog.className='cloud-dialog';
  dialog.innerHTML = `<form method="dialog"><button class="cloud-close" aria-label="关闭">×</button></form><h2>云端书架</h2><p>使用 Supabase 保存书籍与进度。此测试版暂不提供密码找回。</p><div id="cloud-config"><label>项目 URL<input id="cloud-url" type="url" placeholder="https://项目.supabase.co"></label><label>Publishable key<input id="cloud-key" type="text" autocomplete="off" placeholder="sb_publishable_... 或 anon key"></label><button type="button" id="cloud-connect">保存公开配置</button></div><div id="cloud-login" hidden><label>邮箱<input id="cloud-user" type="email" autocomplete="email" placeholder="输入邮箱地址"></label><label>密码<input id="cloud-pass" type="password" autocomplete="current-password"></label><div class="cloud-actions"><button type="button" id="cloud-signin">登录</button><button type="button" id="cloud-signup">注册</button></div><small>课堂演示不发送确认邮件，邮箱归属未经验证。请牢记密码，当前版本不提供自助找回。</small></div><div id="cloud-active" hidden><p>已登录：<strong id="cloud-name"></strong></p><div class="cloud-actions"><button type="button" id="cloud-open">打开云端书架</button><button type="button" id="cloud-migrate">选择本地书籍迁移</button><button type="button" id="cloud-logout">退出登录</button></div><div id="cloud-migration" hidden></div></div><p id="cloud-message" role="status" aria-live="polite"></p>`;
  document.body.append(dialog); const $=id=>dialog.querySelector('#'+id);
  let client,auth,store,user;
  const message = text => { $('cloud-message').textContent=text; };
  const fail = e => message(e?.message || '操作失败，请检查网络后重试。');
  function setView() { $('cloud-config').hidden=Boolean(client); $('cloud-login').hidden=!client||Boolean(user); $('cloud-active').hidden=!user; if(user) $('cloud-name').textContent=(user.email || '').replace(/^(.).*(.@.*)$/, '$1***$2'); }
  function configure(url,key) {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url) || !key) throw new Error('请输入 Supabase 项目 URL 和公开 key。');
    if (key.startsWith('sb_secret_')) throw new Error('请使用 publishable key，不能输入 secret key。');
    if (key.split('.').length===3) { try {const payload=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.role!=='anon') throw new Error('请使用 anon 或 publishable key。');} catch(e) {throw new Error('请使用有效的 anon 或 publishable key。');} }
    else if (!key.startsWith('sb_publishable_')) throw new Error('请使用 anon 或 publishable key。');
    client=createClient(url,key); auth=new CloudAuth(client); setView();
  }
  $('cloud-connect').onclick=async()=>{try {const url=$('cloud-url').value.trim(),key=$('cloud-key').value.trim();configure(url,key);localStorage.setItem('reader-cloud-config',JSON.stringify({url,key}));message('公开配置已保存，请注册或登录。');}catch(e){fail(e);}};
  async function authenticate(register) {try {const email=$('cloud-user').value,password=$('cloud-pass').value;const result=await (register?auth.register(email,password):auth.login(email,password));$('cloud-pass').value='';if(register && !result.session){message('注册请求已提交，但项目仍要求邮箱确认；请联系管理员检查配置。');return;}user=result.user;store=new CloudLibraryStore(client,user.id);setView();message('登录成功，可打开云端书架。');}catch(e){$('cloud-pass').value='';fail(e);}}
  $('cloud-signin').onclick=()=>authenticate(false); $('cloud-signup').onclick=()=>authenticate(true);
  async function switchStore(next,cloud) {
    await app.flush(); if(app.unsaved.size) throw new Error('当前书架仍有未保存内容，请先重试保存。');
    const loaded=await next.load(); app.clearAi(); app.current=null; app.view.showBook(null); app.store=next; app.cloudMode=cloud;app.books=loaded.books;app.libraryLoaded=true;app.renderShelf();
    document.querySelector('.shelf-heading h2').textContent=cloud?'云端书架':'本地书架';
    document.querySelector('.sidebar-foot').textContent=cloud?'云端书籍与进度属于当前账号':'书籍仅保存在此浏览器';
    const current=app.books.find(b=>b.id===loaded.lastId);if(current) await app.openBook(current);else app.view.message(cloud?'云端书架为空，可导入 TXT。':'本地书架已就绪。');
  }
  $('cloud-open').onclick=async()=>{try{await switchStore(store,true);dialog.close();}catch(e){fail(e);}};
  $('cloud-logout').onclick=async()=>{try{if(app.cloudMode) await switchStore(app.localStore,false); await auth.logout();user=null;store=null;setView();message('已退出登录。');}catch(e){fail(e);}};
  $('cloud-migrate').onclick=async()=>{try{
    const local=await app.localStore.load();const box=$('cloud-migration');box.replaceChildren();box.hidden=false;
    if(!local.books.length){box.textContent='本地书架没有书籍。';return;}
    const p=document.createElement('p');p.textContent='选择要上传的本地书籍，确认后将上传正文及当前进度；本地书籍会保留。';box.append(p);
    for(const book of local.books){const label=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.value=book.id;label.append(input,document.createTextNode(`${book.title} · ${Math.round(book.progress)}%`));box.append(label);}
    const button=document.createElement('button');button.type='button';button.textContent='确认上传所选书籍';box.append(button);
    button.onclick=async()=>{const chosen=[...box.querySelectorAll('input:checked')].map(i=>local.books.find(b=>b.id===i.value));if(!chosen.length){message('请先选择书籍。');return;}if(!confirm(`确认将 ${chosen.length} 本本地书籍及阅读进度上传到当前账号？`))return;button.disabled=true;let done=0;try{for(const b of chosen){const key=`reader-migration:${user.id}:${b.id}`;let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}await store.save({...b,id},false);done++;}message(`已上传 ${done} 本。本地书籍仍然保留。`);}catch(e){message(`已上传 ${done} 本；${e.message}。可重新选择后重试。`);}finally{button.disabled=false;}};
  }catch(e){fail(e);}};
  const entry=document.querySelector('.cloud-demo-entry');entry.href='#';entry.textContent='☁ 云端书架';entry.onclick=e=>{e.preventDefault();message('');setView();dialog.showModal();};
  const local=document.createElement('button');local.className='cloud-local-switch';local.textContent='切换到本地书架';entry.after(local);local.onclick=async()=>{try{await switchStore(app.localStore,false);}catch(e){app.view.message(e.message,true);}};
  try {const config=JSON.parse(localStorage.getItem('reader-cloud-config')||'null');if(config)configure(config.url,config.key);} catch { message('公开配置无效，请重新填写。'); }
}





