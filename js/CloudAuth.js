export function normalizeEmail(value) {
  const email = value.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('请输入有效的邮箱地址。');
  return email;
}
export class CloudAuth {
  constructor(client) { this.client = client; }
  async register(email,password) {
    email = normalizeEmail(email);
    if (password.length < 8) throw new Error('密码至少需要 8 个字符。');
    const {data,error} = await this.client.auth.signUp({email,password});
    if (error) throw new Error('注册失败，请检查邮箱、密码或网络。');
    return data;
  }
  async login(email,password) {
    email = normalizeEmail(email);
    const {data,error} = await this.client.auth.signInWithPassword({email,password});
    if (error) throw new Error('登录失败：邮箱或密码有误，或网络不可用。');
    return data;
  }
  async logout() { const {error} = await this.client.auth.signOut(); if (error) throw new Error('退出失败，请检查网络后重试。'); }
}
