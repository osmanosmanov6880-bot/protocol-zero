'use strict';
// WAVE 18: only receipts actually present in the database; independent payment truth is absent.
const crypto=require('node:crypto');
const {AppError,uid,withTransaction,enforceSessionQuota,record,requireVisible}=require('./database');
const {authorized}=require('./curation');
const AUDIT=require('./commercial-audit');
const ID=/^EVD-[A-Za-z0-9_-]{13,16}$/;
const hash=str=>crypto.createHash('sha256').update(str).digest('hex');
function summary(db,session,submissionId){
  const sub=authorized(db,session,submissionId);
  // Compute complete aggregates in SQLite; hidden ancestors suppress all their descendants.
  const rows=db.prepare(`WITH RECURSIVE visible(id) AS (
      SELECT id FROM branches WHERE campaign_id=? AND parent_id IS NULL AND moderation_status='visible'
      UNION ALL SELECT child.id FROM branches child JOIN visible v ON child.parent_id=v.id
        WHERE child.moderation_status='visible'
    )
    SELECT r.platform_key AS platform,r.environment,r.action_type AS action,
      COUNT(*) AS n,SUM(CASE WHEN h.revoked_at IS NOT NULL THEN 1 ELSE 0 END) AS revoked
    FROM partner_receipts r JOIN handoffs h ON h.id=r.handoff_id
    JOIN visible v ON v.id=h.branch_id
    GROUP BY r.platform_key,r.environment,r.action_type`).all(sub.campaign_id);
  const total=db.prepare(`SELECT COUNT(*) AS n FROM partner_receipts r
    JOIN handoffs h ON h.id=r.handoff_id JOIN branches b ON b.id=h.branch_id
    WHERE b.campaign_id=?`).get(sub.campaign_id).n;
  const out={sandbox:{artifact_created:0,campaign_saved:0},live:{artifact_created:0,campaign_saved:0}};
  const platforms={};let revoked=0,eligible=0;
  for(const r of rows){
    if(!out[r.environment]||!Object.hasOwn(out[r.environment],r.action))continue;
    out[r.environment][r.action]+=r.n;eligible+=r.n;
    platforms[r.platform]??={sandbox:0,live:0};platforms[r.platform][r.environment]+=r.n;
    revoked+=r.revoked;
  }
  const experimentEvents=db.prepare(`SELECT i.kind,COUNT(*) AS n FROM experiment_event_ids i JOIN campaign_experiments e ON e.id=i.experiment_id WHERE e.submission_id=? GROUP BY i.kind`).all(submissionId);
  const abSigned={impression:0,goal:0};for(const r of experimentEvents)if(r.kind in abSigned)abSigned[r.kind]=r.n;
  return{schema:'protocol-zero/partner-evidence/v1',submissionId,campaignId:sub.campaign_id,generatedAt:new Date().toISOString(),
    count:{sandbox:out.sandbox,live:out.live,revokedHandoffReceipts:revoked,filteredModerated:total-eligible},
    abPartnerSignedEvents:abSigned,byPlatform:platforms,
    disclaimer:['Sandbox никогда не считается реальной коммерческой активностью.',
      'Live означает, что подключённая площадка прислала событие с действительной серверной подписью. Оно не подтверждено независимой проверкой.',
      'Показатели A/B не разделены по live/sandbox в текущей таблице — их нельзя использовать для заявления о реальной выручке.',
      'В базе нет финансовых транзакций, проверенных оплат, ROAS или доказанного роста продаж.']};
}
function create(db,session,submissionId){
  return withTransaction(db,()=>{
    authorized(db,session,submissionId);
    enforceSessionQuota(db,session,'evidence_created',6,'-1 day');
    if(db.prepare('SELECT COUNT(*) AS n FROM evidence_dossiers WHERE submission_id=?').get(submissionId).n>=30)
      throw new AppError('Лимит 30 снимков доказательств.',429,'EVIDENCE_LIMIT');
    const snapshot=JSON.stringify(summary(db,session,submissionId)),digest=hash(snapshot),id='EVD-'+uid(10);
    db.prepare('INSERT INTO evidence_dossiers(id,submission_id,snapshot_json,sha256) VALUES(?,?,?,?)').run(id,submissionId,snapshot,digest);
    AUDIT.append(db,submissionId,'evidence_frozen',id);record(db,'evidence_created',session);
    return read(db,session,id);
  });
}
function read(db,session,id){
  if(!ID.test(id))throw new AppError('Архив не найден.',404,'NOT_FOUND');
  const row=db.prepare('SELECT * FROM evidence_dossiers WHERE id=?').get(id);
  if(!row)throw new AppError('Архив не найден.',404,'NOT_FOUND');
  authorized(db,session,row.submission_id);
  if(hash(row.snapshot_json)!==row.sha256)throw new AppError('Контрольная сумма отчёта не совпала.',409,'EVIDENCE_TAMPERED');
  return{id:row.id,submissionId:row.submission_id,sha256:row.sha256,createdAt:row.created_at,snapshot:JSON.parse(row.snapshot_json)};
}
function list(db,session,submissionId){
  authorized(db,session,submissionId);
  return{dossiers:db.prepare('SELECT id,sha256,created_at AS createdAt FROM evidence_dossiers WHERE submission_id=? ORDER BY rowid DESC LIMIT 30').all(submissionId)};
}
module.exports={summary,create,read,list};
