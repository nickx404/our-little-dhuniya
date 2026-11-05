import {api,mediaUrl} from './private-client.mjs';

const pause = milliseconds => new Promise(resolve=>setTimeout(resolve,milliseconds));
export async function checksum(blob) {
 const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
 return Array.from(new Uint8Array(hash), byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function initUploads({escape,toast,saved}) {
 let active = null, stopped = false, progress = '', pending = [];
 const panel = document.createElement('aside');
 panel.hidden=true;
 panel.className='transfer-panel';panel.setAttribute('aria-label','Our uploads');
 document.querySelector('#content').before(panel);
 function draw() {
  panel.innerHTML=`<p role="status" aria-live="polite">${escape(progress)}</p>${active?'<button type="button" data-pause>pause upload</button>':''}${pending.map(item=>`<div><span>${escape(item.title || item.name)}</span> <button type="button" data-resume="${item.id}">resume / check</button> <button type="button" data-cancel="${item.id}">cancel</button>${item.error?`<p>${escape(item.error)}</p>`:''}</div>`).join('')}`;
  panel.hidden=!progress&&!pending.length;
 }
 async function refresh() {
  pending=await api('/api/uploads');draw();
 }
 async function begin(file, values, id=crypto.randomUUID()) {
  if(active)throw new Error('Pause the current upload before starting another.');
  active=id;stopped=false;
  try {
   let state=await api('/api/uploads',{method:'POST',json:{id,name:file.name,size:file.size,...values,
    fingerprint:await checksum(file.slice(0,1024*1024))}});
   while(!stopped&&state.item.state==='uploading') {
    const part=state.parts.find(part=>part.state!=='sent');
    if(part?.state==='failed'||part?.state==='uncertain') {
     if(!window.confirm(`${state.item.error || 'A transfer needs checking.'}\n\nCheck the Telegram channel before retrying. A lost response can leave a duplicate Telegram post. Retry?`))break;
     state=await api(`/api/uploads/${id}/retry`,{method:'POST',json:{confirm_unknown:true}});continue;
    }
    if(part&&['queued','sending'].includes(part.state)) {
     progress=`Sending part ${part.number+1} to Telegram. You can keep browsing.`;draw();
     await pause(1500);state=await api(`/api/uploads/${id}`);continue;
    }
    const number=part?part.number:state.parts.length;
    const received=part?part.received:0;
    const position=number*state.part_size+received;
    const end=Math.min(position+state.chunk_size,(number+1)*state.part_size,file.size);
    const chunk=file.slice(position,end);
    if(!chunk.size)throw new Error('The upload record needs checking before continuing.');
    progress=`Uploading ${file.name} · ${Math.floor(position/file.size*100)}%`;draw();
    await api(`/api/uploads/${id}/parts/${number}`,{method:'PUT',headers:{'Upload-Offset':String(received),
     'Upload-Checksum':await checksum(chunk),'Content-Type':'application/octet-stream'},body:chunk});
    state=await api(`/api/uploads/${id}`);
   }
   if(state.item.state==='ready') {
    progress='';await saved();toast('Memory saved.');
   }else progress='Upload paused. Select the same file to resume.';
  } catch(error) {
   progress=error.message+' Select the same file to resume.';
   toast(error.message);
  } finally {
   active=null;await refresh().catch(()=>draw());
  }
 }
 panel.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-pause')){stopped=true;progress='Pausing after the current network chunk…';draw();return;}
  const id=button.dataset.resume || button.dataset.cancel;
  try {
   if(button.dataset.cancel) {
    if(!window.confirm('Cancel this upload? Parts already stored in Telegram will be kept.'))return;
    await api(`/api/uploads/${id}`,{method:'DELETE'});await refresh();return;
   }
   const state=await api(`/api/uploads/${id}`);
   if(state.item.state==='ready'){await saved();await refresh();return;}
   const input=document.createElement('input');input.type='file';
   input.addEventListener('change',()=>{
    const file=input.files[0];if(!file)return;
    begin(file,{title:state.item.title,caption:state.item.caption,day:state.item.day,tags:state.item.tags},id).catch(error=>toast(error.message));
   },{once:true});
   input.click();
  }catch(error){toast(error.message);}
 });
 refresh().catch(error=>toast(error.message));
 return {begin,refresh};
}

export async function loadMemories() {
 const rows=await api('/api/items');
 return Promise.all(rows.map(async row=>{
  const url=await mediaUrl(row.id);
  return {...row,stored:true,date:row.day,story:row.caption,caption:row.title || row.name,
   description:row.caption,src:row.kind==='photo'?url:'',video:url,url};
 }));
}
