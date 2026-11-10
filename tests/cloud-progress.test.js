import test from 'node:test';
import assert from 'node:assert/strict';
import {enqueueProgress,acknowledgeProgress,resolveProgressConflict} from '../js/CloudProgressQueue.js';
test('请求结果不确定时，重试原操作后才提交后续位置',()=>{
 let n=0;const id=()=>String(++n);const first={index:1},later={index:7};
 let q=enqueueProgress(null,3,first,id);q=enqueueProgress(q,3,later,id);
 assert.equal(q.inFlight.id,'1');assert.deepEqual(q.inFlight.snapshot,first);
 q=acknowledgeProgress(q,4,id);assert.equal(q.version,4);assert.equal(q.inFlight.id,'2');assert.deepEqual(q.inFlight.snapshot,later);
 assert.equal(acknowledgeProgress(q,5,id),null);
});
test('冲突时按用户选择保留云端或基于新版本提交本机进度',()=>{
 const q=enqueueProgress(null,1,{index:8},()=> 'old');const remote={version:3,index:2};
 assert.deepEqual(resolveProgressConflict(q,remote,'cloud'),{queue:null,position:remote});
 const local=resolveProgressConflict(q,remote,'local',()=> 'new');assert.equal(local.queue.version,3);assert.equal(local.queue.inFlight.id,'new');assert.equal(local.position.index,8);
});
