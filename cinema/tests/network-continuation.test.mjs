import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/main.css',import.meta.url),'utf8');
function endingBlock(){
 const from=source.indexOf('function renderEnding(scene)');
 const to=source.indexOf('function asBriefText()',from);
 assert.ok(from>=0&&to>from);
 return source.slice(from,to);
}
test('MARCOSA continuation only appears in real finale/prototype finale',()=>{
 const ending=endingBlock();
 assert.match(ending,/area\.hidden=!\['open','seal','proto_final'\]\.includes\(scene\.id\)/);
 assert.match(ending,/if\(area\.hidden\)return/);
 assert.match(ending,/const marcosa=document\.createElement\('a'\)/);
 assert.match(ending,/area\.append\(marcosa\)/);
 assert.match(ending,/https:\/\/marcosa\.club\//);
 assert.match(ending,/target='_blank'/);
 assert.match(ending,/rel='noopener noreferrer'/);
 assert.ok(ending.indexOf("if(area.hidden)return")<ending.indexOf("area.append(marcosa)"));
});
test('outbound link is localized and no game state is included in URL',()=>{
 const ending=endingBlock();
 assert.match(ending,/ru:'ДРУГИЕ ИСТОРИИ/);
 assert.match(ending,/en:'EXPLORE MARCOSA STORIES/);
 assert.match(ending,/zh:'探索 MARCOSA 故事/);
 assert.match(ending,/не переда[чюи] прогресса|no progress shared/);
 assert.ok(!/URLSearchParams|state\.|userId|history\.|uuid|utm_/.test(ending.slice(ending.indexOf("const marcosa="),ending.indexOf("area.append(marcosa)")+18)),'no story state added to link');
 assert.match(css,/\.ending-actions \.network-continuation/);
 assert.match(css,/@media\(max-width:700px\)/);
});
