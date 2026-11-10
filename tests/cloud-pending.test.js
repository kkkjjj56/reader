import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import {CloudPendingStore} from '../js/CloudPendingStore.js';
test('待同步记录持久化并按账号隔离',async()=>{
 const a=new CloudPendingStore('account-a',indexedDB), b=new CloudPendingStore('account-b',indexedDB);
 await a.put('book',{position:{index:4,ratio:0.2},version:2}); await b.put('book',{position:{index:9,ratio:0.1},version:1});
 assert.equal((await a.get('book')).position.index,4); assert.equal((await b.list()).length,1);
 await a.remove('book');assert.equal(await a.get('book'),undefined);assert.equal((await b.get('book')).position.index,9);
});
