'use strict';
// Advertising brief intake. Submissions are private until an operator manually reviews them.
// No ownership of a brand, claim, or external website is inferred from the form.
const {AppError,uid,withTransaction,enforceSessionQuota,record}=require('./database');
const {URL}=require('node:url');
const INPUTS={
  brand:[2,70],title:[5,100],category:[3,60],short:[20,240],
  audience:[10,170],promise:[15,220],evidence:[15,300],visual:[10,200],
  hook:[7,110],cta:[7,110]
};
const TONES=['Спокойный','Дерзкий','Ироничный','Тёплый','Деловой'];
const COLORS=['#caff68','#f0aa78','#b6a5ff','#91d5ec','#ecc586','#db9ee3'];
function tidy(value,name,min,max){
  if(typeof value!=='string')throw new AppError('Поле «'+name+'» должно быть текстом.');
  const clean=value.trim().replace(/\s+/g,' ');
  if(clean.length<min||clean.length>max)throw new AppError('Поле «'+name+'»: от '+min+' до '+max+' символов.');
  if(/[<>\u0000-\u001F\u007F]/.test(clean))throw new AppError('Поле «'+name+'» содержит недопустимые символы.');
  return clean;
}
function validate(payload){
  const data={};
  for(const [key,[min,max]] of Object.entries(INPUTS))data[key]=tidy(payload[key],key,min,max);
  if(typeof payload.tone!=='string'||!TONES.includes(payload.tone))throw new AppError('Выберите допустимый тон.');
  data.tone=payload.tone;
  if(typeof payload.website!=='string'||payload.website.length>250)throw new AppError('Некорректный адрес сайта.');
  const website=payload.website.trim();
  if(website){
    let url;try{url=new URL(website);}catch{throw new AppError('Укажите полный HTTPS-адрес сайта.');}
    if(url.protocol!=='https:'||url.username||url.password||url.hash||!url.hostname.includes('.'))throw new AppError('Для сайта нужен HTTPS-адрес без паролей и фрагментов.');
    data.website=url.href;
  }else data.website='';
  data.contactEmail='';
  if(typeof payload.contactEmail!=='string'||payload.contactEmail.length>150)throw new AppError('Некорректный контактный email.');
  if(payload.contactEmail.trim()){
    const email=payload.contactEmail.trim();
    if(!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)||email.includes('..'))throw new AppError('Укажите корректный email.');
    if(payload.contactConsent!==true)throw new AppError('Для email требуется отдельное согласие на ответ по заявке.');
    data.contactEmail=email;
  }
  if(payload.rightsConfirmed!==true||payload.publicConfirmed!==true)throw new AppError('Требуется подтвердить права и условия публикации.');
  return data;
}
function createSubmission(db,sessionId,payload){
  const data=validate(payload);
  return withTransaction(db,()=>{
    enforceSessionQuota(db,sessionId,'business_brief_submitted',3,'-1 day');
    const pending=db.prepare("SELECT COUNT(*) AS n FROM brand_submissions WHERE owner_session=? AND status='pending'").get(sessionId).n;
    if(pending>=3)throw new AppError('Уже есть три заявки на рассмотрении.',429,'PENDING_LIMIT');
    const id='BRF-'+uid(10);
    db.prepare(`INSERT INTO brand_submissions(id,owner_session,status,brand,title,category,short,audience,promise,evidence,visual,hook,tone,cta,website,contact_email,contact_consent_at,consented_at)
      VALUES(?,?,'pending',?,?,?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ?!='' THEN CURRENT_TIMESTAMP ELSE NULL END,CURRENT_TIMESTAMP)`)
      .run(id,sessionId,data.brand,data.title,data.category,data.short,data.audience,data.promise,data.evidence,data.visual,data.hook,data.tone,data.cta,data.website,data.contactEmail,data.contactEmail);
    record(db,'business_brief_submitted',sessionId);
    return {id,status:'pending',message:'Заявка сохранена приватно. Публикации без решения оператора не будет.'};
  });
}
function mySubmissions(db,sessionId){
  return db.prepare(`SELECT id,status,brand,title,category,short,audience,promise,evidence,visual,hook,tone,cta,website,contact_email AS contactEmail,
    created_at AS createdAt,reviewed_at AS reviewedAt,review_note AS reviewNote,campaign_id AS campaignId,
    CASE WHEN campaign_id IS NOT NULL THEN (SELECT CASE WHEN b.moderation_status='visible' THEN 1 ELSE 0 END FROM branches b WHERE b.id=brand_submissions.campaign_id||'-ROOT') ELSE 0 END AS campaignVisible
    FROM brand_submissions WHERE owner_session=? ORDER BY created_at DESC,rowid DESC LIMIT 30`).all(sessionId);
}
function withdrawSubmission(db,sessionId,id){
  if(!/^BRF-[A-Za-z0-9_-]{13,16}$/.test(id))throw new AppError('Заявка не найдена.',404,'SUBMISSION_NOT_FOUND');
  return withTransaction(db,()=>{
    const row=db.prepare('SELECT owner_session,status FROM brand_submissions WHERE id=?').get(id);
    if(!row)throw new AppError('Заявка не найдена.',404,'SUBMISSION_NOT_FOUND');
    if(row.owner_session!==sessionId)throw new AppError('Нет доступа к этой заявке.',403,'NOT_OWNER');
    if(row.status!=='pending')throw new AppError('Отозвать можно только заявку на рассмотрении.',409,'INVALID_STATUS');
    db.prepare("UPDATE brand_submissions SET status='withdrawn' WHERE id=?").run(id);
    record(db,'business_brief_withdrawn',sessionId);
    return {ok:true,status:'withdrawn'};
  });
}
function variantsForOwner(db,sessionId,id){
  const sub=operatorView(db,id);
  if(sub.owner_session!==sessionId)throw new AppError('Просмотр вариантов доступен только автору брифа.',403,'NOT_OWNER');
  if(sub.status!=='approved'||!sub.campaign_id)throw new AppError('Варианты появятся только после одобрения брифа.',409,'NOT_APPROVED');
  const root=db.prepare('SELECT moderation_status AS status FROM branches WHERE id=?').get(sub.campaign_id+'-ROOT');
  if(!root||root.status!=='visible')throw new AppError('Публикация кампании приостановлена оператором.',403,'MODERATED');
  // Traverse only published ancestry. A hidden ancestor suppresses its descendants.
  const variants=db.prepare(`WITH RECURSIVE published(id,depth) AS (
     SELECT id,0 FROM branches WHERE campaign_id=? AND parent_id IS NULL AND moderation_status='visible'
     UNION ALL
     SELECT child.id,p.depth+1 FROM branches child JOIN published p ON p.id=child.parent_id
       WHERE child.moderation_status='visible' AND p.depth<40
   ) SELECT b.id,b.parent_id AS parentId,b.generation,b.changed_gene AS changedGene,
       b.hook,b.tone,b.cta,b.action_status AS actionStatus,b.created_at AS createdAt
       FROM published p JOIN branches b ON b.id=p.id WHERE p.depth>0 ORDER BY b.created_at DESC,b.rowid DESC LIMIT 500`).all(sub.campaign_id);
  const decisions=new Map(db.prepare('SELECT branch_id,status,note FROM brand_variant_reviews WHERE submission_id=?').all(id).map(r=>[r.branch_id,r]));
  for(const variant of variants){const review=decisions.get(variant.id);variant.reviewStatus=review?.status||'candidate';variant.reviewNote=review?.note||'';}
  const geneCounts={hook:0,tone:0,cta:0};
  for(const item of variants)if(item.changedGene in geneCounts)geneCounts[item.changedGene]++;
  return {submissionId:id,campaignId:sub.campaign_id,brand:sub.brand,variants,geneCounts,
    displayed:variants.length,limit:500,
    caveat:'Это реальные публичные изменения, не рейтинг рекламной эффективности. Скрытые ветви и личные рабочие копии не включены; verified означает только серверное подтверждение подключённой платформы.'};
}
function queue(db){
  return db.prepare(`SELECT id,status,brand,title,website,created_at AS createdAt FROM brand_submissions
    WHERE status='pending' ORDER BY created_at ASC,id ASC LIMIT 100`).all();
}
function operatorView(db,id){
  const row=db.prepare('SELECT * FROM brand_submissions WHERE id=?').get(id);
  if(!row)throw new AppError('Заявка не найдена.',404,'SUBMISSION_NOT_FOUND');
  // Operator CLI only: never return this to public API.
  return row;
}
function reviewSubmission(db,id,decision,reason){
  if(!['approved','rejected'].includes(decision))throw new AppError('Неизвестное решение.');
  const why=tidy(reason,'основание решения',12,500);
  return withTransaction(db,()=>{
    const sub=operatorView(db,id);
    if(sub.status!=='pending')throw new AppError('Заявка уже рассмотрена или отозвана.',409,'ALREADY_REVIEWED');
    let campaignId=null;
    if(decision==='approved'){
      campaignId='BR-'+uid(9);
      const color=COLORS[db.prepare("SELECT COUNT(*) AS n FROM campaigns WHERE origin='community'").get().n%COLORS.length];
      db.prepare(`INSERT INTO campaigns(id,title,brand,category,short,audience,promise,evidence,visual,accent,origin)
        VALUES(?,?,?,?,?,?,?,?,?,?,'community')`).run(campaignId,sub.title,sub.brand,sub.category,sub.short,sub.audience,sub.promise,sub.evidence,sub.visual,color);
      db.prepare(`INSERT INTO branches(id,campaign_id,parent_id,generation,changed_gene,hook,tone,cta,creator_session)
        VALUES(?,?,NULL,0,NULL,?,?,?,NULL)`).run(campaignId+'-ROOT',campaignId,sub.hook,sub.tone,sub.cta);
    }
    db.prepare(`UPDATE brand_submissions SET status=?,review_note=?,reviewed_at=CURRENT_TIMESTAMP,campaign_id=? WHERE id=?`)
      .run(decision,why,campaignId,id);
    db.prepare(`INSERT INTO brand_review_log(submission_id,decision,reason,campaign_id) VALUES(?,?,?,?)`).run(id,decision,why,campaignId);
    record(db,decision==='approved'?'business_brief_approved':'business_brief_rejected',null,campaignId?campaignId+'-ROOT':null,'operator');
    return {id,decision,campaignId,rootId:campaignId?campaignId+'-ROOT':null,note:'Ручная операторская проверка не является независимым подтверждением рекламных заявлений.'};
  });
}
module.exports={createSubmission,mySubmissions,withdrawSubmission,variantsForOwner,queue,operatorView,reviewSubmission,validate};
