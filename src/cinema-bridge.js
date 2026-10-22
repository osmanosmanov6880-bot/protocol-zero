'use strict';
// Bridge between fiction-only cinematic state and persisted, moderated campaign lineages.
// The viewer must explicitly choose a real parent and approve a single public mutation.
const {createChild,getBranch,isVisible,lineage,AppError,TONES}=require('./database');
const {publicRisks}=require('./quality');
const crypto=require('node:crypto');

const GENES=['hook','tone','cta'];
const cleanPublic=(b,sessionId)=>({
  id:b.id,parentId:b.parentId,generation:b.generation,changedGene:b.changedGene,
  brand:b.brand,title:b.title,category:b.category,origin:b.origin,
  hook:b.hook,tone:b.tone,cta:b.cta,audience:b.audience,promise:b.promise,evidence:b.evidence,
  campaignStatus:b.campaignStatus,childrenCount:b.childrenCount,
  isMine:b.creatorSession===sessionId
});
function schema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS cinema_publications(
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    nonce TEXT NOT NULL, parent_id TEXT NOT NULL REFERENCES branches(id),
    gene TEXT NOT NULL, value_hash TEXT NOT NULL, child_id TEXT NOT NULL REFERENCES branches(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(session_id,nonce)
  ); CREATE INDEX IF NOT EXISTS idx_cinema_pub_child ON cinema_publications(child_id);`);
}
function hash(value){return crypto.createHash('sha256').update(value,'utf8').digest('hex');}
function candidates(db,sessionId){
  const raw=db.prepare(`SELECT id FROM branches WHERE moderation_status='visible'
    AND ((parent_id IS NULL) OR (parent_id IS NOT NULL AND generation <= 32))
    ORDER BY (parent_id IS NULL) DESC,created_at DESC,id DESC LIMIT 90`).all();
  const branches=[];
  for(const {id} of raw){
    if(branches.length>=22)break;
    const branch=getBranch(db,id);
    if(!branch||branch.campaignStatus!=='open'||branch.generation>=40||!isVisible(db,id))continue;
    if(branch.creatorSession===sessionId)continue;
    branches.push(cleanPublic(branch,sessionId));
  }
  return {connected:true,platform:'PROTOCOL ZERO v3.4',note:'Три начальные кампании являются вымышленными учебными образцами. Публичная мутация реальна в базе, но не доказывает эффективность рекламы.',tones:TONES,branches};
}
function publish(db,sessionId,obj){
  if(!obj||typeof obj!=='object')throw new AppError('Недопустимая публикация.');
  const {parentId,gene,value,nonce,consent}=obj;
  if(consent!==true)throw new AppError('Для публичной публикации необходимо явное подтверждение.',400,'CONSENT_REQUIRED');
  if(typeof parentId!=='string'||! /^[a-zA-Z0-9_-]{6,90}$/.test(parentId))throw new AppError('Некорректная ветвь.');
  if(!GENES.includes(gene))throw new AppError('Недоступный рекламный элемент.');
  if(typeof nonce!=='string'||!/^[a-zA-Z0-9_-]{12,80}$/.test(nonce))throw new AppError('Некорректный идентификатор операции.');
  if(typeof value!=='string'||value.length>200)throw new AppError('Некорректный текст.');
  const clean=value.trim().replace(/\s+/g,' '),vhash=hash(clean);
  // Conservative public-only gate: uncertain advertising claims require human review.
  const check=publicRisks({hook:gene==='hook'?clean:'',cta:gene==='cta'?clean:''});
  if(check.status==='needs_human_review')throw new AppError('Публичное сообщение содержит утверждение или контактные данные, требующие проверки. Исправьте текст перед публикацией.',400,'CREATIVE_REVIEW_REQUIRED');
  // createChild and insert into cinema_publications are performed in its single SQLite transaction.
  const child=createChild(db,{parentId,gene,value:clean,sessionId,cinemaNonce:nonce,cinemaHash:vhash});
  return {ok:true,branch:cleanPublic(child,sessionId),link:'/b/'+encodeURIComponent(child.id),
    consequences:'/api/cinema/consequences/'+encodeURIComponent(child.id),
    message:'Ветвь записана в публичную родословную. Эффективность рекламы не измерялась.'};
}
function consequences(db,sessionId,id){
  if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{6,90}$/.test(id))throw new AppError('Некорректный идентификатор.');
  const info=lineage(db,id);
  return {branch:cleanPublic(info.branch,sessionId),descendants:info.descendants,maxDepth:info.maxDepth,
    children:info.children.map(b=>({id:b.id,changedGene:b.changedGene,generation:b.generation,createdAt:b.createdAt})),
    ancestors:info.ancestors.map(b=>({id:b.id,generation:b.generation,changedGene:b.changedGene})),
    confirmedUsefulAction:info.branch.actionStatus==='verified',
    note:'Потомки — реальные сохранённые варианты. Их количество не является показателем продаж.'};
}
module.exports={schema,candidates,publish,consequences,cleanPublic};
