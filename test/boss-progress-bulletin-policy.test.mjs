import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BOSS_PROGRESS_LAST_REPORT_PREFIX,
  bossProgressIdentity,bossProgressSnapshot,chooseBossProgressBulletin
} from '../src/neon/boss-progress-bulletin-policy.js';

const event={
  mode:'event',name:'Imperador do Eclipse',scheduleKey:'2026-11-20',
  maxHp:61860,hp:61860,participants:{}
};
const weekly={
  mode:'weekly',name:'Golem Ancestral do Alpha',weekendKey:'2026-11-20',
  maxHp:150000,hp:136653,participants:{
    'a@s.whatsapp.net':{damage:10000},
    'b@s.whatsapp.net':{damage:3347}
  }
};

test('sem qualquer golpe não existe boletim, ainda que o Boss esteja ativo',()=>{
  assert.equal(bossProgressSnapshot(event),null);
  assert.equal(chooseBossProgressBulletin([event],{}),null);
  assert.equal(chooseBossProgressBulletin([event,{...weekly,hp:150000,participants:{}}],{}),null);
  assert.equal(bossProgressSnapshot({...weekly,participants:{}}),null);
  assert.equal(bossProgressSnapshot({...weekly,hp:weekly.maxHp}),null);
});

test('evento sem dano deixa o boss semanal com ataques aparecer',()=>{
  const choice=chooseBossProgressBulletin([event,weekly],{});
  assert.equal(choice.current.name,'Golem Ancestral do Alpha');
  assert.equal(choice.identity,'semanal-2026-11-20');
  assert.deepEqual(choice.snapshot,{hp:136653,registeredDamage:13347});
});

test('evento ativo com dano continua prioritário se houver progresso',()=>{
  const damaged={...event,hp:61000,participants:{alpha:{damage:860,attacks:5}}};
  const choice=chooseBossProgressBulletin([damaged,weekly],{});
  assert.equal(choice.current.name,'Imperador do Eclipse');
  assert.equal(choice.identity,'evento-2026-11-20');
});

test('não repete boletim de HP e dano inalterados; persiste entre ciclos',()=>{
  const previous={ [bossProgressIdentity(weekly)]:bossProgressSnapshot(weekly) };
  assert.equal(chooseBossProgressBulletin([event,weekly],previous),null);
  const attacked={...weekly,hp:136200,participants:{
    ...weekly.participants,
    'c@s.whatsapp.net':{damage:453}
  }};
  const next=chooseBossProgressBulletin([event,attacked],previous);
  assert.equal(next.snapshot.hp,136200);
  assert.equal(next.snapshot.registeredDamage,13800);
  assert.equal(chooseBossProgressBulletin([event,attacked],{
    ...previous,[next.identity]:next.snapshot
  }),null);
});

test('evento sem novidades não suprime progresso novo no boss semanal',()=>{
  const activeEvent={...event,hp:60000,participants:{a:{damage:1860}}};
  const prev={ [bossProgressIdentity(activeEvent)]:bossProgressSnapshot(activeEvent) };
  const choice=chooseBossProgressBulletin([activeEvent,weekly],prev);
  assert.equal(choice.current.name,'Golem Ancestral do Alpha');
});

test('mudança de registro conta como progresso, mesmo se HP atual for igual',()=>{
  const prev={[bossProgressIdentity(weekly)]:bossProgressSnapshot(weekly)};
  const changed={...weekly,participants:{
    ...weekly.participants,'new@s.whatsapp.net':{damage:50}
  }};
  assert.equal(chooseBossProgressBulletin([changed],prev).snapshot.registeredDamage,13397);
});

test('agendador usa a política e marcador persistente só após envio',()=>{
  const src=fs.readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
  const start=src.indexOf('async function broadcastBossProgressEvery30Minutes()');
  const end=src.indexOf('if(bossProgressScheduler) clearInterval(',start);
  assert.ok(start>0&&end>start);
  const fn=src.slice(start,end);
  assert.match(fn,/const reportable=candidates.filter\(bossProgressSnapshot\)/);
  assert.match(fn,/chooseBossProgressBulletin\(reportable,prior\)/);
  assert.match(fn,/if\(!chosen\)return/);
  assert.match(fn,/if\(sent>0\)/);
  assert.match(fn,/BOSS_PROGRESS_LAST_REPORT_PREFIX\+bossIdentity/);
  assert.match(fn,/⚔️ Para lutar, use \*!atacar\*\./);
  assert.doesNotMatch(fn,/O combate continua automaticamente/);
  assert.match(fn,/slotMs=30\*60\*1000/);
  assert.ok(BOSS_PROGRESS_LAST_REPORT_PREFIX.startsWith('boss_progress_'));
});
