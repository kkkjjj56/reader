import {test,expect} from '@playwright/test';
test('云端入口显示公开配置和邮箱说明，本地书架仍可访问',async({page})=>{
 await page.goto('/');
 await page.getByRole('link',{name:'☁ 云端书架'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByText('项目 URL')).toBeVisible();
 await page.locator('#cloud-url').fill('https://abc.supabase.co');
 await page.locator('#cloud-key').fill('sb_publishable_test');
 await page.getByRole('button',{name:'保存公开配置'}).click();
 await expect(page.getByText('课堂演示不发送确认邮件，邮箱归属未经验证。请牢记密码，当前版本不提供自助找回。')).toBeVisible();
 await expect(page.getByLabel('邮箱')).toBeVisible();
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await expect(page.getByRole('button',{name:'切换到本地书架'})).toBeVisible();
});
test('模拟登录后切换书架并退出',async({page})=>{
 const id='11111111-1111-4111-8111-111111111111';
 const enc=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const token=`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}.signature`;
 await page.route('https://abc.supabase.co/**',async route=>{
  const url=route.request().url();
  if(url.includes('/auth/v1/token')) return route.fulfill({json:{access_token:token,refresh_token:'fake-refresh',token_type:'bearer',expires_in:3600,user:{id,email:'student@domain.org',aud:'authenticated'}}});
  if(url.includes('/auth/v1/logout')) return route.fulfill({status:204,body:''});
  if(url.includes('/rest/v1/reader_books')) return route.fulfill({json:[]});
  return route.fulfill({status:404,json:{message:'mock unexpected request'}});
 });
 await page.goto('/');await page.getByRole('link',{name:'☁ 云端书架'}).click();
 await page.locator('#cloud-url').fill('https://abc.supabase.co');await page.locator('#cloud-key').fill('sb_publishable_test');await page.getByRole('button',{name:'保存公开配置'}).click();
 await page.getByLabel('邮箱').fill('student@domain.org');await page.getByLabel('密码',{exact:true}).fill('testpass1');await page.getByRole('button',{name:'登录',exact:true}).click();
 await expect(page.getByText('登录成功，可打开云端书架。')).toBeVisible();await page.getByRole('button',{name:'打开云端书架'}).click();
 await expect(page.locator('.shelf-heading h2')).toHaveText('云端书架');
 await page.getByRole('link',{name:'☁ 云端书架'}).click();await page.getByRole('button',{name:'退出登录'}).click();
 await expect(page.getByText('已退出登录。')).toBeVisible();await expect(page.locator('.shelf-heading h2')).toHaveText('本地书架');
});


test('确认邮件开启时注册显示等待确认而不进入书架',async({page})=>{
 await page.route('https://abc.supabase.co/auth/v1/signup',route=>route.fulfill({json:{id:'11111111-1111-4111-8111-111111111111',email:'student@domain.org',aud:'authenticated'}}));
 await page.goto('/');await page.getByRole('link',{name:'☁ 云端书架'}).click();
 await page.locator('#cloud-url').fill('https://abc.supabase.co');await page.locator('#cloud-key').fill('sb_publishable_test');await page.getByRole('button',{name:'保存公开配置'}).click();
 await page.getByLabel('邮箱').fill('student@domain.org');await page.getByLabel('密码',{exact:true}).fill('testpass1');await page.getByRole('button',{name:'注册',exact:true}).click();
 await expect(page.getByText('注册请求已提交，但项目仍要求邮箱确认；请联系管理员检查配置。')).toBeVisible();await expect(page.getByRole('button',{name:'打开云端书架'})).toBeHidden();
});

