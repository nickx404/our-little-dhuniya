import {api,isPrivate} from './private-client.mjs';
import {IndexeddbPersistence} from 'y-indexeddb';
import {Y,typingOrigin,remoteOrigin,applyText,encode,decode} from './notes-model.mjs';

export function initNotes({escape:e,config,refresh}) {
 const client=isPrivate();
 let finishOpening;
 const ready=client?new Promise(resolve=>{finishOpening=resolve;}):Promise.resolve();
 let phase=client?'loading':'setup', message='', session=null, doc=null, text=null, undo=null, persistence=null, channel=null;
 let lastSeq=0;
 let generation=0, composing=false, deferred=[], retryTimer, busy=0, failed=false, catchingUp=false, editorReady=false;
 const editor=()=>document.querySelector('#shared-writing');
 const state=()=>document.querySelector('#notes-status');
 function status(value) {message=value;if(state())state().textContent=value;}
 function resize() {const el=editor();if(el){el.style.height='auto';el.style.height=`${Math.max(380,el.scrollHeight)}px`;}}
 function controls() {
  const back=document.querySelector('[data-notes-undo]'), forward=document.querySelector('[data-notes-redo]');
  if(back)back.disabled=!undo?.undoStack.length;if(forward)forward.disabled=!undo?.redoStack.length;
 }
 function reflect(origin) {
  const el=editor();
  if(el && origin!==typingOrigin && !composing){
   const start=Math.min(el.selectionStart,text.length),end=Math.min(el.selectionEnd,text.length);
   el.value=text.toString();el.setSelectionRange(start,end);
  }
  resize();controls();
 }
 function receive(payload) {
  if(!doc)return;
  if(composing){deferred.push(payload);return;}
  try {
   const el=editor(), focused=el===document.activeElement;
   const selection=focused?[Y.createRelativePositionFromTypeIndex(text,el.selectionStart),Y.createRelativePositionFromTypeIndex(text,el.selectionEnd)]:null;
   Y.applyUpdate(doc,decode(payload),remoteOrigin);
   if(selection && editor()){
    const positions=selection.map(pos=>Y.createAbsolutePositionFromRelativePosition(pos,doc)?.index??text.length);
    editor().setSelectionRange(...positions);
   }
  }catch{status('An update could not be read. Your words here are still intact.');}
 }
 function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer=setTimeout(()=>{if(phase==='ready'){if(editorReady)send(Y.encodeStateAsUpdate(doc),true);else catchUp(generation);}},3000);
 }
 async function send(bytes,recovery=false) {
  if(phase!=='ready'||!doc)return;
  const token=generation;
  const payload=encode(bytes);
  if(payload.length>262144){failed=true;status('This page is too large to sync. Keep it open and copy your words before leaving.');return;}
  busy++;status(navigator.onLine?'Saving…':'Offline · your words are waiting on this device.');
  try {
   await api('/api/notes', {method:'POST', json:{id:crypto.randomUUID(),payload}});
   if(token!==generation)return;
   if(recovery)failed=false;
  }catch {
   if(token!==generation)return;
   failed=true;scheduleRetry();
  }finally {
   if(token===generation){
    busy--;
    if(failed)status('Not synced yet · keeping a local recovery copy and retrying.');
    else if(!busy&&!catchingUp)status('Saved for both of us.');
   }
  }
 }
 async function catchUp(token) {
  if(catchingUp)return;
  catchingUp=true;status('Bringing our words together…');
  try {
   // shortcut: the update log is replayed on connection; add snapshots if long-term replay becomes slow.
   const initial=!editorReady;
   let cursor=lastSeq;
   while(token===generation){
    const data=await api('/api/notes?after='+cursor);
    for(const row of data){if(token!==generation)return;receive(row.payload);cursor=row.seq;}
    if(data.length<500)break;
   }
   if(token!==generation)return;
   lastSeq=cursor;editorReady=true;if(initial)refresh();
   // A full CRDT update also recovers edits made offline in an earlier session.
   if(initial)await send(Y.encodeStateAsUpdate(doc),true);
  }catch {
   if(token===generation){failed=true;status('Could not reach our shared page. Keeping your words here and retrying.');scheduleRetry();}
  }finally {if(token===generation){finishOpening?.();catchingUp=false;if(!busy&&!failed)status('Saved for both of us.');}}
 }
 async function connect(nextSession) {
  const token=++generation;
  clearTimeout(retryTimer);busy=0;failed=false;catchingUp=false;editorReady=false;deferred=[];composing=false;
  if(channel)clearInterval(channel);channel=null;lastSeq=0;
  if(persistence)await persistence.destroy();persistence=null;
  doc?.destroy();doc=null;text=null;undo=null;session=nextSession;
  phase='loading';refresh();
  doc=new Y.Doc();text=doc.getText('our-words');
  persistence=new IndexeddbPersistence(`for-us-notes-${config.url}-${session?.user.id||'public'}`,doc);
  try {await persistence.whenSynced;}catch{status('Local recovery is unavailable. Keep this page online while writing.');}
  if(token!==generation)return;
  undo=new Y.UndoManager(text,{trackedOrigins:new Set([typingOrigin])});
  for(const event of ['stack-item-added','stack-item-popped','stack-cleared'])undo.on(event,controls);
  phase='ready';
  doc.on('update',(update,origin)=>{
   reflect(origin);
   if(origin!==remoteOrigin)send(update);
  });
  status('Connecting our page…');refresh();
  await catchUp(token);
  channel=setInterval(()=>catchUp(token),2000);
 }
 if(client)setTimeout(()=>connect(null),0);
 document.addEventListener('input',event=>{
  if(event.target.id==='shared-writing'&&text){applyText(doc,text,event.target.value);resize();}
 });
 document.addEventListener('compositionstart',event=>{if(event.target.id==='shared-writing')composing=true;});
 document.addEventListener('compositionend',event=>{
  if(event.target.id!=='shared-writing')return;
  applyText(doc,text,event.target.value);composing=false;
  const pending=deferred;deferred=[];for(const payload of pending)receive(payload);
 });
 document.addEventListener('keydown',event=>{
  if(event.target.id!=='shared-writing'||composing)return;
  if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())){
   event.preventDefault();if(event.key.toLowerCase()==='y'||event.shiftKey)undo.redo();else undo.undo();reflect();
  }
 });
 document.addEventListener('click',event=>{
  const target=event.target.closest('button');if(!target)return;
  if(target.hasAttribute('data-notes-undo')){undo?.undo();reflect();editor()?.focus();}
  if(target.hasAttribute('data-notes-redo')){undo?.redo();reflect();editor()?.focus();}
 });
 window.addEventListener('online',()=>{if(phase==='ready'){catchUp(generation);send(Y.encodeStateAsUpdate(doc),true);}});
 window.addEventListener('resize',resize);
 function render() {
  if(phase==='setup')return '<section class="notes-gate"><h2>Our words have a private home.</h2><p><a href="'+e(config.privateSite)+'#notes">Open our private scrapbook</a> and enter our passcode.</p></section>';
  if(phase==='loading')return '<section class="notes-gate" aria-busy="true"><div class="notes-loading"></div><p>Opening our little page…</p></section>';
  return `<section class="writing-page" aria-label="Our shared writing page"><div class="writing-toolbar"><div role="group" aria-label="Writing history"><button data-notes-undo ${undo?.undoStack.length?'':'disabled'}>↶ undo</button><button data-notes-redo ${undo?.redoStack.length?'':'disabled'}>↷ redo</button></div><span id="notes-status" role="status" aria-live="polite">${e(message)}</span></div><label class="visually-hidden" for="shared-writing">Our words, automatically saved</label><textarea id="shared-writing" class="writing-paper" spellcheck="true" wrap="soft" placeholder="just start typing. I’m right here." ${editorReady?'':'disabled'}>${e(text?.toString()||'')}</textarea><div class="writing-footnote"><span>automatically saved · just for us.</span></div></section>`;
 }
 return {ready,render,mount(){resize();controls();}};
}
