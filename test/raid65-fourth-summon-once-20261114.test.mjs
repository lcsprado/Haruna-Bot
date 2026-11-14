import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nextScheduledSummon} from '../src/neon/pet-summon-schedule.js';

const dbSource=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
const botSource=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
const altarPets=[
  {species:'pantera_profundezas',chance:32},
  {species:'guardiao_abissal',chance:23},
  {species:'dragao_trono',chance:14},
  {species:'oraculo_coroa',chance:14},
  {species:'esfinge_mares',chance:9},
  {species:'serafim_vida_abissal',chance:8}
];

test('Raids 65: first three invocations roll normally, the fourth returns Serafim and consumes the schedule',()=>{
  const config={species:'serafim_vida_abissal',at:4,completed:0};
  for(let i=1;i<=4;i++){
    const step=nextScheduledSummon(config,altarPets);
    assert.equal(step.completed,i);
    assert.equal(step.forcedSpecies,i===4?'serafim_vida_abissal':null);
    assert.equal(step.clear,i===4);
    config.completed=step.completed;
  }
  assert.equal(nextScheduledSummon(config,altarPets),null);
});

test('schedule rejects malformed, foreign and out-of-pool species to protect other altars',()=>{
  for(const wrong of [null,{},[],{species:'leviata_eternidade',at:4,completed:3},
    {species:'serafim_vida_abissal',at:0,completed:0},
    {species:'serafim_vida_abissal',at:4,completed:-1},
    {species:'serafim_vida_abissal',at:4,completed:4},
    {species:'serafim_vida_abissal',at:4,completed:3.4},
    {species:'serafim_vida_abissal',at:31,completed:0}]){
    assert.equal(nextScheduledSummon(wrong,altarPets),null,JSON.stringify(wrong));
  }
});

test('database consumes attempt with material and pet transaction and never announces a programmed drop',()=>{
  const tx=dbSource.slice(dbSource.indexOf('async function summonLegendaryPetTx('),dbSource.indexOf('export async function summonLegendaryPet('));
  assert.ok(tx.includes("scheduledKey='scheduled_summon:'+jid+':'+altar.materialId"));
  assert.ok(tx.includes("SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[scheduledKey]"));
  assert.ok(tx.includes('nextScheduledSummon(scheduledRow?.value,altar.pets)'));
  assert.ok(tx.includes("if(scheduled.clear)"));
  assert.ok(tx.includes("DELETE FROM trevo_settings WHERE key=$1',[scheduledKey]"));
  assert.ok(tx.includes("jsonb_set(value,'{completed}',to_jsonb($2::integer),true)"));
  assert.ok(tx.includes('const forcedSpecies=scheduled?.forcedSpecies||'));
  assert.ok(tx.indexOf('if(owned+universalOwned<summonCost)')<tx.indexOf('const scheduledKey='),
    'insufficient materials must not increment attempt count');
  assert.ok(tx.includes("SELECT id FROM pet_collection WHERE jid=$1 AND species=$2 LIMIT 1 FOR UPDATE"),
    'duplicate and reimbursement behavior must stay normal');
  assert.ok(!botSource.includes('GARANTIA SERAFIM')&&!botSource.includes('SERAFIM PROGRAMADO'),
    'WhatsApp must not reveal any scheduled drop');
});

test('bulk and single summoning use exactly the same transaction path',()=>{
  assert.ok(dbSource.includes('return summonLegendaryPetTx(client,jid,altar)'));
  assert.ok(dbSource.includes('const result=await summonLegendaryPetTx(client,jid,altar)'));
  assert.ok(dbSource.includes('await client.query(\'SELECT jid FROM users WHERE jid=$1 FOR UPDATE\',[jid])'));
});
