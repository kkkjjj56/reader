import { ReaderApp } from './ReaderApp.js';

const app = new ReaderApp();
app.start().catch(() => app.view.message('启动失败，请刷新页面重试。', true));
