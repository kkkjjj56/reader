import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEmail, CloudAuth} from '../js/CloudAuth.js';
test('邮箱格式检查', () => {
  assert.equal(normalizeEmail(' student@domain.org '),'student@domain.org');
  for (const value of ['abc','a@b','a b@example.org']) assert.throws(()=>normalizeEmail(value));
});
test('邮箱密码注册与登录交给 Supabase', async () => {
  const calls=[];const client={auth:{signUp:async x=>(calls.push(x),{data:{session:{}},error:null}),signInWithPassword:async x=>(calls.push(x),{data:{user:{}},error:null})}};
  const auth=new CloudAuth(client);await auth.register('student@domain.org','testpass1');await auth.login('student@domain.org','testpass1');
  assert.deepEqual(calls.map(x=>x.email),['student@domain.org','student@domain.org']);assert.equal(Object.hasOwn(auth,'password'),false);
});
test('邮箱确认开启时返回待确认结果',async()=>{
 const auth=new CloudAuth({auth:{signUp:async()=>({data:{session:null},error:null})}});
 assert.equal((await auth.register('student@domain.org','testpass1')).session,null);
});

