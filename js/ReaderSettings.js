export class ReaderSettings {
  constructor(storage) {
    this.fontSize = 20;
    this.theme = 'light';
    try {
      this.storage = storage ?? localStorage;
      const saved = JSON.parse(this.storage.getItem('one-page-settings') || '{}');
      if (Number.isFinite(saved.fontSize)) this.fontSize = this.clamp(saved.fontSize);
      if (['light', 'dark'].includes(saved.theme)) this.theme = saved.theme;
    } catch { /* 设置损坏或存储被禁用时，使用默认值。 */ }
  }
  clamp(value) { return Math.max(14, Math.min(32, Math.round(value / 2) * 2)); }
  resize(delta) { this.fontSize = this.clamp(this.fontSize + delta); }
  toggleTheme() { this.theme = this.theme === 'light' ? 'dark' : 'light'; }
  save() {
    this.storage.setItem('one-page-settings', JSON.stringify({ fontSize: this.fontSize, theme: this.theme }));
  }
}
