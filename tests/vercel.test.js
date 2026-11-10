import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleExplain} from '../api/explain.js';
import {spawnSync} from 'node:child_process';
import {readdir,readFile} from 'node:fs/promises';
function response() { return {status:null,body:'',writeHead(s,h){this.status=s;this.headers=h;},end(b){this.body=b;}}; }
test('Vercel 接口只接受同源 HTTPS 和用户提供的密钥', async()=>{
 let upstream=0;
 const fetchImpl=async(url,options)=>{upstream++;assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(options.headers.Authorization,'Bearer test-key');return {ok:true,json:async()=>({choices:[{message:{content:'模拟回答'}}]})};};
 const base={method:'POST',headers:{host:'reader.vercel.app',origin:'https://reader.vercel.app','content-type':'application/json','x-deepseek-key':'test-key'},body:{text:'自编选文'}};
 let res=response();await handleExplain(base,res,{fetchImpl});assert.equal(res.status,200);assert.deepEqual(JSON.parse(res.body),{answer:'模拟回答'});assert.doesNotMatch(res.body,/test-key/);assert.equal(res.headers['Cache-Control'],'no-store');
 for(const request of [{...base,headers:{...base.headers,origin:'https://evil.example'}},{...base,headers:{...base.headers,origin:'http://reader.vercel.app'}},{...base,method:'GET'}]) {res=response();await handleExplain(request,res,{fetchImpl});assert.equal(res.status,403);}
 res=response();await handleExplain({...base,headers:{...base.headers,'x-deepseek-key':''}},res,{fetchImpl});assert.equal(res.status,400);
 res=response();await handleExplain({...base,body:{text:'x',url:'https://evil.example'}},res,{fetchImpl});assert.equal(res.status,400);assert.equal(upstream,1);
});
test('静态构建仅包含白名单文件，拒绝私密密钥作为公开配置',async()=>{
 const built=spawnSync(process.execPath,['scripts/build-static.js'],{env:{...process.env,SUPABASE_URL:'',SUPABASE_PUBLISHABLE_KEY:''},encoding:'utf8'});assert.equal(built.status,0);
 const root=await readdir('public');assert.deepEqual(root.sort(),['index.html','js','styles.css']);
 assert.doesNotMatch(await readFile('public/js/public-config.js','utf8'),/sb_secret_|service_role/);
 const bad=spawnSync(process.execPath,['scripts/build-static.js'],{env:{...process.env,SUPABASE_URL:'https://abc.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_secret_fake'},encoding:'utf8'});assert.notEqual(bad.status,0);
});
