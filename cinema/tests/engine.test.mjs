import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {fullScenes,fullStart} from '../story/scenes.mjs';
import {prototypeScenes,prototypeStart} from '../story/prototype.mjs';
import {catalog,graphIssues,createState,advance,back,jump,discover,exportGenome,restoreState,getScene,DEFAULT_GENOME} from '../story/engine.mjs';

const route=(mode,choices)=>{let s=createState(mode);for(const item of choices)s=advance(s,item[0],item[1]??null,'ru');return s};
const reader=(src)=>new URL(src,import.meta.url);

test('15 full scenes are reachable with a valid narrative graph',()=>{assert.equal(fullStart,'signal');assert.equal(fullScenes.length,15);assert.deepEqual(graphIssues('full'),[])});
test('three-scene prototype has a valid two-way choice',()=>{assert.equal(prototypeStart,'proto_start');assert.equal(prototypeScenes.length,3);assert.deepEqual(graphIssues('prototype'),[]);
 for(const routeId of ['creator','observer']){const s=route('prototype',[['next'],[routeId]]);assert.equal(s.current,'proto_final');assert.equal(s.route,routeId);}
});
test('full narrative archive route reaches open ending',()=>{
 const s=route('full',[['enter'],['go'],['proof'],['record'],['anomaly'],['edda'],['genome'],['edit'],['hook','Новые идеи продолжают жить'],['see'],['verdict'],['open']]);
 assert.equal(s.current,'open');assert.equal(s.gene,'HOOK');assert.equal(s.verdict,'open');assert.equal(s.mutation.to,'Новые идеи продолжают жить');assert.equal(s.visited.length,13);
});
test('spectacle path reaches sealed ending without detours',()=>{
 const s=route('full',[['enter'],['go'],['worlds'],['curator'],['genome'],['edit'],['tone','Тёплый и выразительный'],['see'],['verdict'],['seal']]);
 assert.equal(s.current,'seal');assert.equal(s.route,'worlds');assert.equal(s.gene,'TONE');assert.equal(s.verdict,'seal');
});
test('state remembers past narrative positions and restores prior decisions on back',()=>{
 const s=route('full',[['enter'],['go'],['proof']]);const b=back(s);assert.equal(b.current,'threshold');assert.equal(b.route,null);assert.equal(b.visited.includes('corridor'),true);
});
test('archive can only travel to visited scenes',()=>{const s=route('full',[['enter'],['go'],['proof']]);assert.equal(jump(s,'signal').current,'signal');assert.throws(()=>jump(s,'edda'),/not unlocked/i)});
test('discovering an archive note only records the actual hotspot and never duplicates it',()=>{
 let s=createState('full');s=discover(s,'marker');s=discover(s,'marker');assert.deepEqual(s.found,['marker']);assert.throws(()=>discover(s,'made-up'),/Invalid fragment/);
});
test('single mutation cannot change immutable facts or be repeated in same lineage',()=>{
 let s=route('full',[['enter'],['go'],['proof'],['record'],['anomaly'],['edda'],['genome'],['edit']]);
 const original={...DEFAULT_GENOME};
 assert.throws(()=>advance(s,'hook','a'),/3–140/);
 assert.throws(()=>advance(s,'hook','<img src=x>'),/Markup/);
 s=advance(s,'hook','У новой идеи много наследников');
 assert.equal(s.mutation.gene,'HOOK');assert.equal(exportGenome(s).genome.HOOK,'У новой идеи много наследников');
 assert.equal(exportGenome(s).genome.AUDIENCE,original.AUDIENCE);assert.equal(exportGenome(s).genome.PROOF,original.PROOF);
 assert.equal(exportGenome(s).fictional,true);
});
test('all translations, images and interactive hotspots are available',()=>{
 const validScenes=[...fullScenes,...prototypeScenes];
 for(const scene of validScenes){
  for(const l of ['ru','en','zh']) for(const k of ['title','subtitle','eyebrow','voice'])assert.ok(scene[k]?.[l],`${scene.id} ${k} ${l}`);
  for(const dev of ['desktop','mobile']){
   const asset=reader(`../assets/keyframes/${scene.image}-${dev}.webp`);
   assert.ok(existsSync(asset),`${scene.id} ${dev}`);assert.ok(statSync(fileURLToPath(asset)).size>4000,scene.id);
  }
  for(const c of scene.choices)for(const l of ['ru','en','zh'])assert.ok(c.label?.[l],`${scene.id} ${l}`);
  for(const h of scene.hotspots){assert.ok(h.x>=5&&h.x<=95&&h.y>=5&&h.y<=95);for(const l of ['ru','en','zh'])assert.ok(h.note?.[l]);}
 }
});
test('reload persists progress and rejects corrupted state',()=>{
 const s=route('full',[['enter'],['go'],['proof']]);
 const restored=restoreState(JSON.stringify(s),'full');assert.equal(restored.current,s.current);assert.equal(restored.route,s.route);
 const broken=restoreState(JSON.stringify({...s,current:'UNKNOWN'}),'full');assert.equal(broken.current,'signal');
 const invalidMode=restoreState(JSON.stringify(s),'prototype');assert.equal(invalidMode.current,'proto_start');
});
test('export explicitly refuses to claim real sales, useful actions or launched ads',()=>{
 const s=createState('full');const b=exportGenome(s);assert.equal(b.fictional,true);assert.match(b.disclaimer,/Не опубликован/);
 assert.ok(!Object.keys(b).includes('real_sales'));
});
test('one ending may be revisited and alternative ending unlocked through archives',()=>{
 let s=route('full',[['enter'],['go'],['worlds'],['curator'],['genome'],['edit'],['cta','Продолжить историю'],['see'],['verdict'],['open']]);
 s=jump(s,'verdict');s=advance(s,'seal');assert.equal(s.current,'seal');assert.equal(s.verdict,'seal');
 assert.ok(s.visited.includes('open'));
});
test('normal story and prototype have independent state modes',()=>{
 assert.equal(catalog('full').scenes.length,15);assert.equal(catalog('prototype').scenes.length,3);
 assert.notEqual(createState('full').current,createState('prototype').current);
});
