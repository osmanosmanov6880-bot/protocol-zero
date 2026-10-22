'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  openDatabase,uid,getBranch,requireVisible,isVisible,record,AppError,
  createChild,createInvite,lineage,stats,saveWorkspace,getWorkspace,reportBranch,TONES
} = require('./database');

const {
  loadPlatforms,publicPlatform,createHandoff,listHandoffs,ownerHandoff,revokeHandoff,
  openRedirect,authenticatePartner,resolveHandoff,confirmReceipt,bridgeStats,campaignBrief
}=require('./bridge');

const {createSubmission,mySubmissions,withdrawSubmission,variantsForOwner}=require('./submissions');
const {publicRisks}=require('./quality');
const {reviewedVariants,setReview}=require('./curation');
const EXP=require('./experiments');
const {insights}=require('./insights');
const REVIEWS=require('./review-rooms');
const PILOTS=require('./pilots');
const {auditExperiment}=require('./experiment-integrity');
const CONTROL=require('./campaign-control');
const PACKS=require('./creative-packs');
const CLOSE=require('./experiment-close');
const MILESTONES=require('./pilot-milestones');
const {overview}=require('./business-overview');
const TEAM=require('./team-access');
const DELIVERABLES=require('./client-deliverables');
const EVIDENCE=require('./partner-evidence');
const AUDIT=require('./commercial-audit');
const READINESS=require('./launch-readiness');
const CINEMA=require('./cinema-bridge');
const ROOT=path.resolve(__dirname,'..');
const PUBLIC=path.join(ROOT,'public');
const VERSION='3.4.0';
const CINEMA_ROOT=path.join(ROOT,'cinema');
const platforms=loadPlatforms(ROOT,process.env.NODE_ENV==='production');
const DB_FILE=process.env.DB_PATH||path.join(ROOT,'data','protocol-zero.sqlite');
const db=openDatabase(DB_FILE);
CINEMA.schema(db);
const PORT=Number(process.env.PORT||8787);
const BIND=process.env.HOST||'127.0.0.1';
const IS_PROD=process.env.NODE_ENV==='production';
const PUBLIC_URL=(process.env.PUBLIC_URL||'').replace(/\/$/,'');
const PLATFORM_URL=process.env.PLATFORM_URL||'';
const PLATFORM_NAME=process.env.PLATFORM_NAME||'';
const WEBHOOK_SECRET=process.env.PLATFORM_WEBHOOK_SECRET||'';
const MAX_BODY=12_000;
const COOKIE_NAME='pz_session';
const activity=new Map();
function persistSecret(){
  if(process.env.SESSION_SECRET){
    if(process.env.SESSION_SECRET.length<40)throw new Error('SESSION_SECRET must be at least 40 characters.');
    return process.env.SESSION_SECRET;
  }
  if(IS_PROD)throw new Error('SESSION_SECRET is required in production.');
  const secretPath=path.join(path.dirname(DB_FILE),'.session-secret');
  if(fs.existsSync(secretPath))return fs.readFileSync(secretPath,'utf8').trim();
  const secret=crypto.randomBytes(40).toString('hex');
  fs.writeFileSync(secretPath,secret,{mode:0o600});
  return secret;
}
const SESSION_SECRET=persistSecret();
if(PLATFORM_URL){
  try{const u=new URL(PLATFORM_URL);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||(IS_PROD&&u.protocol!=='https:'))throw Error();}
  catch{throw new Error('PLATFORM_URL must be a valid HTTP(S) URL without embedded credentials; HTTPS in production.');}
}
if(IS_PROD&&(!PUBLIC_URL.startsWith('https://')))throw new Error('PUBLIC_URL must be an HTTPS address in production.');
if(WEBHOOK_SECRET&&WEBHOOK_SECRET.length<24)throw new Error('PLATFORM_WEBHOOK_SECRET must be at least 24 characters.');
function sign(id){return crypto.createHmac('sha256',SESSION_SECRET).update(id).digest('base64url');}
function secureEqual(a,b){return typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function parseCookies(req){const out={};for(const part of(req.headers.cookie||'').split(';')){const i=part.indexOf('=');if(i>0)out[part.slice(0,i).trim()]=part.slice(i+1).trim();}return out;}
function getSession(req,res){
  const raw=parseCookies(req)[COOKIE_NAME];
  if(raw){
    const sep=raw.indexOf('.');
    if(sep>0){const id=raw.slice(0,sep),mac=raw.slice(sep+1);
      if(/^[a-zA-Z0-9_-]{32,64}$/.test(id)&&secureEqual(sign(id),mac)){
        const session=db.prepare('SELECT id,last_seen_at AS seen FROM sessions WHERE id=?').get(id);
        if(session){
          // Throttle writes to at most once per session per hour, keeping cleanup safe.
          if(!session.seen||Date.parse(session.seen.replace(' ','T')+'Z')<Date.now()-3600000)
            db.prepare('UPDATE sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
          return id;
        }
      }
    }
  }
  const id=uid(24);
  db.prepare('INSERT INTO sessions(id) VALUES(?)').run(id);
  res.setHeader('Set-Cookie',`${COOKIE_NAME}=${id}.${sign(id)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${IS_PROD?'; Secure':''}`);
  return id;
}
function headers(res,contentType='application/json; charset=utf-8'){
  res.setHeader('Content-Type',contentType);
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('Permissions-Policy','geolocation=(),camera=(),microphone=()');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
}
function reply(res,status,data){headers(res);res.statusCode=status;res.end(JSON.stringify(data));}
function error(res,err){const status=err instanceof AppError?err.status:500;if(status>=500)console.error(err);reply(res,status,{error:status>=500?'Ошибка сервера':err.message,code:err instanceof AppError?err.code:'SERVER_ERROR'});}
function assertOrigin(req){
  if(!['POST','PUT','PATCH','DELETE'].includes(req.method))return;
  const origin=req.headers.origin;
  const expected=PUBLIC_URL?new URL(PUBLIC_URL).origin:`http://${req.headers.host}`;
  if(origin&&origin!==expected)throw new AppError('Запрос с другого источника отклонён.',403,'CROSS_ORIGIN');
  if(req.headers['sec-fetch-site']==='cross-site')throw new AppError('Запрос с другого сайта отклонён.',403,'CROSS_ORIGIN');
}
function rateLimit(key,limit=120){
  const t=Date.now(),entry=activity.get(key)||{t,n:0};
  if(t-entry.t>60000){entry.t=t;entry.n=0;}
  entry.n++;activity.set(key,entry);
  if(entry.n>limit)throw new AppError('Слишком много запросов. Повторите позже.',429,'RATE_LIMIT');
  if(activity.size>10000){for(const[k,v]of activity){if(t-v.t>60000)activity.delete(k);}}
}
function parseBody(req){
  return new Promise((resolve,reject)=>{
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return reject(new AppError('Ожидается JSON.',415,'CONTENT_TYPE'));
    const chunks=[];let size=0,tooLarge=false;
    req.on('data',chunk=>{size+=chunk.length;if(size>MAX_BODY){tooLarge=true;return;}chunks.push(chunk);});
    req.on('end',()=>{
      if(tooLarge)return reject(new AppError('Тело запроса слишком большое.',413,'PAYLOAD_TOO_LARGE'));
      try{const raw=Buffer.concat(chunks).toString('utf8');const obj=JSON.parse(raw);
        if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error();
        resolve({raw,obj});
      }catch{reject(new AppError('Некорректный JSON.',400,'INVALID_JSON'));}
    });
    req.on('error',reject);
  });
}
function sanitizedBranch(b,sessionId){if(!b)return null;const{creatorSession,...publicData}=b;return{...publicData,isMine:creatorSession===sessionId};}
function validBranchId(s){return typeof s==='string'&&/^[A-Za-z0-9_-]{6,90}$/.test(s);}
function validateWebhook(raw,provided){
  if(!WEBHOOK_SECRET)throw new AppError('Интеграция подтверждения не настроена.',503,'INTEGRATION_DISABLED');
  const expected='sha256='+crypto.createHmac('sha256',WEBHOOK_SECRET).update(raw).digest('hex');
  if(!secureEqual(expected,provided))throw new AppError('Неверная подпись события.',401,'INVALID_SIGNATURE');
}
function safeXml(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function chunkText(value,max=31){
  const words=String(value).split(/\s+/),lines=[];let line='';
  for(const word of words){
    if((line+' '+word).trim().length>max&&line){lines.push(line);line='';}
    if(word.length>max){for(let i=0;i<word.length;i+=max){if(line){lines.push(line);line='';}lines.push(word.slice(i,i+max));}continue;}
    line=(line+' '+word).trim();
  }
  if(line)lines.push(line);
  return lines.slice(0,3);
}
function shareSvg(b,descendants){
  const lines=chunkText(b.hook,30),font=lines.length===3?45:lines.length===2?54:67;
  const tspan=lines.map((line,i)=>`<tspan x="74" dy="${i?font*1.22:0}">${safeXml(line)}</tspan>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Карточка рекламной ветви">
    <rect width="1200" height="630" fill="#0b1216"/><circle cx="1100" cy="80" r="300" fill="#caff68" opacity=".035"/><circle cx="1060" cy="320" r="220" fill="none" stroke="#caff68" stroke-width="2" opacity=".2"/>
    <rect x="32" y="32" width="1136" height="566" rx="26" fill="none" stroke="#34443a" stroke-width="2"/>
    <text x="74" y="105" fill="#caff68" font-size="27" font-family="Arial,sans-serif" letter-spacing="4" font-weight="bold">PROTOCOL ZERO / НАСЛЕДНИКИ</text>
    <text x="74" y="168" fill="#9aa9a4" font-size="25" font-family="Arial,sans-serif">${safeXml(b.brand)} · ПОКОЛЕНИЕ ${b.generation}</text>
    <text x="74" y="275" fill="#f2f6eb" font-size="${font}" font-weight="bold" font-family="Arial,sans-serif">${tspan}</text>
    <path d="M74 505H1124" stroke="#34443a" stroke-width="2"/>
    <text x="74" y="554" fill="#caff68" font-size="25" font-family="Arial,sans-serif">${safeXml(b.changedGene||'seed').toUpperCase()} / ИЗМЕНЕНИЕ</text>
    <text x="780" y="554" fill="#f2f6eb" font-size="25" font-family="Arial,sans-serif">ПОТОМКОВ: ${descendants}</text>
    <text x="1090" y="117" fill="#caff68" font-size="66" text-anchor="end" font-family="Arial,sans-serif">↗</text>
  </svg>`;
}
async function signedAction(req,res){
  const{raw,obj}=await parseBody(req);validateWebhook(raw,req.headers['x-pz-signature']);
  if(typeof obj.event_id!=='string'||obj.event_id.length>100||obj.event_id.length<8)throw new AppError('Некорректный event_id.');
  if(!validBranchId(obj.branch_id)||!['artifact_created','campaign_saved'].includes(obj.action_type))throw new AppError('Некорректное действие.');
  if(!getBranch(db,obj.branch_id))throw new AppError('Ветвь не найдена.',404,'NOT_FOUND');
  const prev=db.prepare('SELECT branch_id AS branchId,action_type AS actionType FROM platform_events WHERE event_id=?').get(obj.event_id);
  if(prev){
    if(prev.branchId!==obj.branch_id||prev.actionType!==obj.action_type)throw new AppError('event_id уже связан с другим действием.',409,'EVENT_CONFLICT');
    return reply(res,200,{ok:true,duplicate:true});
  }
  const insert=db.prepare('INSERT INTO platform_events(event_id,branch_id,action_type) VALUES(?,?,?)').run(obj.event_id,obj.branch_id,obj.action_type);
  if(insert.changes){
    db.prepare("UPDATE branches SET action_status='verified' WHERE id=?").run(obj.branch_id);
    record(db,'product_useful_action',null,obj.branch_id,'webhook');
  }
  return reply(res,200,{ok:true,duplicate:false});
}
async function signedBridgeRequest(req,operation){
  const {raw,obj}=await parseBody(req);
  const platform=authenticatePartner(platforms,req.headers,raw);
  if(operation==='resolve')return resolveHandoff(db,platform,obj);
  if(operation==='confirm')return confirmReceipt(db,platform,obj);
  throw new AppError('Операция не найдена.',404);
}
async function api(req,res,pathname){
  if(req.method==='GET'&&pathname==='/api/health')return reply(res,200,{ok:true,name:'PROTOCOL ZERO',mode:IS_PROD?'production':'development',version:VERSION});
  if(req.method==='GET'&&pathname==='/api/cinema/candidates'){
    const sessionId=getSession(req,res);rateLimit('session:'+sessionId);
    return reply(res,200,CINEMA.candidates(db,sessionId));
  }
  if(req.method==='POST'&&pathname==='/api/cinema/publish'){
    const sessionId=getSession(req,res);rateLimit('session:'+sessionId);
    const {obj}=await parseBody(req);return reply(res,201,CINEMA.publish(db,sessionId,obj));
  }
  const cinemaReturn=pathname.match(/^\/api\/cinema\/consequences\/([A-Za-z0-9_-]{6,90})$/);
  if(cinemaReturn&&req.method==='GET'){const sessionId=getSession(req,res);rateLimit('session:'+sessionId);return reply(res,200,CINEMA.consequences(db,sessionId,cinemaReturn[1]));}
  if(req.method==='GET'&&pathname==='/api/ready'){const ok=db.prepare('SELECT 1 AS ready').get().ready===1;return reply(res,ok?200:503,{ok,component:'database',version:VERSION});}
  // Webhooks authenticate by HMAC and must not issue a browser session cookie.
  if(req.method==='POST'&&pathname==='/api/integrations/verified')return signedAction(req,res);
  if(req.method==='POST'&&pathname==='/api/integrations/v2/resolve')return reply(res,200,await signedBridgeRequest(req,'resolve'));
  if(req.method==='POST'&&pathname==='/api/integrations/v2/confirm')return reply(res,200,await signedBridgeRequest(req,'confirm'));
  if(req.method==='POST'&&pathname==='/api/integrations/v2/experiment-assign'){const {raw,obj}=await parseBody(req);return reply(res,200,EXP.assign(db,authenticatePartner(platforms,req.headers,raw),SESSION_SECRET,obj));}
  if(req.method==='POST'&&pathname==='/api/integrations/v2/experiment-event'){const {raw,obj}=await parseBody(req);return reply(res,200,EXP.event(db,authenticatePartner(platforms,req.headers,raw),SESSION_SECRET,obj));}
  const sessionId=getSession(req,res);
  rateLimit('session:'+sessionId);
  // WAVE 06: guests use capability links, never receive the owner's workspace or notes.
  const reviewToken=pathname.match(/^\/api\/review-access\/([A-Za-z0-9_-]{43})$/);
  if(reviewToken&&req.method==='GET')return reply(res,200,REVIEWS.publicRoom(db,reviewToken[1],sessionId));
  const reviewSend=pathname.match(/^\/api\/review-access\/([A-Za-z0-9_-]{43})\/feedback$/);
  if(reviewSend&&req.method==='POST'){const {obj}=await parseBody(req);return reply(res,201,REVIEWS.sendFeedback(db,reviewSend[1],sessionId,obj));}
  const roomBase=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/review-rooms$/);
  if(roomBase&&req.method==='GET')return reply(res,200,REVIEWS.listRooms(db,sessionId,roomBase[1]));
  if(roomBase&&req.method==='POST'){const {obj}=await parseBody(req);return reply(res,201,REVIEWS.createRoom(db,sessionId,roomBase[1],obj));}
  const roomDetail=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/review-rooms\/(ROOM-[A-Za-z0-9_-]{13,16})$/);
  if(roomDetail&&req.method==='GET')return reply(res,200,REVIEWS.roomResults(db,sessionId,roomDetail[1],roomDetail[2]));
  const roomRevoke=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/review-rooms\/(ROOM-[A-Za-z0-9_-]{13,16})\/revoke$/);
  if(roomRevoke&&req.method==='POST'){await parseBody(req);return reply(res,200,REVIEWS.revokeRoom(db,sessionId,roomRevoke[1],roomRevoke[2]));}
  const roomDecide=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/review-rooms\/(ROOM-[A-Za-z0-9_-]{13,16})\/feedback\/(FDB-[A-Za-z0-9_-]{13,16})$/);
  if(roomDecide&&req.method==='PUT'){const {obj}=await parseBody(req);return reply(res,200,REVIEWS.decide(db,sessionId,roomDecide[1],roomDecide[2],roomDecide[3],obj));}
  // WAVE 09: commercial interest, offers and owner acknowledgement; NEVER payment capture.
  const pilotBase=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/pilots$/);
  if(pilotBase&&req.method==='GET')return reply(res,200,PILOTS.list(db,sessionId,pilotBase[1]));
  if(pilotBase&&req.method==='POST'){const {obj}=await parseBody(req);return reply(res,201,PILOTS.submit(db,sessionId,pilotBase[1],obj));}
  const pilotAction=pathname.match(/^\/api\/pilots\/(PIL-[A-Za-z0-9_-]{13,16})\/(accept|decline|withdraw)$/);
  if(pilotAction&&req.method==='POST'){await parseBody(req);return reply(res,200,PILOTS.ownerAction(db,sessionId,pilotAction[1],pilotAction[2]));}

  // WAVES 16–20 / team collaboration: one-use capabilities, reversible member rights.
  if(req.method==='POST'&&pathname==='/api/team/redeem'){const {obj}=await parseBody(req);return reply(res,201,TEAM.redeem(db,sessionId,obj));}
  const teamInvites=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/team\/invites$/);
  if(teamInvites&&req.method==='POST'){const {obj}=await parseBody(req);return reply(res,201,TEAM.createInvite(db,sessionId,teamInvites[1],obj));}
  const teamOwner=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/team$/);
  if(teamOwner&&req.method==='GET')return reply(res,200,TEAM.team(db,sessionId,teamOwner[1]));
  const teamRevoke=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/team\/invites\/(TEAM-[A-Za-z0-9_-]{13,16})\/revoke$/);
  if(teamRevoke&&req.method==='POST'){await parseBody(req);return reply(res,200,TEAM.revokeInvite(db,sessionId,teamRevoke[1],teamRevoke[2]));}
  const teamMember=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/team\/members\/([A-Za-z0-9_-]{32,64})\/revoke$/);
  if(teamMember&&req.method==='POST'){await parseBody(req);return reply(res,200,TEAM.removeMember(db,sessionId,teamMember[1],teamMember[2]));}
  const teamWorkspace=pathname.match(/^\/api\/team\/(BRF-[A-Za-z0-9_-]{13,16})\/workspace$/);
  if(teamWorkspace&&req.method==='GET')return reply(res,200,TEAM.workspace(db,sessionId,teamWorkspace[1]));
  const teamPack=pathname.match(/^\/api\/team\/(BRF-[A-Za-z0-9_-]{13,16})\/packs\/(PACK-[A-Za-z0-9_-]{13,16})$/);
  if(teamPack&&req.method==='GET')return reply(res,200,TEAM.readPack(db,sessionId,teamPack[1],teamPack[2]));
  const teamNote=pathname.match(/^\/api\/team\/(BRF-[A-Za-z0-9_-]{13,16})\/notes$/);
  if(teamNote&&req.method==='POST'){const {obj}=await parseBody(req);return reply(res,201,TEAM.note(db,sessionId,teamNote[1],obj));}
  // WAVE 17 / immutable creative deliverables and sanitised standalone HTML.
  const deliverableBase=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/deliverables$/);
  if(deliverableBase&&req.method==='GET')return reply(res,200,DELIVERABLES.list(db,sessionId,deliverableBase[1]));
  if(deliverableBase&&req.method==='POST'){const {obj}=await parseBody(req);return reply(res,201,DELIVERABLES.create(db,sessionId,deliverableBase[1],obj));}
  const deliverableRead=pathname.match(/^\/api\/deliverables\/(DLV-[A-Za-z0-9_-]{13,16})$/);
  if(deliverableRead&&req.method==='GET')return reply(res,200,DELIVERABLES.read(db,sessionId,deliverableRead[1]));
  const deliverableHTML=pathname.match(/^\/api\/deliverables\/(DLV-[A-Za-z0-9_-]{13,16})\/download$/);
  if(deliverableHTML&&req.method==='GET'){
    const html=DELIVERABLES.html(db,sessionId,deliverableHTML[1]);headers(res,'text/html; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename="${deliverableHTML[1]}.html"`);
    res.setHeader('X-Content-Type-Options','nosniff');res.statusCode=200;return res.end(html);
  }
  // WAVE 18 / fact-only partner attestation separated into sandbox and live.
  const evidenceBase=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/evidence$/);
  if(evidenceBase&&req.method==='GET')return reply(res,200,{current:EVIDENCE.summary(db,sessionId,evidenceBase[1]),...EVIDENCE.list(db,sessionId,evidenceBase[1])});
  if(evidenceBase&&req.method==='POST'){await parseBody(req);return reply(res,201,EVIDENCE.create(db,sessionId,evidenceBase[1]));}
  const evidenceRead=pathname.match(/^\/api\/evidence\/(EVD-[A-Za-z0-9_-]{13,16})$/);
  if(evidenceRead&&req.method==='GET')return reply(res,200,EVIDENCE.read(db,sessionId,evidenceRead[1]));
  // WAVE 19 / append-only audit trail with digest-chain verification.
  const ownerAudit=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/audit$/);
  if(ownerAudit&&req.method==='GET')return reply(res,200,AUDIT.ownerAudit(db,sessionId,ownerAudit[1]));
  // WAVE 20 / explicit launch gate; NEVER a blanket production approval.
  const launchCheck=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/launch-check$/);
  if(launchCheck&&req.method==='GET')return reply(res,200,READINESS.campaign(db,sessionId,launchCheck[1],platforms));

  // WAVES 11 + 15: campaign pause/resume and evidence-only control centre.
  const campaignControl=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/control$/);
  if(campaignControl&&req.method==='GET')return reply(res,200,CONTROL.settings(db,sessionId,campaignControl[1]));
  if(campaignControl&&req.method==='PUT'){const {obj}=await parseBody(req);return reply(res,200,CONTROL.update(db,sessionId,campaignControl[1],obj));}
  const overviewMatch=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/overview$/);
  if(overviewMatch&&req.method==='GET')return reply(res,200,overview(db,sessionId,overviewMatch[1]));
  // WAVE 12: immutable, owner-only creative packs.
  const packsMatch=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/packs$/);
  if(packsMatch&&req.method==='GET')return reply(res,200,PACKS.list(db,sessionId,packsMatch[1]));
  if(packsMatch&&req.method==='POST'){const {obj}=await parseBody(req);return reply(res,201,PACKS.create(db,sessionId,packsMatch[1],obj));}
  const packRead=pathname.match(/^\/api\/packs\/(PACK-[A-Za-z0-9_-]{13,16})$/);
  if(packRead&&req.method==='GET')return reply(res,200,PACKS.view(db,sessionId,packRead[1]));
  // WAVE 13: irreversible snapshot of a stopped experiment.
  const closeExperiment=pathname.match(/^\/api\/experiments\/(EXP-[A-Za-z0-9_-]{16,22})\/close$/);
  if(closeExperiment&&req.method==='POST'){const {obj}=await parseBody(req);return reply(res,201,CLOSE.close(db,sessionId,closeExperiment[1],obj));}
  const closedReport=pathname.match(/^\/api\/experiments\/(EXP-[A-Za-z0-9_-]{16,22})\/closure$/);
  if(closedReport&&req.method==='GET')return reply(res,200,CLOSE.get(db,sessionId,closedReport[1]));
  // WAVE 14: operator milestones and owner feedback on an accepted pilot.
  const milestonesBase=pathname.match(/^\/api\/pilots\/(PIL-[A-Za-z0-9_-]{13,16})\/milestones$/);
  if(milestonesBase&&req.method==='GET')return reply(res,200,MILESTONES.ownerList(db,sessionId,milestonesBase[1]));
  const milestoneReview=pathname.match(/^\/api\/pilots\/(PIL-[A-Za-z0-9_-]{13,16})\/milestones\/(MS-[A-Za-z0-9_-]{13,16})\/review$/);
  if(milestoneReview&&req.method==='PUT'){const {obj}=await parseBody(req);return reply(res,200,MILESTONES.ownerReview(db,sessionId,milestoneReview[1],milestoneReview[2],obj));}

  if(req.method==='POST'&&pathname==='/api/business-briefs'){
    const {obj}=await parseBody(req);
    return reply(res,201,createSubmission(db,sessionId,obj));
  }
  if(req.method==='GET'&&pathname==='/api/business-briefs'){
    return reply(res,200,{submissions:mySubmissions(db,sessionId)});
  }
  const insightsMatch=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/insights$/);
  if(req.method==='GET'&&insightsMatch)return reply(res,200,insights(db,sessionId,insightsMatch[1]));
  const reviewMatch=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/reviews$/);
  if(reviewMatch&&req.method==='GET')return reply(res,200,reviewedVariants(db,sessionId,reviewMatch[1]));
  if(reviewMatch&&req.method==='PUT'){
    const {obj}=await parseBody(req);
    return reply(res,200,setReview(db,sessionId,reviewMatch[1],obj));
  }
  const experimentsMatch=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/experiments$/);
  if(req.method==='GET'&&experimentsMatch)return reply(res,200,EXP.listPlans(db,sessionId,experimentsMatch[1]));
  if(req.method==='POST'&&experimentsMatch){const {obj}=await parseBody(req);return reply(res,201,EXP.createPlan(db,platforms,sessionId,experimentsMatch[1],obj));}
  const planMatch=pathname.match(/^\/api\/experiments\/(EXP-[A-Za-z0-9_-]{16,22})$/);
  if(req.method==='GET'&&planMatch)return reply(res,200,EXP.getPlan(db,sessionId,planMatch[1]));
  const integrityMatch=pathname.match(/^\/api\/experiments\/(EXP-[A-Za-z0-9_-]{16,22})\/integrity$/);
  if(integrityMatch&&req.method==='GET')return reply(res,200,auditExperiment(db,sessionId,integrityMatch[1]));
  const kitMatch=pathname.match(/^\/api\/experiments\/(EXP-[A-Za-z0-9_-]{16,22})\/kit$/);
  if(req.method==='GET'&&kitMatch)return reply(res,200,EXP.kit(db,sessionId,kitMatch[1]));
  const activateMatch=pathname.match(/^\/api\/experiments\/(EXP-[A-Za-z0-9_-]{16,22})\/activate$/);
  if(req.method==='POST'&&activateMatch){const {obj}=await parseBody(req);return reply(res,200,EXP.activatePlan(db,platforms,sessionId,activateMatch[1],obj.platformKey));}
  const pauseMatch=pathname.match(/^\/api\/experiments\/(EXP-[A-Za-z0-9_-]{16,22})\/pause$/);
  if(req.method==='POST'&&pauseMatch){await parseBody(req);return reply(res,200,EXP.pausePlan(db,sessionId,pauseMatch[1]));}
  const variantsMatch=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/variants$/);
  if(req.method==='GET'&&variantsMatch)return reply(res,200,variantsForOwner(db,sessionId,variantsMatch[1]));
  const withdrawMatch=pathname.match(/^\/api\/business-briefs\/(BRF-[A-Za-z0-9_-]{13,16})\/withdraw$/);
  if(req.method==='POST'&&withdrawMatch){await parseBody(req);return reply(res,200,withdrawSubmission(db,sessionId,withdrawMatch[1]));}
  if(req.method==='GET'&&pathname==='/api/bootstrap'){
    const roots=db.prepare("SELECT id FROM branches WHERE parent_id IS NULL AND moderation_status='visible' ORDER BY campaign_id").all().map(({id})=>sanitizedBranch(getBranch(db,id),sessionId));
    const recentIds=db.prepare("SELECT id FROM branches WHERE parent_id IS NOT NULL AND moderation_status='visible' ORDER BY created_at DESC,rowid DESC LIMIT 35").all();
    const recent=recentIds.filter(({id})=>isVisible(db,id)).slice(0,10).map(({id})=>sanitizedBranch(getBranch(db,id),sessionId));
    const mineIds=db.prepare('SELECT id FROM branches WHERE creator_session=? ORDER BY created_at DESC,rowid DESC LIMIT 60').all(sessionId);
    const mine=mineIds.filter(({id})=>isVisible(db,id)).slice(0,15).map(({id})=>sanitizedBranch(getBranch(db,id),sessionId));
    record(db,'portal_view',sessionId);
    return reply(res,200,{roots,recent,mine,stats:{...stats(db),...bridgeStats(db)},platforms:platforms.map(publicPlatform),tones:TONES,config:{platformEnabled:!!PLATFORM_URL,platformName:PLATFORM_NAME||'рекламная платформа',platformUrl:PLATFORM_URL||null,platformVerified:!!WEBHOOK_SECRET,version:VERSION}});
  }
  if(req.method==='GET'&&pathname==='/api/stats')return reply(res,200,{...stats(db),...bridgeStats(db)});
  if(req.method==='GET'&&pathname==='/api/platforms')return reply(res,200,{platforms:platforms.map(publicPlatform),connected:platforms.length});
  if(req.method==='GET'&&pathname==='/api/handoffs')return reply(res,200,{handoffs:listHandoffs(db,sessionId)});
  if(req.method==='POST'&&pathname==='/api/handoffs'){
    const {obj}=await parseBody(req);
    if(!validBranchId(obj.branchId))throw new AppError('Укажите корректную ветвь.');
    return reply(res,201,createHandoff(db,platforms,{branchId:obj.branchId,platformKey:obj.platformKey,source:obj.source,sessionId}));
  }
  const handoffMatch=pathname.match(/^\/api\/handoffs\/([A-Za-z0-9_-]{32})$/);
  if(req.method==='GET'&&handoffMatch){
    const row=ownerHandoff(db,handoffMatch[1],sessionId);
    const {snapshot_json,owner_session,...safe}=row;
    return reply(res,200,{...safe,brief:JSON.parse(snapshot_json)});
  }
  const revokeMatch=pathname.match(/^\/api\/handoffs\/([A-Za-z0-9_-]{32})\/revoke$/);
  if(req.method==='POST'&&revokeMatch){await parseBody(req);return reply(res,200,revokeHandoff(db,revokeMatch[1],sessionId));}
  const briefMatch=pathname.match(/^\/api\/branches\/([A-Za-z0-9_-]{6,90})\/brief$/);
  if(req.method==='GET'&&briefMatch){
    const b=requireVisible(db,briefMatch[1]);
    if(b.creatorSession!==sessionId||b.generation===0)throw new AppError('Бриф доступен только автору версии.',403,'NOT_OWNER');
    const source=new URL(req.url,'http://localhost').searchParams.get('source')||'public';
    const brief=campaignBrief(db,b,source,sessionId);
    record(db,'brief_exported',sessionId,b.id);
    return reply(res,200,brief);
  }
  if(req.method==='POST'&&pathname==='/api/preflight'){
    const {obj}=await parseBody(req);
    if(typeof obj.hook!=='string'||typeof obj.cta!=='string'||obj.hook.length>180||obj.cta.length>180)throw new AppError('Некорректный творческий текст.');
    return reply(res,200,publicRisks({hook:obj.hook,cta:obj.cta,origin:'community'}));
  }
  const preflightMatch=pathname.match(/^\/api\/branches\/([A-Za-z0-9_-]{6,90})\/preflight$/);
  if(req.method==='GET'&&preflightMatch)return reply(res,200,publicRisks(requireVisible(db,preflightMatch[1])));
  const branchMatch=pathname.match(/^\/api\/branches\/([A-Za-z0-9_-]{6,90})$/);
  if(req.method==='GET'&&branchMatch){
    const b=requireVisible(db,branchMatch[1]);record(db,'branch_viewed',sessionId,b.id);
    return reply(res,200,sanitizedBranch(b,sessionId));
  }
  const lineageMatch=pathname.match(/^\/api\/branches\/([A-Za-z0-9_-]{6,90})\/lineage$/);
  if(req.method==='GET'&&lineageMatch){const data=lineage(db,lineageMatch[1]);return reply(res,200,{...data,branch:sanitizedBranch(data.branch,sessionId),ancestors:data.ancestors.map(b=>sanitizedBranch(b,sessionId))});}
  const workspaceMatch=pathname.match(/^\/api\/branches\/([A-Za-z0-9_-]{6,90})\/workspace$/);
  if(workspaceMatch&&req.method==='GET')return reply(res,200,getWorkspace(db,workspaceMatch[1],sessionId));
  if(workspaceMatch&&req.method==='PUT'){
    const{obj}=await parseBody(req);return reply(res,200,saveWorkspace(db,workspaceMatch[1],sessionId,obj));
  }
  const reportMatch=pathname.match(/^\/api\/branches\/([A-Za-z0-9_-]{6,90})\/report$/);
  if(req.method==='POST'&&reportMatch){const{obj}=await parseBody(req);return reply(res,201,reportBranch(db,reportMatch[1],sessionId,obj.reason,obj.details||''));}
  const inviteRead=pathname.match(/^\/api\/invites\/([A-Za-z0-9_-]{32,64})$/);
  if(req.method==='GET'&&inviteRead){
    const inv=db.prepare('SELECT * FROM invites WHERE token=?').get(inviteRead[1]);
    if(!inv)throw new AppError('Приглашение не найдено.',404,'INVITE_INVALID');
    const branch=requireVisible(db,inv.branch_id);
    const expired=Date.parse(inv.expires_at)<=Date.now();
    const status=inv.child_id?'used':expired?'expired':inv.creator_session===sessionId?'own':'open';
    if(status==='open')record(db,'invite_opened',sessionId,inv.branch_id);
    return reply(res,200,{status,branch:sanitizedBranch(branch,sessionId),childId:inv.child_id||null,expiresAt:inv.expires_at});
  }
  if(req.method==='POST'&&pathname==='/api/mutations'){
    const{obj}=await parseBody(req);
    return reply(res,201,sanitizedBranch(createChild(db,{parentId:obj.parentId,gene:obj.gene,value:obj.value,sessionId,inviteToken:obj.inviteToken||null}),sessionId));
  }
  const inviteMatch=pathname.match(/^\/api\/branches\/([A-Za-z0-9_-]{6,90})\/invites$/);
  if(req.method==='POST'&&inviteMatch){await parseBody(req);const invite=createInvite(db,inviteMatch[1],sessionId);return reply(res,201,{...invite,path:'/i/'+invite.token});}
  const selfReportMatch=pathname.match(/^\/api\/branches\/([A-Za-z0-9_-]{6,90})\/action\/report$/);
  if(req.method==='POST'&&selfReportMatch){
    await parseBody(req);const id=selfReportMatch[1],b=requireVisible(db,id);
    if(b.creatorSession!==sessionId)throw new AppError('Только автор может отметить своё действие.',403,'NOT_OWNER');
    if(b.actionStatus==='none'){
      db.prepare("UPDATE branches SET action_status='reported' WHERE id=? AND action_status='none'").run(id);
      record(db,'product_action_self_reported',sessionId,id,'self_report');
    }
    const updated=getBranch(db,id);return reply(res,200,{actionStatus:updated.actionStatus,verified:updated.actionStatus==='verified'});
  }
  if(req.method==='POST'&&pathname==='/api/events'){
    const{obj}=await parseBody(req);
    const allowed=['interaction_started','gene_selected','mutation_previewed','brief_copied','share_artifact','product_cta_clicked','return_due_to_consequence','card_downloaded'];
    if(!allowed.includes(obj.name))throw new AppError('Неизвестное клиентское событие.');
    const id=obj.branchId&&validBranchId(obj.branchId)&&isVisible(db,obj.branchId)?obj.branchId:null;
    record(db,obj.name,sessionId,id,'client');return reply(res,201,{ok:true});
  }
  if(req.method==='GET'&&pathname==='/api/privacy/export'){
    const branches=db.prepare('SELECT id,parent_id AS parentId,changed_gene AS changedGene,hook,tone,cta,created_at AS createdAt FROM branches WHERE creator_session=?').all(sessionId);
    const events=db.prepare('SELECT name,source,branch_id AS branchId,created_at AS createdAt FROM events WHERE session_id=? ORDER BY id DESC').all(sessionId);
    const workspaces=db.prepare('SELECT branch_id AS branchId,headline,cta,tone,notes,updated_at AS updatedAt FROM workspaces WHERE owner_session=?').all(sessionId);
    const sentInvites=db.prepare('SELECT branch_id AS branchId,child_id AS childId,created_at AS createdAt,expires_at AS expiresAt FROM invites WHERE creator_session=?').all(sessionId);
    const handoffs=db.prepare('SELECT id,branch_id AS branchId,platform_key AS platformKey,source,snapshot_json AS snapshot,created_at AS createdAt,opened_at AS openedAt,revoked_at AS revokedAt FROM handoffs WHERE owner_session=?').all(sessionId).map(({snapshot,...h})=>({...h,brief:JSON.parse(snapshot)}));
    const submissions=mySubmissions(db,sessionId);
    const experiments=db.prepare('SELECT id,submission_id AS submissionId,metric,status,created_at AS createdAt FROM campaign_experiments WHERE owner_session=?').all(sessionId);
    const reviews=db.prepare(`SELECT r.submission_id AS submissionId,r.branch_id AS branchId,r.status,r.note FROM brand_variant_reviews r JOIN brand_submissions s ON s.id=r.submission_id WHERE s.owner_session=?`).all(sessionId);
    const reviewRooms=db.prepare('SELECT id,submission_id AS submissionId,created_at AS createdAt,expires_at AS expiresAt,revoked_at AS revokedAt FROM review_rooms WHERE owner_session=?').all(sessionId);
    const myReviewFeedback=db.prepare('SELECT room_id AS roomId,branch_id AS branchId,score,comment,created_at AS createdAt FROM review_feedback WHERE visitor_session=?').all(sessionId);
    const pilots=db.prepare('SELECT id,submission_id AS submissionId,status,objective,budget_band AS budgetBand,proposal,quote_eur_cents AS quoteEurCents FROM pilot_requests WHERE owner_session=?').all(sessionId);
    const packs=db.prepare('SELECT id,submission_id AS submissionId,label,purpose,snapshot_json AS content,sha256,created_at AS createdAt FROM creative_packs WHERE owner_session=?').all(sessionId).map(({content,...p})=>({...p,content:JSON.parse(content)}));
    const controls=db.prepare('SELECT campaign_id AS campaignId,status,reason,updated_at AS updatedAt FROM campaign_controls WHERE updated_by=?').all(sessionId);
    const closures=db.prepare('SELECT experiment_id AS experimentId,reason,snapshot_json AS snapshot,sha256,closed_at AS closedAt FROM experiment_closures WHERE closed_by=?').all(sessionId).map(({snapshot,...c})=>({...c,snapshot:JSON.parse(snapshot)}));
    const milestones=db.prepare('SELECT m.id,m.status,m.owner_note AS note FROM pilot_milestones m JOIN pilot_requests p ON m.pilot_id=p.id WHERE p.owner_session=?').all(sessionId);
    const teamMemberships=db.prepare('SELECT submission_id AS submissionId,role,joined_at AS joinedAt FROM team_members WHERE member_session=?').all(sessionId);
    const ownedTeamNotes=db.prepare('SELECT id,submission_id AS submissionId,pack_id AS packId,body,created_at AS createdAt FROM team_notes WHERE author_session=?').all(sessionId);
    const deliverables=db.prepare('SELECT id,submission_id AS submissionId,label,sha256,created_at AS createdAt FROM campaign_deliverables WHERE submission_id IN (SELECT id FROM brand_submissions WHERE owner_session=?)').all(sessionId);
    const evidenceDossiers=db.prepare('SELECT id,submission_id AS submissionId,sha256,created_at AS createdAt FROM evidence_dossiers WHERE submission_id IN (SELECT id FROM brand_submissions WHERE owner_session=?)').all(sessionId);
    return reply(res,200,{exportedAt:new Date().toISOString(),branches,events,workspaces,sentInvites,handoffs,submissions,reviews,experiments,reviewRooms,myReviewFeedback,pilots,packs,controls,closures,milestones,teamMemberships,ownedTeamNotes,deliverables,evidenceDossiers,note:'Данные текущего анонимного браузера. Экспорт не включает данные других участников.'});
  }
  if(req.method==='POST'&&pathname==='/api/privacy/delete'){
    await parseBody(req);
    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare('DELETE FROM review_feedback WHERE visitor_session=?').run(sessionId);
      db.prepare('DELETE FROM team_notes WHERE author_session=?').run(sessionId);
      db.prepare('DELETE FROM team_members WHERE member_session=?').run(sessionId);
      db.prepare('UPDATE team_invitations SET redeemed_by=NULL WHERE redeemed_by=?').run(sessionId);
      db.prepare('DELETE FROM team_invitations WHERE inviter_session=?').run(sessionId);
      db.prepare('DELETE FROM brand_submissions WHERE owner_session=?').run(sessionId);
      db.prepare('DELETE FROM workspaces WHERE owner_session=?').run(sessionId);
      db.prepare('DELETE FROM branch_reports WHERE reporter_session=?').run(sessionId);
      db.prepare('DELETE FROM invites WHERE creator_session=?').run(sessionId);
      const touched=db.prepare('SELECT DISTINCT branch_id AS id FROM handoffs WHERE owner_session=?').all(sessionId);
      db.prepare('DELETE FROM handoffs WHERE owner_session=?').run(sessionId);
      for(const {id} of touched){
        const remaining=db.prepare("SELECT (SELECT COUNT(*) FROM platform_events WHERE branch_id=?) + (SELECT COUNT(*) FROM partner_receipts r JOIN handoffs h ON h.id=r.handoff_id WHERE h.branch_id=? AND r.environment='live') AS n").get(id,id).n;
        if(!remaining)db.prepare("UPDATE branches SET action_status=CASE WHEN action_status='verified' THEN 'none' ELSE action_status END WHERE id=?").run(id);
      }
      db.prepare('UPDATE invites SET used_by=NULL WHERE used_by=?').run(sessionId);
      db.prepare('UPDATE branches SET creator_session=NULL WHERE creator_session=?').run(sessionId);
      db.prepare('DELETE FROM events WHERE session_id=?').run(sessionId);
      db.prepare('DELETE FROM sessions WHERE id=?').run(sessionId);
      db.exec('COMMIT');
    }catch(err){db.exec('ROLLBACK');throw err;}
    res.setHeader('Set-Cookie',`${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${IS_PROD?'; Secure':''}`);
    return reply(res,200,{ok:true,message:'Анонимная сессия, её события и частные рабочие копии удалены. Публичные анонимизированные ветви сохранены.'});
  }
  throw new AppError('Маршрут API не найден.',404,'NOT_FOUND');
}
const MIMES={'.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.ogg':'audio/ogg','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
function staticFile(req,res,pathname){
  if(pathname==='/cinema'||pathname.startsWith('/cinema/')){
    const relative=pathname==='/cinema'||pathname==='/cinema/'?'index.html':pathname.slice('/cinema/'.length);
    const clean=relative==='prototype'||relative==='prototype/'?'prototype/index.html':relative;
    // Only published runtime assets may be served, never code, tests or backend files.
    if(!/^(index\.html|prototype\/index\.html|src\/[A-Za-z0-9_-]+\.(mjs|css)|story\/[A-Za-z0-9_-]+\.mjs|assets\/(keyframes|ui)\/[A-Za-z0-9_.-]+\.(webp|svg|png|jpg))$/.test(clean))
      throw new AppError('Кадр не найден.',404,'NOT_FOUND');
    const absolute=path.join(CINEMA_ROOT,clean);
    if(!fs.existsSync(absolute))throw new AppError('Ресурс не найден.',404,'NOT_FOUND');
    headers(res,MIMES[path.extname(clean)]||'application/octet-stream');
    if(clean.startsWith('assets/'))res.setHeader('Cache-Control','public,max-age=3600');
    res.statusCode=200;if(req.method==='HEAD')return res.end();
    return fs.createReadStream(absolute).pipe(res);
  }
  if(pathname.match(/^\/cards\/([A-Za-z0-9_-]{6,90})\.svg$/)){
    const id=pathname.slice('/cards/'.length,-4);
    const b=requireVisible(db,id),tree=lineage(db,id);
    headers(res,'image/svg+xml; charset=utf-8');res.statusCode=200;
    return res.end(req.method==='HEAD'?'':shareSvg(b,tree.descendants));
  }
  const branchPage=pathname.match(/^\/b\/([A-Za-z0-9_-]{6,90})\/?$/);
  let file=pathname==='/'||/^\/review\/[A-Za-z0-9_-]{43}\/?$/.test(pathname)||/^\/(reviews|pilots|command|team|delivery)\/BRF-[A-Za-z0-9_-]{13,16}\/?$/.test(pathname)||pathname==='/bridge'||pathname==='/submit'||/^\/(lab|insights)\/BRF-[A-Za-z0-9_-]{13,16}\/?$/.test(pathname)||/^\/team\/join\/[A-Za-z0-9_-]{43}\/?$/.test(pathname)||branchPage||/^\/(i|w)\/[A-Za-z0-9_-]+\/?$/.test(pathname)?'/index.html':pathname;
  if(!['/index.html','/app.js','/styles.css','/favicon.svg','/robots.txt','/site.webmanifest','/og-default.png'].includes(file))throw new AppError('Страница не найдена.',404,'NOT_FOUND');
  const actual=path.join(PUBLIC,file.slice(1));
  if(!fs.existsSync(actual))throw new AppError('Файл не найден.',404,'NOT_FOUND');
  headers(res,MIMES[path.extname(file)]||'text/plain; charset=utf-8');
  if(file!=='/index.html')res.setHeader('Cache-Control','public,max-age=300');
  res.statusCode=200;
  if(file==='/index.html'){
    if(/^\/(review|team|delivery)\//.test(pathname))res.setHeader('X-Robots-Tag','noindex,nofollow,noarchive');
    const root=PUBLIC_URL||(req.headers.host?`http://${req.headers.host}`:'http://127.0.0.1:'+PORT);
    const baseOg=`<meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image"><meta property="og:image" content="${safeXml(root)}/og-default.png">`;
    let extra=baseOg;
    if(branchPage){
      const b=requireVisible(db,branchPage[1]);
      const title=safeXml(`${b.hook.slice(0,110)} — PROTOCOL ZERO`);
      const url=safeXml(`${root}/b/${encodeURIComponent(b.id)}`);
      extra+=`<meta property="og:title" content="${title}"><meta property="og:description" content="Рекламная идея, у которой может появиться наследник. Реальные поколения, один изменяемый элемент."><meta property="og:url" content="${url}">`;
    }else{
      extra+=`<meta property="og:title" content="PROTOCOL ZERO — Наследники"><meta property="og:description" content="Одно изменение. Бесконечно много идей. Реальные ветви рекламных кампаний."><meta property="og:url" content="${safeXml(root)}">`;
    }
    const html=fs.readFileSync(actual,'utf8').replace('</head>',extra+'</head>');
    return res.end(req.method==='HEAD'?'':html);
  }
  if(req.method==='HEAD')return res.end();
  return fs.createReadStream(actual).pipe(res);
}
const server=http.createServer(async(req,res)=>{
  try{
    rateLimit('ip:'+req.socket.remoteAddress,300);
    assertOrigin(req);
    const url=new URL(req.url,'http://localhost');
    const pathname=decodeURIComponent(url.pathname);
    const outbound=pathname.match(/^\/out\/([A-Za-z0-9_-]{32})$/);
    if(outbound&&req.method==='GET'){
      const sid=getSession(req,res);rateLimit('session:'+sid);
      const target=openRedirect(db,platforms,outbound[1],sid);
      headers(res,'text/plain; charset=utf-8');res.setHeader('Location',target);res.statusCode=302;res.end('Переход к рекламному продукту.');
    }
    else if(pathname.startsWith('/api/'))await api(req,res,pathname);
    else if(req.method==='GET'||req.method==='HEAD')staticFile(req,res,pathname);
    else throw new AppError('Метод не поддерживается.',405,'METHOD_NOT_ALLOWED');
  }catch(err){if(!res.headersSent)error(res,err);}
});
if(require.main===module){server.listen(PORT,BIND,()=>console.log(`PROTOCOL ZERO v${VERSION} ${IS_PROD?'[PROD]':'[DEV]'} listening at http://${BIND}:${PORT}`));}
module.exports={server,db};
