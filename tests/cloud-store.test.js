import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudLibraryStore} from '../js/CloudLibraryStore.js';
const user = '11111111-1111-4111-8111-111111111111';
function mockCloud({conflict=false}={}) {
  const state={rows:new Map(),files:new Map(),writes:[],progress:new Map()};
  const client={
    from(table) {
      let filters={}, action='select', payload;
      const q={select(){ if(action==='select') action='select'; return q;},eq(k,v){filters[k]=v;return q;},maybeSingle:async()=>{const row=state.rows.get(filters.id); if(action==='update' && row && row.owner_id===filters.owner_id) Object.assign(row,payload); return {data:row||null,error:null};},
        insert(value){state.rows.set(value.id,{...value});return Promise.resolve({error:null});},
        update(value){action='update';payload=value;return q;},
        delete(){action='delete';return q;},
        then(resolve){if(action==='update'){const row=state.rows.get(filters.id); if(row && row.owner_id===filters.owner_id){Object.assign(row,payload);resolve({data:row,error:null});}else resolve({data:null,error:null});} else if(action==='delete'){state.rows.delete(filters.id);resolve({error:null});}else resolve({data:[],error:null});}
      }; return q;
    },
    storage:{from(){return {upload:async(path,blob)=>{state.writes.push(path);state.files.set(path,blob);return {error:null};},download:async path=>({data:state.files.get(path),error:null}),remove:async paths=>{paths.forEach(p=>state.files.delete(p));return {error:null};}};}},
    rpc:async(name,args)=>({data:[conflict?{accepted:false,version:2,progress:70}:{accepted:true,version:1}],error:null})
  }; return {client,state};
}
test('保存书籍到用户路径并写入进度',async()=>{
  const {client,state}=mockCloud();const store=new CloudLibraryStore(client,user);
  await store.save({id:'book-a',title:'自编测试',encoding:'utf-8',paragraphs:['第一段','第二段'],position:{index:1,ratio:.2},progress:30});
  assert.deepEqual(state.writes,[`${user}/book-a.txt`]);assert.equal(state.rows.get('book-a').state,'ready');assert.equal(store.versions.get('book-a'),1);
});
test('进度版本冲突会保留服务器数据并提示',async()=>{
  const {client}=mockCloud({conflict:true});const store=new CloudLibraryStore(client,user);store.versions.set('book-a',1);
  await assert.rejects(store.save({id:'book-a',position:{index:0,ratio:0},progress:10}),/进度冲突/);
  assert.equal(store.versions.get('book-a'),1);assert.equal(store.conflict.progress,70);
});

test('进度请求结果未知后重试使用同一操作编号',async()=>{
 const {client}=mockCloud();let calls=[];client.rpc=async(name,args)=>{calls.push(args);return calls.length===1?{data:null,error:{message:'network'}}:{data:[{accepted:true,version:2}],error:null};};
 const store=new CloudLibraryStore(client,user);store.versions.set('book-a',1);
 const book={id:'book-a',position:{index:3,ratio:.5},progress:40};
 await assert.rejects(store.save(book),/同步失败/);await store.save(book);
 assert.equal(calls[0].p_operation_id,calls[1].p_operation_id);assert.equal(calls[1].p_expected_version,1);
});
test('删除完成后重复请求按已删除处理',async()=>{
 const {client,state}=mockCloud();const store=new CloudLibraryStore(client,user);
 state.rows.set('book-a',{id:'book-a',owner_id:user,state:'ready'});state.files.set(`${user}/book-a.txt`,new Blob(['自编文本']));
 await store.remove('book-a');assert.equal(state.rows.has('book-a'),false);assert.equal(state.files.size,0);
 await store.remove('book-a');assert.equal(state.rows.has('book-a'),false);
});
