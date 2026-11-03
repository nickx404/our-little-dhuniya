import {initNotes} from './notes.mjs';
import {notesConfig} from './notes-config.mjs';
import {initBucketList} from './bucket-list.mjs';
const asset = name => `./assets/${name}`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const flower = (className = '') => `<svg class="${className}" aria-hidden="true"><use href="#flower"/></svg>`;
const dateLabel = value => new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
const moments = [
 {id:'sea',kind:'photo',src:asset('sea.jpg'),caption:'Somewhere, just us.',date:'2026-07-18',story:'A whole afternoon with nowhere we needed to be. Just the water, the mountains, and a little more time together.'},
 {id:'flowers',kind:'photo',src:asset('flowers.jpg'),caption:'You said these were pretty.',date:'2026-08-02',story:'So we stopped. A little reminder to make time for the things that make you smile.'},
 {id:'sunset',kind:'video',src:asset('sunset.jpg'),video:'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',caption:'Stay a little longer.',date:'2026-08-16',story:'Sample video for trying the player. Your own video and its cover will live here.'},
 {id:'coffee',kind:'photo',src:asset('coffee.jpg'),caption:'Our kind of morning.',date:'2026-09-05',story:'Two coffees, a table by the window, and a conversation that somehow lasted all morning.'},
 {id:'beach',kind:'photo',src:asset('beach.jpg'),caption:'Salt in our hair.',date:'2026-07-19',story:'We brought a little sand home with us. And quite a few photographs.'},
 {id:'mountains',kind:'photo',src:asset('mountains.jpg'),caption:'Worth the long way round.',date:'2026-07-20',story:'The view was lovely. Having you there was the best part.'},
];
const keepsakes = [
 {id:'ticket',kind:'ticket',caption:'Our little movie night',date:'2026-08-09',story:'The ticket we kept, long after the credits. We talked about the ending all the way home.'},
 {id:'petal',kind:'flower',caption:'A flower from that walk',date:'2026-08-02',story:'Pressed between the pages so we could keep a little bit of that afternoon.'},
 {id:'letter',kind:'letter',caption:'Your little note',date:'2026-09-05',story:'“Saw this and thought of you. Like I do with most things.” A little note worth keeping.'},
];
const books = [
 {id:'summer',title:'Our little escape',date:'JULY 2026',cover:'sea.jpg',color:'#e6c3cf',tilt:'-3deg',ids:['sea','beach','mountains'],keepsakeIds:[]},
 {id:'ordinary',title:'The ordinary magic',date:'AUGUST · SEPTEMBER',cover:'coffee.jpg',color:'#d7e6ef',tilt:'2deg',ids:['coffee','flowers','sunset'],keepsakeIds:[]},
 {id:'soft',title:'Days like these',date:'SUMMER 2026',cover:'flowers.jpg',color:'#e0d4eb',tilt:'-2deg',ids:['flowers','beach'],keepsakeIds:[]},
];
let view = 'scrapbook';
let currentSection = 'moments';
let currentBook = null;
let pageIndex = 0;
let turning = false;
let toastTimer;
let turnTimer;
const objectUrls = [];
const content = document.querySelector('#content');
const viewer = document.querySelector('#viewer');
const addDialog = document.querySelector('#add-dialog');
const mobile = () => window.matchMedia('(max-width:760px)').matches;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion:reduce)').matches;

