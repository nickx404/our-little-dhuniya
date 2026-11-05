import {test} from 'node:test';
import assert from 'node:assert/strict';
import {confirmRemoval,deleteMemory} from '../dist/delete-entry.mjs';
import {initBucketList,readBucketList} from '../dist/bucket-list.mjs';

test('deleting requires confirmation and never mutates on cancel or missing ID',()=>{
 const items=[{id:'one',title:'Our wish'},{id:'two',title:'Another'}];
 assert.equal(confirmRemoval(items,'one',message=>{assert.match(message,/Our wish/);return false;}),null);
 assert.equal(items.length,2);
 assert.equal(confirmRemoval(items,'missing',()=>assert.fail('No confirmation for missing entry')),null);
 assert.deepEqual(confirmRemoval(items,'one',()=>true),[items[1]]);
});

test('deleting media unlinks all books; deleting a book keeps the media',()=>{
 const data={moments:[{id:'photo',caption:'A day'}],keepsakes:[{id:'ticket',caption:'A ticket'}],books:[{id:'book',title:'A book',ids:['photo'],keepsakeIds:['ticket']}]};
 const before=structuredClone(data);
 assert.equal(deleteMemory(data,'moments','photo',()=>false),false);
 assert.deepEqual(data,before);
 assert(deleteMemory(data,'moments','photo',()=>true));
 assert.deepEqual(data.books[0].ids,[]);
 assert(deleteMemory(data,'books','book',message=>{assert.match(message,/keepsakes stay/);return true;}));
 assert.deepEqual(data.keepsakes,before.keepsakes);
});

test('bucket deletion saves only after confirmation; storage failure preserves the entry',()=>{
 const original={document:globalThis.document,localStorage:globalThis.localStorage,window:globalThis.window};
 try{
  let click,raw=null,fail=false,accept=false,renders=0;
  const dialog={addEventListener(){}};
  globalThis.document={querySelector:()=>dialog,addEventListener:(name,handler)=>{if(name==='click')click=handler;}};
  globalThis.localStorage={getItem:()=>raw,setItem:(_,value)=>{if(fail)throw Error('Full');raw=value;}};
  globalThis.window={confirm:()=>accept};
  const list=initBucketList({escape:String,render:()=>renders++,toast(){}});
  const fire=()=>click({target:{closest:()=>({dataset:{journalDelete:'future',id:'train'}})}});
  fire();assert.equal(raw,null);assert.equal(renders,0);
  accept=true;fail=true;fire();assert.match(list.future(),/Take a train somewhere new/);assert.equal(renders,0);
  fail=false;fire();assert.equal(renders,1);
  assert(!readBucketList(localStorage).future.some(item=>item.id==='train'));
 }finally{Object.assign(globalThis,original);}
});
