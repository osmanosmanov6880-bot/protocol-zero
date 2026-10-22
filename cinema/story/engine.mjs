/** Pure deterministic scene graph. No DOM, clock, network, or persistence dependency. */
import {fullScenes, fullStart, geneCopy} from './scenes.mjs';
import {prototypeScenes, prototypeStart} from './prototype.mjs';

export const MODES = Object.freeze({full:{scenes:fullScenes,start:fullStart},prototype:{scenes:prototypeScenes,start:prototypeStart}});
export const LANGUAGE_CODES = ['ru','en','zh'];
const FIELDS = ['HOOK','TONE','CTA'];
export const DEFAULT_GENOME = Object.freeze({
  AUDIENCE:'Небольшие творческие команды',
  PROMISE:'Совместная разработка рекламных вариантов',
  PROOF:'Подлинность версии и история изменений; коммерческий эффект не установлен',
  VISUAL_RULE:'Сохранять ясность сообщения, не выдумывать факты',
  HOOK:'Идею не обязательно заканчивать в одиночку',
  TONE:'Спокойный, исследовательский',
  CTA:'Изучить продолжение'
});
export function tr(value,lang='ru') {return value?.[LANGUAGE_CODES.includes(lang)?lang:'ru'] ?? value?.ru ?? String(value ?? '');}
export function catalog(mode='full') {return MODES[mode] || MODES.full;}
export function getScene(mode,id) {return catalog(mode).scenes.find(s=>s.id===id) || null;}
const checkpoint = state => ({current:state.current,route:state.route,gene:state.gene,mutation:state.mutation,verdict:state.verdict,lastChoice:state.lastChoice});
export function createState(mode='full') {
  const m=MODES[mode]?mode:'full';const start=catalog(m).start;
  const state={version:1,mode:m,current:start,route:null,gene:null,mutation:null,verdict:null,lastChoice:null,
    visited:[start],found:[],history:[],checkpoints:{}};
  state.checkpoints[start]=checkpoint(state);return state;
}
export function graphIssues(mode='full'){
 const {scenes,start}=catalog(mode),ids=new Set(scenes.map(s=>s.id)),errors=[];
 if(!ids.has(start)) errors.push('Missing start');
 if(ids.size!==scenes.length) errors.push('Duplicate ids');
 for(const scene of scenes){
  if(!scene.id||!scene.image||!scene.title?.ru||!scene.subtitle?.ru)errors.push(`${scene.id}: incomplete`);
  for(const c of scene.choices||[])if(!ids.has(c.next))errors.push(`${scene.id}: missing ${c.next}`);
  for(const h of scene.hotspots||[])if(h.x<5||h.x>95||h.y<5||h.y>95)errors.push(`${scene.id}: bad hotspot ${h.id}`);
 }
 const reachable=new Set([start]),pending=[start];
 while(pending.length){const id=pending.pop();for(const option of getScene(mode,id)?.choices||[])if(!reachable.has(option.next)){reachable.add(option.next);pending.push(option.next);}}
 for(const id of ids)if(!reachable.has(id))errors.push(`Unreachable: ${id}`);
 return errors;
}
function cleanMutation(value){
 if(typeof value!=='string')throw new Error('Mutation must be a string');
 const clean=value.normalize('NFC').trim().replace(/\s+/g,' ');
 if(clean.length<3||clean.length>140)throw new Error('Mutation must be 3–140 characters');
 if(/[<>\u0000-\u001f]/.test(clean))throw new Error('Markup and control characters are not allowed');
 return clean;
}
export function advance(state,choiceId, mutationText=null,language='ru'){
 const scene=getScene(state.mode,state.current);
 if(!scene)throw new Error('Unknown current scene');
 const chosen=scene.choices.find(c=>c.id===choiceId);
 if(!chosen)throw new Error('Invalid transition');
 const next=structuredClone(state);
 next.history.push(checkpoint(state));
 if(chosen.effect){
  if(chosen.effect.route)next.route=chosen.effect.route;
  if(chosen.effect.verdict)next.verdict=chosen.effect.verdict;
  if(chosen.effect.gene){
   if(state.mutation)throw new Error('Only one mutation is allowed');
   const gene=chosen.effect.gene;
   if(!FIELDS.includes(gene))throw new Error('Invalid gene');
   const replacement=cleanMutation(mutationText===null?tr(geneCopy[gene],language):mutationText);
   next.gene=gene;
   next.mutation={gene,from:DEFAULT_GENOME[gene],to:replacement};
  }
 }
 next.lastChoice=chosen.id;
 next.current=chosen.next;
 if(!next.visited.includes(next.current))next.visited.push(next.current);
 next.checkpoints[next.current]=checkpoint(next);
 return next;
}
export function back(state){
 if(!state.history.length)return state;
 const next=structuredClone(state),old=next.history.pop();
 Object.assign(next,old);return next;
}
export function jump(state,id){
 if(!state.visited.includes(id)||!getScene(state.mode,id))throw new Error('Scene is not unlocked');
 if(id===state.current)return state;
 const next=structuredClone(state);
 next.history.push(checkpoint(state));
 Object.assign(next,next.checkpoints[id]);
 return next;
}
export function discover(state,id){
 const scene=getScene(state.mode,state.current);
 if(!scene?.hotspots?.some(h=>h.id===id))throw new Error('Invalid fragment');
 if(state.found.includes(id))return state;
 const next=structuredClone(state);next.found.push(id);return next;
}
export function exportGenome(state){
 const genome={...DEFAULT_GENOME};if(state.mutation)genome[state.mutation.gene]=state.mutation.to;
 return {title:'PROTOCOL ZERO / художественный геном',fictional:true,mode:state.mode,
  route:state.route,verdict:state.verdict,mutation:state.mutation?structuredClone(state.mutation):null,
  genome,disclaimer:'Файл создаётся в браузере. Не опубликован на сервере. Эффективность рекламного сообщения не измерялась.'};
}
const isValidCheckpoint=(cp,mode)=>cp&&typeof cp==='object'&&getScene(mode,cp.current)
 &&(!cp.mutation || (FIELDS.includes(cp.mutation.gene) && typeof cp.mutation.to==='string' && cp.mutation.to.length<=140));
export function restoreState(serialized,mode='full'){
 const empty=createState(mode);
 try{
  const value=typeof serialized==='string'?JSON.parse(serialized):serialized;
  if(value?.version!==1 || value.mode!==mode||!isValidCheckpoint(value,mode))return empty;
  const ids=new Set(catalog(mode).scenes.map(s=>s.id));
  if(!Array.isArray(value.visited)||!value.visited.includes(value.current)||value.visited.some(id=>!ids.has(id)))return empty;
  if(!Array.isArray(value.found)||!Array.isArray(value.history)||value.history.length>400 || value.found.length>100)return empty;
  if(value.history.some(cp=>!isValidCheckpoint(cp,mode)))return empty;
  if(typeof value.checkpoints!=='object'||!Object.keys(value.checkpoints).every(id=>ids.has(id)&&isValidCheckpoint(value.checkpoints[id],mode)))return empty;
  const restored={...empty, ...value};
  return restored;
 }catch{return empty;}
}
