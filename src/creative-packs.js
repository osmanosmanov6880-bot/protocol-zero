'use strict';
// WAVE 12. Immutable, content-addressed collections of approved-to-share public variants.
const crypto=require('node:crypto');
const {AppError,uid,withTransaction,requireVisible,record,enforceSessionQuota}=require('./database');
const {authorized}=require('./curation');
const PACK=/^PACK-[A-Za-z0-9_-]{13,16}$/;
function hash(content){return crypto.createHash('sha256').update(content).digest('hex');}
function view(db,session,packId){
  if(!PACK.test(packId))throw new AppError('Пакет не найден.',404,'PACK_NOT_FOUND');
  const row=db.prepare('SELECT * FROM creative_packs WHERE id=?').get(packId);
  if(!row)throw new AppError('Пакет не найден.',404,'PACK_NOT_FOUND');
  authorized(db,session,row.submission_id);
  if(hash(row.snapshot_json)!==row.sha256)throw new AppError('Проверка целостности пакета не прошла.',409,'PACK_TAMPERED');
  const content=JSON.parse(row.snapshot_json);
  for(const v of content.variants)requireVisible(db,v.branchId);
  return{id:row.id,submissionId:row.submission_id,label:row.label,purpose:row.purpose,createdAt:row.created_at,sha256:row.sha256,content,disclaimer:'Пакет содержит публичные творческие предложения, а не гарантии эффективности или проверенные заявления о продукте.'};
}
function list(db,session,submissionId){
  authorized(db,session,submissionId);
  return{packs:db.prepare('SELECT id,label,purpose,sha256,created_at AS createdAt FROM creative_packs WHERE submission_id=? ORDER BY created_at DESC,rowid DESC LIMIT 40').all(submissionId),note:'Только автор брифа в своём браузере может открыть снимки.'};
}
function create(db,session,submissionId,body){
  const label=typeof body?.label==='string'?body.label.trim():'';
  if(label.length<5||label.length>100||/[<>\x00-\x1f]/.test(label))throw new AppError('Название пакета: 5–100 символов.');
  if(!['internal','client_review','experiment'].includes(body?.purpose))throw new AppError('Выберите назначение пакета.');
  if(!Array.isArray(body.branchIds)||body.branchIds.length<1||body.branchIds.length>8||new Set(body.branchIds).size!==body.branchIds.length)throw new AppError('Выберите от 1 до 8 разных версий.');
  return withTransaction(db,()=>{
    const sub=authorized(db,session,submissionId);
    enforceSessionQuota(db,session,'creative_pack_created',15,'-1 day');
    if(db.prepare('SELECT COUNT(*) AS n FROM creative_packs WHERE submission_id=?').get(submissionId).n>=30)throw new AppError('Достигнут лимит 30 пакетов на кампанию.',429,'PACK_LIMIT');
    const variants=body.branchIds.map(id=>{
      if(typeof id!=='string')throw new AppError('Неизвестная ветвь.');
      const b=requireVisible(db,id);
      if(b.campaignId!==sub.campaign_id||b.generation<1)throw new AppError('Доступны только публичные изменения вашей кампании.',403,'WRONG_CAMPAIGN');
      return{branchId:id,parentId:b.parentId,generation:b.generation,changedGene:b.changedGene,headline:b.hook,tone:b.tone,cta:b.cta,recordedAt:b.createdAt};
    });
    const content={schema:'protocol-zero/creative-pack/v1',campaignId:sub.campaign_id,brand:sub.brand,
      audience:sub.audience,objective:sub.promise,claimEvidence:sub.evidence,visualGuidance:sub.visual,
      variants,notVerified:['ad conversion','sales','trademark ownership','advertiser claims']};
    const snapshot=JSON.stringify(content),sha256=hash(snapshot),id='PACK-'+uid(10);
    db.prepare('INSERT INTO creative_packs(id,submission_id,owner_session,label,purpose,snapshot_json,sha256) VALUES(?,?,?,?,?,?,?)')
      .run(id,submissionId,session,label,body.purpose,snapshot,sha256);
    record(db,'creative_pack_created',session,variants[0].branchId);
    return view(db,session,id);
  });
}
module.exports={create,list,view};
