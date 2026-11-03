import * as Y from 'yjs';

export const typingOrigin = 'typing';
export const remoteOrigin = 'remote';

// Textarea and Y.Text both use UTF-16 offsets. Keep whole surrogate pairs together.
export function textChange(before, after) {
 let start=0, suffix=0;
 while(start<before.length && start<after.length && before[start]===after[start])start++;
 if(start && /[\uD800-\uDBFF]/.test(before[start-1]))start--;
 while(suffix<before.length-start && suffix<after.length-start && before[before.length-1-suffix]===after[after.length-1-suffix])suffix++;
 if(suffix && /[\uDC00-\uDFFF]/.test(before[before.length-suffix]))suffix--;
 return {start,remove:before.length-start-suffix,insert:after.slice(start,after.length-suffix)};
}
export function applyText(doc,text,value) {
 const change=textChange(text.toString(),value);
 doc.transact(()=>{
  if(change.remove)text.delete(change.start,change.remove);
  if(change.insert)text.insert(change.start,change.insert);
 },typingOrigin);
}
export function encode(bytes) {
 let binary='';
 for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 return btoa(binary);
}
export function decode(value) {
 return Uint8Array.from(atob(value),ch=>ch.charCodeAt(0));
}
export {Y};
