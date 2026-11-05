import {confirmRemoval} from './delete-entry.mjs';
const storageKey='for-us-bucket-list-v1';
const seed={future:[
  {id:'train',title:'Take a train somewhere new',story:'Window seats. A shared playlist. No rush to get there.',kind:'adventures',timing:'someday',done:false},
  {id:'pancakes',title:'Make a very slow Sunday breakfast',story:'Pancakes that might be a little wonky. Coffee exactly how you like it.',kind:'little dates',timing:'soon',done:false},
  {id:'flowers-together',title:'Bring home flowers for no reason',story:'Because an ordinary Tuesday deserves something pretty, too.',kind:'little dates',timing:'someday',done:true},
  {id:'home',title:'A tiny home full of our things',story:'Books, plants, your favourite mug, and room for both of us.',kind:'big dreams',timing:'someday',done:false},
  {id:'stars',title:'Stay up to see the stars',story:'A blanket, something warm to drink, and a sky far away from the city.',kind:'adventures',timing:'someday',done:false}
]};
const kinds=['adventures','little dates','big dreams'];
export function validBucketList(data) {
 return Boolean(data && Array.isArray(data.future) && data.future.every(item =>
  item && typeof item.id==='string' && typeof item.title==='string' && item.title.trim() && item.title.length<=120 && typeof item.story==='string' && item.story.length<=2000 && kinds.includes(item.kind) && ['soon','someday'].includes(item.timing) && typeof item.done==='boolean'
 ) && new Set(data.future.map(item=>item.id)).size===data.future.length);
}
export function readBucketList(storage) {
 const raw=storage.getItem(storageKey);
 if(raw===null)return structuredClone(seed);
 const data=JSON.parse(raw);
 if(!validBucketList(data))throw new Error('Invalid saved wishes');
 return data;
}
export function initBucketList({escape:e, render, toast}) {
 let data, blocked = false, warning = '';
 try { data = readBucketList(localStorage); }
 catch { data = structuredClone(seed); blocked = true; warning = 'Your saved notes could not be read. Sample pages are shown; existing saved notes have been left untouched. New notes cannot be saved until browser storage is available.'; }
 let futureFilter = 'all';
 const dialog = document.querySelector('#journal-dialog');
 const note = () => `<p class="local-note">${e(warning || 'Your wishes stay in this browser. They do not sync between devices. Sample wishes are shown to start.')}</p>`;
 const add = (section,label) => `<button class="rose-button" data-journal-add="${section}">＋ ${label}</button>`;
 const edit = (section,item) => `<button class="text-button edit-note" data-journal-edit="${section}" data-id="${e(item.id)}" aria-label="Edit ${e(item.title)}">edit this little wish ↗</button>` + `<button class="text-button delete-entry" data-journal-delete="${section}" data-id="${e(item.id)}" aria-label="Delete ${e(item.title)}">delete</button>`;
 const empty = (section,text) => `<div class="journal-empty"><span aria-hidden="true">♡</span><h2>${text}</h2><p>A little room for whatever comes next.</p>${add(section,'make a wish')}</div>`;
 
 const saved = next => {
  if(blocked) { toast('Saved notes are unavailable. Your existing browser data has been left untouched.'); return false; }
  try { localStorage.setItem(storageKey,JSON.stringify(next)); data=next; warning=''; return true; }
  catch { warning='Browser storage is unavailable or full. Your change was not saved. Keep this form open and copy your text before leaving.'; toast(warning); return false; }
 };
 function filters(section,values,active) {
  return `<div class="journal-filters" role="group" aria-label="Wish filter">${values.map(([value,label])=>`<button data-journal-filter="${section}" data-filter="${value}" aria-pressed="${active===value}">${label}</button>`).join('')}</div>`;
 }
 function renderFuture() {
  const items=data.future.filter(w=>futureFilter==='all'||futureFilter==='done'&&w.done||futureFilter==='soon'&&!w.done&&w.timing==='soon'||futureFilter==='someday'&&!w.done&&w.timing==='someday');
  const done=data.future.filter(w=>w.done).length;
  return `<section aria-label="Our shared wishes"><div class="journal-toolbar"><p class="handwritten">${done?`${done} little ${done===1?'wish':'wishes'} already made real. `:''}the rest is waiting for us.</p>${add('future','make a wish')}</div>${filters('future',[['all','all our wishes'],['soon','a little sooner'],['someday','one day'],['done','we did it!']],futureFilter)}<div class="wish-wall">${items.length?items.map((item,i)=>`<article class="wish-paper ${item.done?'wish-done':''}" style="--tilt:${i%2?2:-2}deg"><div class="wish-top"><span>${e(item.kind)}</span><button class="wish-check" data-wish-toggle="${e(item.id)}" aria-pressed="${item.done}" aria-label="${item.done?'Mark as still dreaming':'Mark as done'}: ${e(item.title)}">${item.done?'✓':'<span aria-hidden="true">♡</span>'}</button></div><h2>${e(item.title)}</h2><p class="story-text">${e(item.story)}</p><div class="wish-bottom"><span class="handwritten">${item.done?'we did this, together.':item.timing==='soon'?'let’s make a little time.':'one day, you & me.'}</span>${edit('future',item)}</div></article>`).join(''):empty('future','No wishes on this page yet.')}</div>${note()}</section>`;
 }
 function openForm(section='future',id='') {
  const item=data.future.find(w=>w.id===id)||{};
  dialog.innerHTML=`<button class="close-button" data-journal-close aria-label="Close">×</button><span class="handwritten">make it a little more ours</span><h2 id="journal-title">Something to look forward to.</h2><p class="dialog-help">Saved in this browser only. You can come back and edit it.</p><form id="journal-form" data-id="${e(id)}"><label>Our little wish<input name="title" value="${e(item.title||'')}" required maxlength="120"></label><label>A little story<textarea name="story" maxlength="2000" placeholder="the details you want to remember...">${e(item.story||'')}</textarea></label><label>What kind of little thing?<select name="kind">${kinds.map(k=>`<option value="${k}" ${item.kind===k?'selected':''}>${k}</option>`).join('')}</select></label><label>When shall we dream of this?<select name="timing"><option value="someday" ${item.timing!=='soon'?'selected':''}>One day, no rush</option><option value="soon" ${item.timing==='soon'?'selected':''}>A little sooner</option></select></label><p class="form-error" id="journal-error" role="alert"></p><button class="rose-button" type="submit">${id?'save our changes':'keep this little wish'} ♡</button></form>`;
  dialog.showModal();
 }
 dialog.addEventListener('click',event=>{
  if(event.target.closest('[data-journal-close]'))dialog.close();
  if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}
 });
 dialog.addEventListener('submit',event=>{
  if(event.target.id!=='journal-form')return;
  event.preventDefault();
  const form=event.target, id=form.dataset.id, values=new FormData(form);
  const text=name=>String(values.get(name)||'').trim();
  const error=message=>{dialog.querySelector('#journal-error').textContent=message;};
  const item={id:id||crypto.randomUUID(),title:text('title'),story:text('story'),kind:text('kind'),timing:text('timing'),done:data.future.find(w=>w.id===id)?.done||false};
  const next=structuredClone(data);
  if(id)next.future=next.future.map(old=>old.id===id?item:old);else next.future.push(item);
  if(!validBucketList(next))return error('Give this wish a name up to 120 characters and check its fields.');
  if(!saved(next))return error(warning || 'Saved notes are unavailable. Please copy your text before closing.');
  futureFilter='all';
  dialog.close();location.hash='future';render();toast('Kept right here, in this browser. ♡');
 });
 document.addEventListener('click',event=>{
  const target=event.target.closest('button');if(!target)return;
  if(target.dataset.journalAdd)openForm(target.dataset.journalAdd);
  if(target.dataset.journalDelete){
   const section=target.dataset.journalDelete;
   if(!Array.isArray(data[section]))return;
   const remaining=confirmRemoval(data[section],target.dataset.id,message=>window.confirm(message));
   if(!remaining)return;
   const next=structuredClone(data);next[section]=remaining;
   if(saved(next)){render();toast('Entry deleted.');}
   return;
  }
  if(target.dataset.journalEdit)openForm(target.dataset.journalEdit,target.dataset.id);
  if(target.dataset.journalFilter){
   const section=target.dataset.journalFilter, filter=target.dataset.filter;
   futureFilter=filter;
   render();document.querySelector(`[data-journal-filter="${CSS.escape(section)}"][data-filter="${CSS.escape(filter)}"]`)?.focus();
  }
  if(target.dataset.wishToggle){
   const next=structuredClone(data), item=next.future.find(w=>w.id===target.dataset.wishToggle);if(!item)return;
   item.done=!item.done;
   if(saved(next)){render();document.querySelector(`[data-wish-toggle="${CSS.escape(item.id)}"]`)?.focus();toast(item.done?'One of our wishes, made real. ♡':'Back on our list of little dreams.');}
  }
 });
 return {future:renderFuture,add:()=>openForm()};
}
