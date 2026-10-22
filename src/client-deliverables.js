'use strict';
// WAVE 17: immutable print-ready deliverables built only from existing public creative packs.
const crypto=require('node:crypto');
const {AppError,uid,withTransaction,record,requireVisible,enforceSessionQuota}=require('./database');
const TEAM=require('./team-access');
const AUDIT=require('./commercial-audit');
const ID=/^DLV-[A-Za-z0-9_-]{13,16}$/;
const hash=str=>crypto.createHash('sha256').update(str).digest('hex');
function escape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function assertVisiblePack(db,row){
  if(hash(row.snapshot_json)!==row.sha256)throw new AppError('Исходная подборка повреждена.',409,'PACK_TAMPERED');
  const p=JSON.parse(row.snapshot_json);
  for(const v of p.variants)requireVisible(db,v.branchId);
  return p;
}
function create(db,session,submissionId,body){
  const label=typeof body?.label==='string'?body.label.trim():'';
  if(label.length<6||label.length>100||/[<>\x00-\x1f]/.test(label))throw new AppError('Название документа — 6–100 символов.');
  return withTransaction(db,()=>{
    TEAM.requireRole(db,session,submissionId,['owner']);
    enforceSessionQuota(db,session,'deliverable_created',10,'-1 day');
    const n=db.prepare('SELECT COUNT(*) AS n FROM campaign_deliverables WHERE submission_id=?').get(submissionId).n;
    if(n>=40)throw new AppError('Лимит 40 документов на кампанию.',429,'DELIVERABLE_LIMIT');
    const p=db.prepare('SELECT * FROM creative_packs WHERE id=? AND submission_id=?').get(body.packId,submissionId);
    if(!p)throw new AppError('Исходная подборка не найдена.',404,'PACK_NOT_FOUND');
    const content=assertVisiblePack(db,p);
    const snapshot=JSON.stringify({schema:'protocol-zero/client-deliverable/v1',packId:p.id,packSha256:p.sha256,
      brand:content.brand,label,source:content,legal:{claimsVerified:false,performanceVerified:false,brandApprovalRequired:true},
      disclaimer:'Творческие варианты на согласование. Рекламные утверждения, права на материалы и результаты должны проверяться отдельно.'});
    const id='DLV-'+uid(10),sha256=hash(snapshot);
    db.prepare('INSERT INTO campaign_deliverables(id,submission_id,pack_id,label,snapshot_json,sha256) VALUES(?,?,?,?,?,?)').run(id,submissionId,p.id,label,snapshot,sha256);
    AUDIT.append(db,submissionId,'deliverable_created',id);record(db,'deliverable_created',session);
    return read(db,session,id);
  });
}
function safeRow(db,session,id){
  if(!ID.test(id))throw new AppError('Документ не найден.',404,'NOT_FOUND');
  const row=db.prepare('SELECT * FROM campaign_deliverables WHERE id=?').get(id);
  if(!row)throw new AppError('Документ не найден.',404,'NOT_FOUND');
  TEAM.requireRole(db,session,row.submission_id);
  if(hash(row.snapshot_json)!==row.sha256)throw new AppError('Документ повреждён.',409,'DELIVERABLE_TAMPERED');
  const content=JSON.parse(row.snapshot_json);
  for(const v of content.source.variants)requireVisible(db,v.branchId);
  return{row,content};
}
function read(db,session,id){
  const{row,content}=safeRow(db,session,id);
  return{id:row.id,submissionId:row.submission_id,packId:row.pack_id,label:row.label,sha256:row.sha256,createdAt:row.created_at,content};
}
function list(db,session,submissionId){
  TEAM.requireRole(db,session,submissionId);
  return{deliverables:db.prepare('SELECT id,label,pack_id AS packId,sha256,created_at AS createdAt FROM campaign_deliverables WHERE submission_id=? ORDER BY rowid DESC LIMIT 40').all(submissionId)};
}
function html(db,session,id){
  const {row,content}=safeRow(db,session,id);
  const lines=content.source.variants.map((v,i)=>`<article><div class="number">0${i+1} · ПОКОЛЕНИЕ ${escape(v.generation)}</div><h2>${escape(v.headline)}</h2><p><strong>Тон:</strong> ${escape(v.tone)}<br><strong>CTA:</strong> ${escape(v.cta)}</p><small>${escape(v.branchId)}</small></article>`).join('');
  return`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(row.label)} · PROTOCOL ZERO</title><style>@page{size:A4;margin:18mm}*{box-sizing:border-box}body{font:16px/1.55 system-ui,-apple-system,sans-serif;margin:0;color:#152033;background:#fff}header{padding:32px 0;border-bottom:5px solid #b4db54}h1{font-size:32px;line-height:1.2;margin:8px 0}h2{font-size:24px;line-height:1.3}.brand,.number{font:700 11px/1.6 ui-monospace,monospace;letter-spacing:.15em;text-transform:uppercase;color:#506679}.summary{padding:20px 0;color:#42556d}article{padding:24px 0;border-top:1px solid #dde5ee;break-inside:avoid}small{color:#7a8799;overflow-wrap:anywhere}footer{margin-top:40px;border-top:2px solid #dde5ee;padding:20px 0;font-size:12px;color:#5e6878}p{overflow-wrap:anywhere}</style></head><body><header><div class="brand">PROTOCOL ZERO / CLIENT CREATIVE KIT</div><h1>${escape(content.label)}</h1><div>${escape(content.brand)}</div></header><div class="summary">Аудитория: ${escape(content.source.audience)}<br>Задача: ${escape(content.source.objective)}<br>Основание утверждений: ${escape(content.source.claimEvidence)}<br>Визуальное направление: ${escape(content.source.visualGuidance)}</div>${lines}<footer><strong>Материалы требуют проверки заказчика.</strong> ${escape(content.disclaimer)}<br>SHA-256: ${escape(row.sha256)}<br>Снимок источника: ${escape(content.packSha256)}</footer></body></html>`;
}
module.exports={create,list,read,html,safeRow,assertVisiblePack};
