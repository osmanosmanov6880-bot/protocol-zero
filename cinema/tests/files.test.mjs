import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,statSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
import {fullScenes} from '../story/scenes.mjs';import {prototypeScenes} from '../story/prototype.mjs';
const base=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const paths=['index.html','VIEW_OFFLINE.html','VIEW_PROTOTYPE_OFFLINE.html','src/app.mjs','story/engine.mjs','docs/CONCEPT.md','docs/STORYBOARD.md','docs/STYLE_BIBLE.md','docs/SHOT_PROMPTS.md','docs/AUDIO_CUES.md','docs/BRANCH_GRAPH.md'];
test('Deliverable files exist and have content',()=>{for(const p of paths){assert.ok(existsSync(resolve(base,p)),p);assert.ok(statSync(resolve(base,p)).size>200,p);}});
test('Fifteen full scenes and three prototype scenes are configured',()=>{assert.equal(fullScenes.length,15);assert.equal(prototypeScenes.length,3);});
test('All keyframes have desktop and mobile versions, with WEBP magic',()=>{
 const ids=new Set([...fullScenes,...prototypeScenes].map(x=>x.image));
 for(const id of ids)for(const kind of ['desktop','mobile']){
 const name=`assets/keyframes/${id}-${kind}.webp`,file=resolve(base,name);
 assert.ok(existsSync(file),name);const buffer=readFileSync(file);assert.equal(buffer.toString('latin1',0,4),'RIFF');assert.equal(buffer.toString('latin1',8,12),'WEBP');
 }
});
test('No paid third-party JS tags or remote scripts in the HTML',()=>{
 const html=readFileSync(resolve(base,'index.html'),'utf8');
 assert.doesNotMatch(html,/<script[^>]+src="https?:\/\//i);
 assert.match(html,/src="src\/app\.mjs"/);
});
test('Offline HTML embeds complete cinematic story and assets',()=>{
 const html=readFileSync(resolve(base,'VIEW_OFFLINE.html'),'utf8');
 assert.match(html,/data:image\/webp;base64,/);
 assert.match(html,/PROTOCOL_ZERO_DEBUG/);
 assert.ok(html.length>100_000);
});
