import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readBucketList,validBucketList} from './dist/bucket-list.mjs';
const seed=readBucketList({getItem:()=>null});
assert(validBucketList(seed));
assert.deepEqual(readBucketList({getItem:()=>JSON.stringify(seed)}),seed);
assert.throws(()=>readBucketList({getItem:()=>'{broken'}));
assert.throws(()=>readBucketList({getItem:()=>{throw Error('Unavailable');}}));
assert(!validBucketList({future:[{...seed.future[0],done:'yes'}]}));
assert(!validBucketList({future:[seed.future[0],seed.future[0]]}));
assert(!validBucketList({future:[{...seed.future[0],title:' '}]}));
assert(!validBucketList({future:[{...seed.future[0],story:'x'.repeat(2001)}]}));
assert(validBucketList({future:[]}));
const html=readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
assert.deepEqual([...html.matchAll(/data-nav="([^"]+)"/g)].map(m=>m[1]),['moments','books','keepsakes','future']);
for(const name of ['index.html','app.js','bucket-list.mjs','bucket-list.css']){
 const source=readFileSync(new URL(`./dist/${name}`,import.meta.url),'utf8');
 assert(!/renderHome|renderJourney|renderWorld|#journey|#world|#home|our little world|our journey/i.test(source),`Unpublished feature in ${name}`);
}
console.log('Bucket-list checks passed: storage, invalid input, release navigation, and unpublished-page exclusion.');
