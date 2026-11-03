import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Y,applyText,textChange,typingOrigin,remoteOrigin,encode,decode} from '../src/notes-model.mjs';
import 'fake-indexeddb/auto';
import {IndexeddbPersistence} from 'y-indexeddb';

test('every input, including spaces, deletions and emoji, produces exactly the requested text',()=>{
 const doc=new Y.Doc(), text=doc.getText('our-words');let updates=0;
 doc.on('update',()=>updates++);
 const inputs=['h','hi','hi ','hi  ','hi  \n','hi  \n♡','hi  \n🦦','hi  \n🐰','  hi  \n🐰\t','  hi  \n🐰','', 'a\r\nb'];
 for(const input of inputs){applyText(doc,text,input);assert.equal(text.toString(),input);}
 assert.equal(updates,inputs.length);
});
test('difference boundaries preserve surrogate pairs and whitespace',()=>{
 for(const [before,after] of [['🦦','🐰'],['a😀z','a😁z'],['  a\n','  a\n '],['word',''],['','\t \n']]){
  const {start,remove,insert}=textChange(before,after);
  assert.equal(before.slice(0,start)+insert+before.slice(start+remove),after);
 }
});
test('simultaneous edits converge even when updates arrive out of order or twice',()=>{
 const a=new Y.Doc(),b=new Y.Doc();
 applyText(a,a.getText('our-words'),'hello');Y.applyUpdate(b,Y.encodeStateAsUpdate(a),remoteOrigin);
 const updatesA=[],updatesB=[];
 a.on('update',(u,o)=>{if(o===typingOrigin)updatesA.push(u);});b.on('update',(u,o)=>{if(o===typingOrigin)updatesB.push(u);});
 applyText(a,a.getText('our-words'),'hello otter');applyText(b,b.getText('our-words'),'hello bunny');
 applyText(a,a.getText('our-words'),'hello otter  ');applyText(b,b.getText('our-words'),'hello bunny\n');
 for(const u of updatesA.toReversed())Y.applyUpdate(b,u,remoteOrigin);
 for(const u of updatesB.toReversed())Y.applyUpdate(a,u,remoteOrigin);
 for(const u of updatesA)Y.applyUpdate(b,u,remoteOrigin);
 assert.equal(a.getText('our-words').toString(),b.getText('our-words').toString());
 assert.match(a.getText('our-words').toString(),/otter/);assert.match(a.getText('our-words').toString(),/bunny/);
});
test('undo only removes this writer’s change and redo synchronizes',()=>{
 const a=new Y.Doc(),b=new Y.Doc(),ta=a.getText('our-words'),tb=b.getText('our-words');
 const undo=new Y.UndoManager(ta,{trackedOrigins:new Set([typingOrigin])});
 a.on('update',(u,o)=>{if(o!==remoteOrigin)Y.applyUpdate(b,u,remoteOrigin);});b.on('update',(u,o)=>{if(o!==remoteOrigin)Y.applyUpdate(a,u,remoteOrigin);});
 applyText(a,ta,'otter');applyText(b,tb,'otter & bunny');undo.undo();
 assert.match(ta.toString(),/bunny/);assert.equal(ta.toString(),tb.toString());undo.redo();
 assert.equal(ta.toString(),'otter & bunny');assert.equal(ta.toString(),tb.toString());
});
test('recovery state can be replayed after reconnect without duplicating text',()=>{
 const offline=new Y.Doc();applyText(offline,offline.getText('our-words'),' a thought \n  ');
 const saved=encode(Y.encodeStateAsUpdate(offline));const reopened=new Y.Doc();
 Y.applyUpdate(reopened,decode(saved),remoteOrigin);Y.applyUpdate(reopened,decode(saved),remoteOrigin);
 assert.equal(reopened.getText('our-words').toString(),' a thought \n  ');
});

test('offline inputs survive closing and reopening the actual persistence adapter',async()=>{
 const name=`notes-recovery-${crypto.randomUUID()}`;
 const a=new Y.Doc(), first=new IndexeddbPersistence(name,a);
 await first.whenSynced;
 for(const input of ['a','a ','a  ','a  \n','a  \n🐰'])applyText(a,a.getText('our-words'),input);
 await first.destroy();a.destroy();
 const b=new Y.Doc(), reopened=new IndexeddbPersistence(name,b);
 await reopened.whenSynced;
 assert.equal(b.getText('our-words').toString(),'a  \n🐰');
 await reopened.clearData();b.destroy();
});
