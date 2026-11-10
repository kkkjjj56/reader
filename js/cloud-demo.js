const $ = id => document.getElementById(id);
let mode = 'login';
let books = [];
let uploadTimer;
const initialBooks = () => [
  {title:'河边散记', author:'示例书籍 · 随笔', progress:36, icon:'河'},
  {title:'山间来信', author:'示例书籍 · 散文', progress:72, icon:'山'},
  {title:'漫长的午后', author:'示例书籍 · 小说', progress:0, icon:'午'}
];
function setMode(next) {
  mode = next;
  $('login-tab').setAttribute('aria-selected', String(mode === 'login'));
  $('register-tab').setAttribute('aria-selected', String(mode === 'register'));
  $('form-title').textContent = mode === 'login' ? '欢迎回来' : '开始新的阅读旅程';
  $('form-subtitle').textContent = mode === 'login' ? '登录后，继续你的阅读时光。' : '创建一个模拟账号，看看云端书架。';
  $('auth-submit').replaceChildren(document.createTextNode(mode === 'login' ? '模拟登录 ' : '模拟注册并进入 '));
  const arrow = document.createElement('span'); arrow.textContent = '→'; $('auth-submit').append(arrow);
}
$('login-tab').onclick = () => setMode('login');
$('register-tab').onclick = () => setMode('register');
$('auth-form').onsubmit = event => {
  event.preventDefault();
  const name = $('username').value.trim();
  if (!name || !$('password').value) return;
  $('display-name').textContent = name;
  $('password').value = ''; $('username').value = '';
  books = initialBooks(); renderBooks(); $('notice').hidden = true;
  $('auth-screen').hidden = true; $('shelf-screen').hidden = false;
};
function renderBooks() {
  const grid = $('book-grid'); grid.replaceChildren();
  for (const book of books) {
    const card = document.createElement('article'); card.className = 'book-card';
    const icon = document.createElement('div'); icon.className = 'book-icon'; icon.textContent = book.icon;
    const title = document.createElement('h3'); title.textContent = book.title;
    const desc = document.createElement('p'); desc.textContent = book.author;
    const row = document.createElement('div'); row.className = 'book-progress';
    const label = document.createElement('span'); label.textContent = book.progress ? '上次阅读进度' : '尚未开始';
    const percent = document.createElement('span'); percent.textContent = `${book.progress}%`;
    const bar = document.createElement('div'); bar.className = 'bar'; const fill = document.createElement('span'); fill.style.width = `${book.progress}%`; bar.append(fill); row.append(label, percent); card.append(icon,title,desc,row,bar); grid.append(card);
  }
}
function startUpload() {
  $('import-demo').disabled = true;
  const notice = $('notice'); notice.className = 'notice'; notice.hidden = false;
  notice.textContent = '正在模拟上传《午后阅读》… 这一过程不会选择或上传真实文件。';
  clearTimeout(uploadTimer);
  uploadTimer = setTimeout(() => {
    notice.replaceChildren(); const text = document.createElement('span'); text.textContent = '模拟上传中。选择一个结果，体验对应提示：';
    const success = document.createElement('button'); success.textContent = '模拟成功'; success.onclick = uploadSuccess;
    const failure = document.createElement('button'); failure.textContent = '模拟失败'; failure.onclick = uploadFailure;
    const actions = document.createElement('div'); actions.className = 'state-actions'; actions.append(text,success,failure); notice.append(actions);
  }, 700);
}
function uploadSuccess() {
  if (!books.some(book => book.title === '午后阅读')) books.unshift({title:'午后阅读',author:'模拟导入 · 示例书籍',progress:0,icon:'书'});
  renderBooks(); $('notice').className = 'notice'; $('notice').textContent = '模拟上传完成：《午后阅读》已加入演示书架。'; $('import-demo').disabled = false;
}
function uploadFailure() {
  const notice = $('notice'); notice.className = 'notice error'; notice.replaceChildren();
  const label = document.createElement('span'); label.textContent = '模拟上传失败：网络暂不可用，书籍尚未加入书架。';
  const retry = document.createElement('button'); retry.textContent = '重试'; retry.onclick = startUpload;
  const cancel = document.createElement('button'); cancel.textContent = '取消'; cancel.onclick = () => { notice.hidden = true; $('import-demo').disabled = false; };
  notice.append(label,retry,cancel); $('import-demo').disabled = false;
}
$('import-demo').onclick = startUpload;
$('signout').onclick = () => { clearTimeout(uploadTimer); $('import-demo').disabled = false; $('shelf-screen').hidden = true; $('auth-screen').hidden = false; $('notice').hidden = true; books = []; $('display-name').textContent = ''; setMode('login'); };