function toast(message) {
 const el = document.querySelector('#toast');
 el.textContent = message;
 el.classList.add('visible');
 clearTimeout(toastTimer);
 toastTimer = setTimeout(() => el.classList.remove('visible'), 3600);
}
function photoCard(moment, index) {
 const tilts = [-3,2,-2,4,2,-3];
 return `<article class="photo-card tape ${index%3===1?'lilac':index%3===2?'rose':''}" style="--tilt:${tilts[index%6]}deg">
 <button class="photo-open" data-open="${escape(moment.id)}" aria-label="Open ${escape(moment.caption)}">
 <img src="${escape(moment.src)}" alt="${escape(moment.caption)}" ${index>3?'loading="lazy"':''} width="600" height="700">
 ${moment.kind==='video'?'<span class="play" aria-hidden="true"></span><span class="duration">video</span>':''}</button>
 <div class="photo-caption">${escape(moment.caption)}</div><time class="photo-date" datetime="${moment.date}">${dateLabel(moment.date)}</time>
 ${index===0?'<svg class="card-heart" aria-hidden="true"><use href="#heart"/></svg>':index===3?flower('card-flower'):''}</article>`;
}
function bookCover(book) {
 return `<article class="book-wrap"><button class="book-cover" data-book="${book.id}" style="--cover:${book.color};--tilt:${book.tilt}" aria-label="Open ${book.title}"><div class="cover-photo"><img src="${asset(book.cover)}" alt="" loading="lazy" width="300" height="200"></div><div class="cover-title">${book.title}</div><span class="cover-date">${book.date}</span></button><p class="book-label">${book.title}<span>${book.ids.length} moments${book.keepsakeIds.length?` · ${book.keepsakeIds.length} keepsake${book.keepsakeIds.length>1?'s':''}`:''}</span></p></article>`;
}
function booksSection(full = false) {
 return `<section class="${full?'book-list-page':'books-section'}" aria-labelledby="books-title">${full?'<div class="section-intro"><span class="handwritten">some stories need a few more pages</span><h2 id="books-title">Our memory books</h2><p>Little collections of days we want to keep. Pick a cover, open it up, and stay for a while.</p></div>':'<div class="section-heading"><div><h2 id="books-title">Bound up in memories</h2><p class="subtitle">a few chapters of our favourite story</p></div><a href="#books" class="text-button">all our books ↗</a></div>'}<div class="books-grid">${books.map(bookCover).join('')}</div><p class="shelf-note">pick a book. turn a page. stay a little.</p></section>`;
}
function keepsakeObject(item) {
 if(item.src) return `<div class="cover-photo"><img src="${escape(item.src)}" alt="${escape(item.caption)}" style="height:auto;max-height:200px;object-fit:contain"></div>`;
 if(item.kind==='ticket') return '<div class="ticket"><div><small>ADMIT TWO</small><strong>you + me</strong><em>A LITTLE MOVIE NIGHT</em></div><span class="ticket-stub">09 AUG 2026</span></div>';
 if(item.kind==='flower') return `<div class="pressed-flower">${flower()}</div>`;
 return '<div class="letter-object">saw this &amp;<br>thought of you.<br><small>like I always do.</small></div>';
}
function keepsakesSection() {
 return `<section aria-labelledby="keepsakes-title"><div class="section-intro"><span class="handwritten">not much to anyone else. everything to us.</span><h2 id="keepsakes-title">The little things we kept</h2><p>A ticket, a flower, a scribbled note. A home for the tiny things with a whole story tucked inside.</p></div><div class="keepsake-grid">${keepsakes.map((item,i)=>`<article class="keepsake" style="--tilt:${i%2?-4:3}deg"><button data-keepsake="${item.id}" aria-label="Open ${escape(item.caption)}">${keepsakeObject(item)}</button><h3 class="keepsake-name">${escape(item.caption)}</h3><time class="keepsake-date" datetime="${item.date}">${dateLabel(item.date)}</time><button class="text-button" data-link="${item.id}">tuck into a memory book ↗</button></article>`).join('')}<div class="keepsake"><button class="keepsake-upload" data-action="add-keepsake"><span aria-hidden="true">＋</span>something worth keeping<small>add a little keepsake</small></button></div></div></section>`;
}
function render() {
 currentSection = ['moments','books','keepsakes','future','notes'].includes(location.hash.slice(1).split('/')[0]) ? location.hash.slice(1).split('/')[0] : 'moments';
 document.querySelectorAll('[data-nav]').forEach(el=>{
  el.classList.toggle('active',el.dataset.nav===currentSection);
  if(el.dataset.nav===currentSection) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
 });
 document.querySelector('.intro-note').textContent=currentSection==='future'?'there is still so much waiting for us.':'the big days. the ordinary days. all of it.';
 document.querySelector('#page-title').innerHTML=currentSection==='future'?'One day, <span>you & me.</span>':'A little collection <span>of us.</span>';
 document.querySelector('.intro-description').textContent=currentSection==='future'?'Little dates, big dreams, and all the things we want to do together.':'Our photos, our stories, and the little things we never want to forget.';
 document.title=`for us · ${document.querySelector(`[data-nav="${currentSection}"]`).textContent}`;
 document.querySelector('.add-button').hidden=currentSection==='notes';
 if(currentSection==='notes'){
  document.querySelector('.intro-note').textContent='nothing to do. just be here, with me.';
  document.querySelector('#page-title').innerHTML='A little room <span>for our words.</span>';
  document.querySelector('.intro-description').textContent='A thought, a whole conversation, or a little space between words.';
  content.innerHTML=notes.render();notes.mount();
 }
 else if(currentSection==='future') content.innerHTML = bucketList.future();
 else if(currentSection==='books') content.innerHTML = booksSection(true);
 else if(currentSection==='keepsakes') content.innerHTML = keepsakesSection();
 else content.innerHTML = `<section aria-labelledby="moments-title"><div class="section-heading"><div><h2 id="moments-title">Little moments, kept close</h2><p class="subtitle">even the blurry ones belong here.</p></div><div class="view-switch" role="group" aria-label="Photo layout"><button data-view="scrapbook" aria-pressed="${view==='scrapbook'}" class="${view==='scrapbook'?'active':''}">scrapbook</button><button data-view="gallery" aria-pressed="${view==='gallery'}" class="${view==='gallery'?'active':''}">gallery</button></div></div><div class="wall ${view==='gallery'?'gallery':''}">${moments.map((m,i)=>photoCard(m,i)).join('')}<aside class="little-note">“It's the little things<br>with you.”<small>always the little things.</small><div class="note-friends"><img src="${asset('otter-pixel.png')}" alt=""><img src="${asset('bunny-pixel.png')}" alt=""></div></aside><button class="photo-card add-photo" data-action="add" style="--tilt:-2deg"><span aria-hidden="true">＋</span><span>there's room for more.</span><small>add a moment</small></button></div></section>`;
}
function openViewer(html, className='') {
 viewer.className=className;
 viewer.innerHTML=html;
 if(!viewer.open) viewer.showModal();
}
function closeViewer() {
 viewer.querySelectorAll('video').forEach(v=>v.pause());
 clearTimeout(turnTimer);turning=false;currentBook=null;
 viewer.close();
}
function openMoment(id) {
 const m=moments.find(x=>x.id===id); if(!m) return;
 openViewer(`<button class="close-button" data-action="close" aria-label="Close memory">×</button>${m.kind==='video'?`<video controls playsinline preload="metadata" poster="${escape(m.src)}"><source src="${escape(m.video)}">Your browser cannot play this video.</video>`:`<img class="memory-image" src="${escape(m.src)}" alt="${escape(m.caption)}">`}<div class="memory-copy"><time datetime="${m.date}">${dateLabel(m.date)}</time><h2>${escape(m.caption)}</h2><p>${escape(m.story)}</p><button class="text-button" data-link-moment="${m.id}">add to a memory book ↗</button></div>`,'photo-viewer');
}
function openKeepsake(id) {
 const item=keepsakes.find(x=>x.id===id);if(!item)return;
 openViewer(`<button class="close-button" data-action="close" aria-label="Close keepsake">×</button><div class="viewer-keepsake">${keepsakeObject(item)}</div><div class="memory-copy"><time datetime="${item.date}">${dateLabel(item.date)}</time><h2>${escape(item.caption)}</h2><p>${escape(item.story)}</p><button class="text-button" data-link="${item.id}">tuck into a memory book ↗</button></div>`,'photo-viewer');
}
function bookPages(book) {
 const pages=[{type:'intro',moment:moments.find(m=>m.id===book.ids[0])},{type:'letter',text:'Some days are big adventures.\nSome days are just you and me, doing nothing much at all.\n\nI want to remember both.'}];
 for(const id of book.ids.slice(1)) {const moment=moments.find(m=>m.id===id);if(moment)pages.push({type:'photo',moment});}
 for(const id of book.keepsakeIds) {const item=keepsakes.find(k=>k.id===id);if(item)pages.push({type:'keepsake',item});}
 if(pages.length%2)pages.push({type:'ending'});
 return pages;
}
function pageMarkup(page,index,extra='') {
 let body='';
 if(page.type==='intro'||page.type==='photo') {
  const m=page.moment;
  body=`${page.type==='intro'?`<p class="page-note">${escape(currentBook.title)}</p>`:''}<figure class="page-polaroid tape"><button class="photo-open" data-book-media="${m.id}" aria-label="${m.kind==='video'?'Play video':'View photo'}: ${escape(m.caption)}"><img src="${escape(m.src)}" alt="${escape(m.caption)}">${m.kind==='video'?'<span class="play" aria-hidden="true"></span>':''}</button><figcaption>${escape(m.caption)}</figcaption></figure><p class="page-note">${dateLabel(m.date)}</p>${flower('page-decoration')}`;
 } else if(page.type==='letter') body=`<span class="handwritten">a little note for you</span><div class="page-letter">${escape(page.text)}<span class="sign-off">with you, always. ♡</span></div><div class="page-friends"><img src="${asset('otter-pixel.png')}" alt="Your otter"><img src="${asset('bunny-pixel.png')}" alt="Her bunny"></div>`;
 else if(page.type==='keepsake')body=`<span class="handwritten">a little thing we kept</span><div class="page-keepsake">${keepsakeObject(page.item)}</div><p class="page-note">${escape(page.item.caption)}</p>`;
 else body=`<div class="ending-page"><svg aria-hidden="true"><use href="#heart"/></svg><p>More pages.<br>More us.</p><span>to be continued, together.</span></div>`;
 return `<div class="book-page ${extra}">${body}<span class="page-number">${index+1}</span></div>`;
}
function renderReader() {
 const pages=bookPages(currentBook);const step=mobile()?1:2;
 pageIndex=Math.max(0,Math.min(pageIndex,pages.length-step));
 if(!mobile())pageIndex-=pageIndex%2;
 const title=currentBook.title;
 openViewer(`<div class="viewer-toolbar"><h2>${escape(title)}</h2><button class="close-button" data-action="close" aria-label="Close memory book">×</button></div><div class="book-reader"><div class="book-spread" id="book-spread">${pageMarkup(pages[pageIndex],pageIndex)}${!mobile()&&pages[pageIndex+1]?pageMarkup(pages[pageIndex+1],pageIndex+1):''}</div><div class="reader-controls"><button data-turn="-1" ${pageIndex===0?'disabled':''}>← previous</button><span aria-live="polite">${mobile()?`page ${pageIndex+1}`:`pages ${pageIndex+1} & ${pageIndex+2}`} of ${pages.length}</span><button data-turn="1" ${pageIndex+step>=pages.length?'disabled':''}>next →</button></div><p class="reader-hint">${mobile()?'swipe or tap to turn a page':'a little book, one page at a time'}</p></div>`,'book-viewer');
}
function openBook(id) {currentBook=books.find(b=>b.id===id);if(!currentBook)return;pageIndex=0;renderReader();}
function turnPage(direction) {
 if(turning||!currentBook)return;
 const step=mobile()?1:2;const pages=bookPages(currentBook);const next=pageIndex+direction*step;
 if(next<0||next>=pages.length)return;
 if(reduceMotion()){pageIndex=next;renderReader();return;}
 const spread=document.querySelector('#book-spread');
 const leaf=document.createElement('div');leaf.className=`page-turn ${direction<0?'backwards':''}`;
 const old=pageIndex;
 pageIndex=next;
 // Keep the old paper on top of the new spread while it turns.
 spread.innerHTML=pageMarkup(pages[next],next)+(!mobile()&&pages[next+1]?pageMarkup(pages[next+1],next+1):'');
 const fromIndex=direction>0?old+(mobile()?0:1):old;
 leaf.innerHTML=pageMarkup(pages[fromIndex],fromIndex);
 leaf.setAttribute('aria-hidden','true');leaf.inert=true;spread.append(leaf);turning=true;
 viewer.querySelectorAll('[data-turn]').forEach(b=>b.disabled=true);
 turnTimer=setTimeout(()=>{turning=false;renderReader();},850);
}
function chooseBook(id,kind) {
 const item=(kind==='keepsake'?keepsakes:moments).find(x=>x.id===id);if(!item)return;
 currentBook=null;
 openViewer(`<div class="viewer-toolbar"><h2>Which little book?</h2><button class="close-button" data-action="close" aria-label="Close book picker">×</button></div><div class="book-pick"><p class="dialog-help">“${escape(item.caption)}” stays in ${kind==='keepsake'?'Keepsakes':'your moments'}. The book uses the same item.</p>${books.map(book=>{const exists=(kind==='keepsake'?book.keepsakeIds:book.ids).includes(id);return `<button data-attach="${book.id}" data-item="${id}" data-kind="${kind}" ${exists?'disabled':''}>${book.title}<small>${exists?'already tucked inside':'add to this book'}</small></button>`;}).join('')}</div>`,'photo-viewer');
}
function updateUploadHint() {
 const keepsake=addDialog.querySelector('[name="kind"]').value==='keepsake';
 addDialog.querySelector('[name="file"]').accept=keepsake?'image/*':'image/*,video/*';
 document.querySelector('#file-prompt').textContent=keepsake?'Choose a photo or scan of your keepsake':'Choose a photo or video';
 document.querySelector('#upload-help').textContent=keepsake?'Photograph or scan a ticket, note, or object. Transparent PNG cutouts keep their clear background; other images keep their background. This preview does not remove backgrounds.':'';
}
addDialog.querySelector('[name="kind"]').addEventListener('change',updateUploadHint);
function showAdd(keepsake=false) {
 addDialog.querySelector('form').reset();
 addDialog.querySelector('[name="kind"]').value=keepsake?'keepsake':'photo';
 addDialog.querySelector('[name="date"]').value=new Intl.DateTimeFormat('en-CA').format(new Date());
 document.querySelector('#file-label').textContent='A call screenshot counts, too.';
 updateUploadHint();
 addDialog.showModal();
}
document.addEventListener('click',event=>{
 const target=event.target.closest('button,a');if(!target)return;
 if(target.dataset.view){view=target.dataset.view;render();return;}
 if(target.dataset.open){openMoment(target.dataset.open);return;}
 if(target.dataset.book){openBook(target.dataset.book);return;}
 if(target.dataset.keepsake){openKeepsake(target.dataset.keepsake);return;}
 if(target.dataset.turn){turnPage(Number(target.dataset.turn));return;}
 if(target.dataset.link){chooseBook(target.dataset.link,'keepsake');return;}
 if(target.dataset.linkMoment){chooseBook(target.dataset.linkMoment,'moment');return;}
 if(target.dataset.bookMedia){
  const m=moments.find(x=>x.id===target.dataset.bookMedia);
  if(m?.kind==='video'){
   const video=document.createElement('video');video.controls=true;video.playsInline=true;video.src=m.video;video.poster=m.src;video.style.height='210px';
   target.replaceWith(video);video.play().catch(()=>toast('Tap play to start this video.'));
  }else toast('A little moment, kept right here.');
  return;
 }
 if(target.dataset.attach){
  const book=books.find(b=>b.id===target.dataset.attach);const ids=target.dataset.kind==='keepsake'?book.keepsakeIds:book.ids;
  if(!ids.includes(target.dataset.item))ids.push(target.dataset.item);
  closeViewer();render();toast(`Tucked into “${book.title}”. Saved in this preview tab.`);return;
 }
 const action=target.dataset.action;
 if(action==='close'){if(target.closest('dialog')===viewer)closeViewer();else target.closest('dialog')?.close();}
 if(action==='add'&&currentSection==='future')bucketList.add();
 else if(action==='add'||action==='add-keepsake')showAdd(action==='add-keepsake');
 if(action==='about')openViewer('<button class="close-button" data-action="close" aria-label="Close">×</button><div class="about-copy"><span class="handwritten">a little space, just for us</span><h2>Every little thing belongs.</h2><p>This is our first visual prototype. The photographs, dates, and stories are sample content. The bunny is her; the otter is you.</p><p>You can explore books, turn pages, and try your own photos or keepsakes. Additions and book placements stay in this tab until you refresh. Bucket-list wishes and checkmarks are saved in this browser only. They do not sync between devices. Telegram, accounts, and shared storage will come later.</p><p>Photo samples: Unsplash. Video sample: MDN’s CC0 flower clip. Fonts: Mali and Patrick Hand (SIL Open Font License); Special Elite (Apache 2.0).</p></div>','photo-viewer');
});
document.querySelector('#add-form').addEventListener('submit',event=>{
 event.preventDefault();const data=new FormData(event.currentTarget);const file=data.get('file');const kind=data.get('kind');
 if(!(file instanceof File)||!file.size)return;
 if(!file.type.startsWith('image/')&&!file.type.startsWith('video/')){toast('Choose an image or video file.');return;}
 if(kind==='keepsake'&&file.type.startsWith('video/')){toast('Choose an image for a keepsake, or select “A video”.');return;}
 if(kind==='photo'&&file.type.startsWith('video/')){toast('Select “A video” for this file.');return;}
 if(kind==='video'&&!file.type.startsWith('video/')){toast('Choose a video, or select “A photograph”.');return;}
 const date=data.get('date');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){toast('Choose the day for this memory.');return;}
 const src=URL.createObjectURL(file);objectUrls.push(src);const id=crypto.randomUUID();
 const item={id,kind,src,caption:String(data.get('caption')).trim()||file.name.replace(/\.[^.]+$/,''),date,story:'A new little moment. Added in this preview tab.'};
 if(kind==='keepsake'){keepsakes.unshift(item);location.hash='keepsakes';}
 else{
  if(kind==='video'){item.video=src;item.src=asset('sunset.jpg');}
  moments.unshift(item);location.hash='moments';
 }
 addDialog.close();render();toast('Your little moment is here. Preview only until refresh.');
});
document.querySelector('[name="file"]').addEventListener('change',event=>{document.querySelector('#file-label').textContent=event.target.files[0]?.name||'A call screenshot counts, too.';});
viewer.addEventListener('cancel',event=>{event.preventDefault();closeViewer();});
viewer.addEventListener('close',()=>{viewer.querySelectorAll('video').forEach(v=>v.pause());clearTimeout(turnTimer);turning=false;currentBook=null;});
for(const dialog of [viewer,addDialog])dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom){dialog===viewer?closeViewer():dialog.close();}}});
document.addEventListener('keydown',event=>{if(viewer.open&&currentBook&&['ArrowRight','ArrowLeft'].includes(event.key)){event.preventDefault();turnPage(event.key==='ArrowRight'?1:-1);}});
let touchX=0,touchY=0;
viewer.addEventListener('touchstart',event=>{touchX=event.changedTouches[0].clientX;touchY=event.changedTouches[0].clientY;},{passive:true});
viewer.addEventListener('touchend',event=>{if(!currentBook||event.target.closest('video,button,input'))return;const dx=event.changedTouches[0].clientX-touchX,dy=event.changedTouches[0].clientY-touchY;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)turnPage(dx<0?1:-1);},{passive:true});
window.matchMedia('(max-width:760px)').addEventListener('change',()=>{if(currentBook&&!turning)renderReader();});
window.addEventListener('hashchange',render);
window.addEventListener('beforeunload',()=>objectUrls.forEach(url=>URL.revokeObjectURL(url)));
document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement){event.target.classList.add('image-error');event.target.alt='This photograph could not load.';}},true);
const notes=initNotes({escape,config:notesConfig,refresh:()=>{if(currentSection==='notes')render();}});
const bucketList=initBucketList({escape,render,toast});
render();
