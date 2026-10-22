'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {publicRisks,mutationGuard}=require('../src/quality');
test('WAVE 1: numerical promotional claims warn, never certify',()=>{
  const result=publicRisks({hook:'Сэкономьте 40% времени за день!',cta:'Попробовать сейчас',origin:'community',evidence:'Не проверено'});
  assert.equal(result.status,'needs_human_review');
  assert(result.findings.some(x=>x.code==='CLAIM_REQUIRES_PROOF'));
  assert.match(result.scope,/не подтверждает/);
});
test('WAVE 1: suspicious contact and link strings are blocked in mutable public genes',()=>{
  assert.throws(()=>mutationGuard('hook','Контакт sales@example.com'),x=>x.code==='CONTACT_IN_CREATIVE');
  assert.throws(()=>mutationGuard('cta','Войти на https://example.com/'),x=>x.code==='CONTACT_IN_CREATIVE');
  assert.doesNotThrow(()=>mutationGuard('hook','Посмотрите нашу коллекцию идей'));
});
test('WAVE 1: absence of red flags is not proof of a valid claim',()=>{
  const report=publicRisks({hook:'Идеи начинаются здесь',cta:'Посмотреть примеры',origin:'community',evidence:'Сведения требует проверить'});
  assert.equal(report.status,'no_automated_flags');
  assert.match(report.scope,/не подтверждает/);
});
