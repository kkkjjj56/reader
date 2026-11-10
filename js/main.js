import { ReaderApp } from './ReaderApp.js';
import { setupCloud } from './CloudUI.js';

const app = new ReaderApp();
app.start().then(() => setupCloud(app)).catch(() => app.view.message('启动失败，请刷新页面重试。', true));
