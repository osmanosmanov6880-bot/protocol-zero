'use strict';
const crypto=require('node:crypto');
const {AppError,uid,withTransaction,record,enforceSessionQuota,requireVisible}=require('./database');
const {authorized}=require('./curation');
const AUDIT=require('./commercial-audit');
const INV=/^TEAM-[A-Za-z0-9_-]{13,16}$/;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
function tokenHash(token){return crypto.createHash('sha256').update(token).digest('hex');}
function clean(body,min,max){
  if(typeof body!=='string')throw new AppError('Нужен текст.');
  const s=body.trim();if(s.length<min||s.length>max||/[<>\x00-\x1f\x7f]/.test(s))throw new AppError('Текст должен содержать '+min+'–'+max+' символов без разметки.');
  return s;
}
function roleFor(db,session,submissionId){
  if(!session)throw new AppError('Нет прав.',403,'NOT_MEMBER');
  const sub=db.prepare('SELECT owner_session,status,campaign_id FROM brand_submissions WHERE id=?').get(submissionId);
  if(!sub||sub.status!=='approved'||!sub.campaign_id)throw new AppError('Кампания не найдена.',404,'CAMPAIGN_NOT_FOUND');
  requireVisible(db,sub.campaign_id+'-ROOT');
  if(sub.owner_session===session)return 'owner';
  return db.prepare('SELECT role FROM team_members WHERE submission_id=? AND member_session=?').get(submissionId,session)?.role||null;
}
function requireRole(db,session,submissionId,allowed=['owner','viewer','reviewer']){
  const role=roleFor(db,session,submissionId);
  if(!allowed.includes(role))throw new AppError('Нет доступа к материалам команды.',403,'NOT_MEMBER');
  return role;
}
function createInvite(db,session,submissionId,body){
  if(!['viewer','reviewer'].includes(body?.role))throw new AppError('Выберите роль viewer или reviewer.');
  const days=body?.days===1?1:body?.days===7?7:null;
  if(!days)throw new AppError('Приглашение действует 1 или 7 дней.');
  return withTransaction(db,()=>{
    authorized(db,session,submissionId);
    enforceSessionQuota(db,session,'team_invite_created',10,'-1 day');
    const n=db.prepare('SELECT COUNT(*) AS n FROM team_invitations WHERE submission_id=? AND revoked_at IS NULL AND redeemed_at IS NULL AND expires_at>?').get(submissionId,new Date().toISOString()).n;
    if(n>=8)throw new AppError('Восемь активных приглашений — предел.',429,'TEAM_INVITE_LIMIT');
    const token=crypto.randomBytes(32).toString('base64url'),id='TEAM-'+uid(10),expiresAt=new Date(Date.now()+days*86400000).toISOString();
    db.prepare('INSERT INTO team_invitations(id,submission_id,inviter_session,token_hash,role,expires_at) VALUES(?,?,?,?,?,?)').run(id,submissionId,session,tokenHash(token),body.role,expiresAt);
    AUDIT.append(db,submissionId,'team_invited',id);record(db,'team_invite_created',session);
    return{id,role:body.role,expiresAt,joinPath:'/team/join/'+token,disclosure:'Одноразовая ссылка. Передавайте адресату лично; любой получивший ссылку может вступить в команду.'};
  });
}
function redeem(db,session,body){
  const token=body?.token;
  if(typeof token!=='string'||!TOKEN.test(token))throw new AppError('Приглашение недействительно.',404,'TEAM_TOKEN_INVALID');
  return withTransaction(db,()=>{
    const r=db.prepare('SELECT * FROM team_invitations WHERE token_hash=?').get(tokenHash(token));
    if(!r)throw new AppError('Приглашение недействительно.',404,'TEAM_TOKEN_INVALID');
    if(r.revoked_at||r.redeemed_at||Date.parse(r.expires_at)<=Date.now())throw new AppError('Приглашение использовано или недоступно.',410,'TEAM_TOKEN_EXPIRED');
    const sub=db.prepare('SELECT owner_session,status,campaign_id,brand FROM brand_submissions WHERE id=?').get(r.submission_id);
    if(!sub||sub.status!=='approved'||!sub.campaign_id)throw new AppError('Кампания закрыта.',409,'CAMPAIGN_UNAVAILABLE');
    requireVisible(db,sub.campaign_id+'-ROOT');
    if(sub.owner_session===session)throw new AppError('Нельзя приглашать самих себя.',409,'OWNER_JOIN');
    const seats=db.prepare('SELECT COUNT(*) AS n FROM team_members WHERE submission_id=?').get(r.submission_id).n;
    const already=db.prepare('SELECT 1 FROM team_members WHERE submission_id=? AND member_session=?').get(r.submission_id,session);
    if(!already&&seats>=8)throw new AppError('В команде не осталось мест.',409,'TEAM_FULL');
    // A join may refresh the previously accepted user's role, but never modify campaign ownership.
    db.prepare('INSERT INTO team_members(submission_id,member_session,role) VALUES(?,?,?) ON CONFLICT(submission_id,member_session) DO UPDATE SET role=excluded.role').run(r.submission_id,session,r.role);
    const result=db.prepare('UPDATE team_invitations SET redeemed_at=?,redeemed_by=? WHERE id=? AND redeemed_at IS NULL AND revoked_at IS NULL').run(new Date().toISOString(),session,r.id);
    if(result.changes!==1)throw new AppError('Приглашение уже использовано.',409,'TEAM_REPLAY');
    AUDIT.append(db,r.submission_id,'team_joined',r.id);record(db,'team_joined',session);
    return{submissionId:r.submission_id,role:r.role,brand:sub.brand};
  });
}
function team(db,session,submissionId){
  authorized(db,session,submissionId);
  return{invitations:db.prepare('SELECT id,role,expires_at AS expiresAt,redeemed_at AS redeemedAt,revoked_at AS revokedAt,created_at AS createdAt FROM team_invitations WHERE submission_id=? ORDER BY created_at DESC,rowid DESC LIMIT 30').all(submissionId),
    members:db.prepare('SELECT member_session AS sessionId,role,joined_at AS joinedAt FROM team_members WHERE submission_id=? ORDER BY joined_at DESC LIMIT 15').all(submissionId).map((m,i)=>({memberId:m.sessionId,displayId:'Участник '+(i+1),role:m.role,joinedAt:m.joinedAt})),
    note:'Привязка к анонимному браузеру. Не передавайте командную ссылку третьим лицам.'};
}
function revokeInvite(db,session,submissionId,id){
  if(!INV.test(id))throw new AppError('Не найдено.',404,'NOT_FOUND');
  return withTransaction(db,()=>{
    authorized(db,session,submissionId);
    const n=db.prepare('UPDATE team_invitations SET revoked_at=? WHERE id=? AND submission_id=? AND redeemed_at IS NULL AND revoked_at IS NULL').run(new Date().toISOString(),id,submissionId).changes;
    if(!n)throw new AppError('Приглашение уже недоступно.',409,'ALREADY_USED');
    AUDIT.append(db,submissionId,'team_invite_revoked',id);return{ok:true};
  });
}
function removeMember(db,session,submissionId,memberId){
  return withTransaction(db,()=>{
    authorized(db,session,submissionId);
    const n=db.prepare('DELETE FROM team_members WHERE submission_id=? AND member_session=?').run(submissionId,memberId).changes;
    if(!n)throw new AppError('Участник не найден.',404,'NOT_FOUND');
    AUDIT.append(db,submissionId,'team_member_removed',crypto.createHash('sha256').update(memberId).digest('hex').slice(0,16));
    return{ok:true};
  });
}
function workspace(db,session,submissionId){
  const role=requireRole(db,session,submissionId);
  const s=db.prepare('SELECT brand FROM brand_submissions WHERE id=?').get(submissionId);
  const packs=db.prepare('SELECT id,label,purpose,sha256,created_at AS createdAt FROM creative_packs WHERE submission_id=? ORDER BY created_at DESC,rowid DESC LIMIT 30').all(submissionId);
  const notes=db.prepare('SELECT id,pack_id AS packId,body,created_at AS createdAt FROM team_notes WHERE submission_id=? ORDER BY rowid DESC LIMIT 60').all(submissionId);
  return{submissionId,brand:s.brand,role,packs,notes,disclosure:'Команда видит только зафиксированные публичные подборки и комментарии. Личные рабочие копии, контакты, заявки и расходы скрыты.'};
}
function note(db,session,submissionId,body){
  const packId=body?.packId,text=clean(body?.text,6,600);
  return withTransaction(db,()=>{
    requireRole(db,session,submissionId,['owner','reviewer']);
    const p=db.prepare('SELECT id,snapshot_json,sha256 FROM creative_packs WHERE id=? AND submission_id=?').get(packId,submissionId);
    if(!p)throw new AppError('Подборка не найдена.',404,'PACK_NOT_FOUND');
    if(crypto.createHash('sha256').update(p.snapshot_json).digest('hex')!==p.sha256)throw new AppError('Подборка повреждена.',409,'PACK_TAMPERED');
    for(const v of JSON.parse(p.snapshot_json).variants)requireVisible(db,v.branchId);
    enforceSessionQuota(db,session,'team_note_created',30,'-1 day');
    const id='NOTE-'+uid(10);
    db.prepare('INSERT INTO team_notes(id,submission_id,pack_id,author_session,body) VALUES(?,?,?,?,?)').run(id,submissionId,packId,session,text);
    AUDIT.append(db,submissionId,'team_note_added',id);record(db,'team_note_created',session);
    return{id,packId,text};
  });
}
function readPack(db,session,submissionId,packId){
  requireRole(db,session,submissionId);
  const r=db.prepare('SELECT * FROM creative_packs WHERE submission_id=? AND id=?').get(submissionId,packId);
  if(!r)throw new AppError('Подборка не найдена.',404,'PACK_NOT_FOUND');
  if(crypto.createHash('sha256').update(r.snapshot_json).digest('hex')!==r.sha256)throw new AppError('Подборка повреждена.',409,'PACK_TAMPERED');
  const content=JSON.parse(r.snapshot_json);
  for(const v of content.variants)requireVisible(db,v.branchId);
  return{id:r.id,label:r.label,purpose:r.purpose,sha256:r.sha256,content,
    disclaimer:'Команде предоставлены только публичные креативы. Частные рабочие копии не экспортируются.'};
}
module.exports={roleFor,requireRole,createInvite,redeem,team,revokeInvite,removeMember,workspace,note,readPack};
