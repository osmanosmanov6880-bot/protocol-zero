'use strict';
// Standalone, dependency-free server-side SDK for a connected advertising product.
// NEVER import this file into browser bundles: it uses a signing secret.
const crypto=require('node:crypto');
const ACTIONS=new Set(['artifact_created','campaign_saved']);
function validId(s){return typeof s==='string'&&/^[A-Za-z0-9_-]{32}$/.test(s);}
function parsePortal(input,allowLocalHttp){
  let url;try{url=new URL(input);}catch{throw new Error('Укажите полный адрес PROTOCOL ZERO.');}
  const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.hash||url.search||url.pathname!=='/'||
     !['https:','http:'].includes(url.protocol)||
     (url.protocol==='http:'&&(!local||!allowLocalHttp))){
    throw new Error('Используйте HTTPS адрес портала без пути и паролей (HTTP только для разрешённого localhost).');
  }
  return url.origin;
}
function createNodePartner({portalUrl,platformKey,secret,allowLocalHttp=false,timeoutMs=8000,fetchFn=fetch}={}){
  const origin=parsePortal(portalUrl,allowLocalHttp);
  if(typeof platformKey!=='string'||!/^[a-z][a-z0-9_-]{1,24}$/.test(platformKey))throw new Error('Неверный ключ платформы.');
  if(typeof secret!=='string'||secret.length<32)throw new Error('Секрет партнёра должен содержать не менее 32 символов.');
  if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)throw new Error('Некорректный timeoutMs.');
  async function signedPost(endpoint,data){
    const raw=JSON.stringify(data),timestamp=String(Math.floor(Date.now()/1000));
    const signature='sha256='+crypto.createHmac('sha256',secret).update(timestamp+'.'+raw).digest('hex');
    const res=await fetchFn(origin+endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs),
      headers:{'Content-Type':'application/json','X-PZ-Platform':platformKey,'X-PZ-Timestamp':timestamp,'X-PZ-Signature':signature},body:raw});
    const text=await res.text();
    if(Buffer.byteLength(text,'utf8')>512_000)throw new Error('Слишком большой ответ от портала.');
    let response;try{response=JSON.parse(text);}catch{throw new Error('Портал вернул не-JSON ответ.');}
    if(!res.ok){const err=new Error(response.error||('Портал вернул HTTP '+res.status));err.status=res.status;err.code=response.code;throw err;}
    return response;
  }
  async function resolve(handoffId){
    if(!validId(handoffId))throw new Error('Некорректный идентификатор передачи.');
    return signedPost('/api/integrations/v2/resolve',{handoff_id:handoffId});
  }
  async function confirm({handoffId,eventId,actionType,objectId}){
    if(!validId(handoffId)||typeof eventId!=='string'||eventId.length<8||eventId.length>100||!/^[A-Za-z0-9._:-]+$/.test(eventId)||
      !ACTIONS.has(actionType)||typeof objectId!=='string'||objectId.length<6||objectId.length>120||!/^[A-Za-z0-9._:-]+$/.test(objectId)){
      throw new Error('Некорректные данные сохранённого рекламного объекта.');
    }
    return signedPost('/api/integrations/v2/confirm',{
      event_id:eventId,handoff_id:handoffId,action_type:actionType,partner_object_id:objectId
    });
  }
  async function assignExperiment({experimentId,visitorKey}){
    if(typeof experimentId!=='string'||!/^EXP-[A-Za-z0-9_-]{16,22}$/.test(experimentId)||
       typeof visitorKey!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(visitorKey))throw new Error('Неверный эксперимент или случайный токен участника.');
    return signedPost('/api/integrations/v2/experiment-assign',{experimentId,visitorKey});
  }
  async function recordExperiment({experimentId,visitorKey,eventId,kind}){
    if(typeof experimentId!=='string'||!/^EXP-[A-Za-z0-9_-]{16,22}$/.test(experimentId)||
       typeof visitorKey!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(visitorKey)||
       typeof eventId!=='string'||!/^[A-Za-z0-9_.:-]{10,100}$/.test(eventId)||!['impression','goal'].includes(kind)){
       throw new Error('Некорректные данные A/B-события.');
    }
    return signedPost('/api/integrations/v2/experiment-event',{experimentId,visitorKey,eventId,kind});
  }
  return Object.freeze({resolve,confirm,assignExperiment,recordExperiment,portalOrigin:origin,platformKey});
}
module.exports={createNodePartner};
