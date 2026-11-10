import { TxtImporter } from './TxtImporter.js';
import { ReaderView } from './ReaderView.js';

export class ReaderApp {
  constructor() {
    this.importer = new TxtImporter();
    this.view = new ReaderView();
  }
  async start() {
    const input = document.getElementById('file-input');
    for (const id of ['import-button', 'welcome-import']) document.getElementById(id).onclick = () => input.click();
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        this.view.message('正在读取书籍…');
        const book = await this.importer.import(file, document.getElementById('encoding').value);
        this.view.showBook(book);
        this.view.message('导入成功，可以开始阅读');
      } catch (error) { this.view.message(error.message, true); }
      finally { input.value = ''; }
    };
  }
}
