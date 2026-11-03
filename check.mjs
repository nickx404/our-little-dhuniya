import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const root=new URL('./dist/',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
const css=readFileSync(new URL('style.css',root),'utf8');
const js=readFileSync(new URL('app.js',root),'utf8');
for(const match of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g))assert(existsSync(new URL(match[1],root)),`Missing local asset: ${match[1]}`);
for(const name of ['sea','flowers','sunset','coffee','beach','mountains'])assert(existsSync(new URL(`assets/${name}.jpg`,root)),`Missing photo: ${name}`);
assert(css.includes('prefers-reduced-motion:reduce'));
assert(css.includes('@media(max-width:760px)'));
assert(js.includes('book.keepsakeIds'));
assert(!/[—]/.test(html+js),'Unexpected em dash in visible copy');
for(const cssFile of ['mali','patrick','typewriter']){
 const fontCss=readFileSync(new URL(`assets/${cssFile}.css`,root),'utf8');
 for(const font of fontCss.matchAll(/url\(\.\/([^)]+)\)/g))assert(existsSync(new URL(`assets/${font[1]}`,root)),`Missing font: ${font[1]}`);
}
console.log('Static checks passed: local assets, fonts, responsive and motion safeguards.');

await import('./bucket-list-check.mjs');
