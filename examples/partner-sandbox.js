'use strict';
// Standalone simulation of an external advertising product. Never count this as a paying or live platform.
const http=require('node:http');
const crypto=require('node:crypto');
const path=require('node:path');
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const PORT=Number(process.env.PZ_SANDBOX_PORT||8790),HOST='127.0.0.1';
const BRIDGE_URL=process.env.PZ_BRIDGE_URL||'http://127.0.0.1:8787';
const SECRET=process.env.PZ_DEMO_PARTNER_SECRET||'';
const PLATFORM_KEY='demo_lab';
const databasePath=process.env.PZ_SANDBOX_DB_PATH||path.join(__dirname,'..','data','demo-partner.sqlite');
if(SECRET.length<32)throw new Error('PZ_DEMO_PARTNER_SECRET: запускайте через npm run demo.');
fs.mkdirSync(path.dirname(databasePath),{recursive:true});
const db=new DatabaseSync(databasePath);
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS demo_artifacts(
 id TEXT PRIMARY KEY,handoff_id TEXT NOT NULL UNIQUE,event_id TEXT NOT NULL UNIQUE,
 snapshot TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,verified_at TEXT
);`);
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const {createNodePartner}=require('../sdk/node-partner');
const partner=createNodePartner({portalUrl:BRIDGE_URL,platformKey:PLATFORM_KEY,secret:SECRET,allowLocalHttp:true});
async function callPartner(endpoint,data){
  if(endpoint.endsWith('/resolve'))return partner.resolve(data.handoff_id);
  if(endpoint.endsWith('/confirm'))return partner.confirm({handoffId:data.handoff_id,eventId:data.event_id,actionType:data.action_type,objectId:data.partner_object_id});
  throw Error('Неизвестная операция демопартнёра.');
}
function html(res,status,body){res.statusCode=status;res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Frame-Options','DENY');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");res.end(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ДЕМО / Рекламная платформа · PROTOCOL ZERO</title><style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,Arial,sans-serif;background:#101014;color:#f5f4ee}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 85% 12%,#392d4c,transparent 45%),#101014;min-height:100vh}header{border-bottom:1px solid #ffffff22;padding:26px max(22px,calc((100% - 1120px)/2));display:flex;align-items:center;justify-content:space-between;gap:18px}header strong{letter-spacing:.09em;font-size:19px}header small{display:block;color:#b8b0d4;margin-top:4px;font-size:11px;letter-spacing:.1em}.tag{border:1px solid #e4baff;border-radius:99px;padding:9px 14px;font-size:11px;font-weight:800;color:#e4baff;letter-spacing:.08em}main{max-width:1120px;padding:58px 24px 95px;margin:auto}.eyebrow{color:#b4a2ed;font-size:12px;letter-spacing:.15em;font-weight:800}h1{font-size:clamp(34px,5vw,65px);line-height:1.03;letter-spacing:-.05em;margin:20px 0 18px}h2{font-size:28px;letter-spacing:-.03em}p{color:#b4afbe;font-size:17px;line-height:1.65;max-width:680px}.grid{display:grid;grid-template-columns:1.3fr .7fr;gap:20px;margin:38px 0}.panel{background:#1d1c26;border:1px solid #35323e;border-radius:24px;padding:27px}.panel strong{color:#f7f4f3}.big{font-size:clamp(28px,3.6vw,51px);letter-spacing:-.045em;line-height:1.14;margin:15px 0 30px}.row{display:flex;gap:12px;justify-content:space-between;padding:15px 0;border-bottom:1px solid #ffffff18}.row span:first-child{color:#afabc0}button,.link{border:0;background:#d4bcff;color:#1b1429;font-weight:800;font-size:15px;padding:16px 23px;border-radius:12px;cursor:pointer;display:inline-block;text-decoration:none}button:hover{background:#efe3ff}.secondary{background:#303039;color:#ede9f1}.warning{background:#2b252b;border-left:3px solid #e8b98e;color:#f8dec8;padding:17px 19px;border-radius:9px;margin:22px 0}.success{background:#1c362d;border-left:3px solid #8ff8bd;color:#c9ffdc;padding:17px 19px;border-radius:9px;margin:24px 0}code{background:#292837;padding:3px 7px;border-radius:5px;word-break:break-all}footer{border-top:1px solid #ffffff22;padding:26px;color:#a5a0af;text-align:center}@media(max-width:760px){header{padding:20px;align-items:flex-start}main{padding:36px 20px 70px}.grid{grid-template-columns:1fr}.panel{padding:19px}.row{flex-direction:column;gap:5px}}
</style></head><body><header><div><strong>DEMO / CREATIVE STUDIO</strong><small>EXTERNAL PARTNER SANDBOX</small></div><span class="tag">НЕ РЕАЛЬНЫЙ ПРОДУКТ</span></header><main>${body}</main><footer>Локальная учебная песочница. Не подтверждает реальные продажи, рекламные результаты или работу семи компаний.</footer></body></html>`);}
function validId(s){return typeof s==='string'&&/^[A-Za-z0-9_-]{32}$/.test(s);}
async function readBody(req){return new Promise((resolve,reject)=>{let t='',n=0;req.on('data',c=>{n+=c.length;if(n<=4096)t+=c;});req.on('end',()=>n>4096?reject(Error('Большой запрос')):resolve(new URLSearchParams(t)));req.on('error',reject);});}
async function show(res,id){
  if(!validId(id))return html(res,400,'<h1>Не указан идентификатор передачи.</h1><p>Откройте PROTOCOL ZERO, создайте мутацию и нажмите «Передать в демо-мастерскую».</p><a class="link" href="http://127.0.0.1:8787">В PROTOCOL ZERO ↗</a>');
  try{
    const {brief,mode,source}=await callPartner('/api/integrations/v2/resolve',{handoff_id:id});
    if(mode!=='sandbox')throw Error('Демонстрационный редактор принимает только sandbox-передачи.');
    const existing=db.prepare('SELECT * FROM demo_artifacts WHERE handoff_id=?').get(id);
    html(res,200,`<div class="eyebrow">ПЕРЕДАЧА ПОЛУЧЕНА / ${escapeHtml(source).toUpperCase()}</div><h1>Идея дошла<br>до продукта.</h1><p>Это второй самостоятельный HTTP-сервер и отдельная SQLite-база. Он получает рекламный бриф через подписанный серверный запрос и может отправить подтверждение обратно.</p><div class="grid"><section class="panel"><div class="eyebrow">CREATIVE / ${escapeHtml(brief.brand)}</div><div class="big">${escapeHtml(brief.creative.headline)}</div><div class="row"><span>Аудитория</span><strong>${escapeHtml(brief.audience)}</strong></div><div class="row"><span>Тон</span><strong>${escapeHtml(brief.creative.tone)}</strong></div><div class="row"><span>Призыв</span><strong>${escapeHtml(brief.creative.cta)}</strong></div><div class="row"><span>Происхождение</span><strong>${escapeHtml(brief.specimenId)}</strong></div></section><aside class="panel"><div class="eyebrow">КОНТУР БЕЗОПАСНОСТИ</div><h2>Только демонстрация.</h2><p>Партнёр видит лишь бриф, который участник согласился передать. Никаких cookie PROTOCOL ZERO, email, имён или рекламных секретов.</p><div class="warning">${escapeHtml(brief.evidence)}<br><br>Нельзя выдавать этот пример за реальную работу рекламодателя.</div></aside></div>${existing?`<div class="success">Демо-макет записан в отдельную базу. ID: <code>${escapeHtml(existing.id)}</code>.<br>Подтверждение: ${existing.verified_at?'получено тестовой системой':'ожидает повторной отправки'}.</div><form method="post" action="/retry"><input type="hidden" name="handoff" value="${escapeHtml(id)}"><button>Повторить callback ↗</button></form>`:`<form method="post" action="/create"><input type="hidden" name="handoff" value="${escapeHtml(id)}"><button>Сохранить демонстрационный рекламный макет ↗</button></form><p>Кнопка создаёт настоящий локальный объект в песочнице, но не доказывает создание чего-либо на ваших семи рекламных сайтах.</p>`}`);
  }catch(err){html(res,403,`<h1>Передача недоступна.</h1><p>${escapeHtml(err.message)}</p><a class="link secondary" href="http://127.0.0.1:8787">Вернуться в PROTOCOL ZERO ↗</a>`);}
}
async function saveAndConfirm(id){
  const {brief}=await callPartner('/api/integrations/v2/resolve',{handoff_id:id});
  let row=db.prepare('SELECT * FROM demo_artifacts WHERE handoff_id=?').get(id);
  if(!row){
    const artifactId='demo-'+crypto.randomUUID(), eventId='demo-event-'+crypto.randomUUID();
    db.prepare('INSERT INTO demo_artifacts(id,handoff_id,event_id,snapshot) VALUES(?,?,?,?)').run(artifactId,id,eventId,JSON.stringify(brief));
    row=db.prepare('SELECT * FROM demo_artifacts WHERE handoff_id=?').get(id);
  }
  const result=await callPartner('/api/integrations/v2/confirm',{event_id:row.event_id,handoff_id:id,action_type:'artifact_created',partner_object_id:row.id});
  if(result.ok)db.prepare('UPDATE demo_artifacts SET verified_at=COALESCE(verified_at,CURRENT_TIMESTAMP) WHERE handoff_id=?').run(id);
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://sandbox.local');
  try{
    if(req.method==='GET'&&url.pathname==='/api/health'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,sandbox:true}));}
    if(req.method==='GET'&&url.pathname==='/')return await show(res,url.searchParams.get('pz_handoff'));
    if(req.method==='POST'&&['/create','/retry'].includes(url.pathname)){
      const origin=req.headers.origin;
      if(origin&&origin!=='http://127.0.0.1:'+PORT)throw Error('Чужой источник.');
      if(req.headers['sec-fetch-site']==='cross-site')throw Error('Запрос со стороннего сайта.');
      if(!String(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded'))throw Error('Некорректный формат.');
      const data=await readBody(req),id=data.get('handoff');
      if(!validId(id))throw Error('Некорректная передача.');
      await saveAndConfirm(id);
      res.statusCode=303;res.setHeader('Cache-Control','no-store');res.setHeader('Location','/?pz_handoff='+id);return res.end();
    }
    html(res,404,'<h1>Страница не найдена</h1>');
  }catch(err){html(res,400,`<h1>Не удалось завершить действие.</h1><p>${escapeHtml(err.message)}</p>`);}
});
if(require.main===module){server.listen(PORT,HOST,()=>console.log('DEMO PARTNER SANDBOX http://'+HOST+':'+PORT));}
module.exports={server,db};
