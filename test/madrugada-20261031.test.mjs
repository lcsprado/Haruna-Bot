import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 MADRUGADA_START,MADRUGADA_END,MADRUGADA_HP,MADRUGADA_EVENT_ID,MADRUGADA_GROUP,
 MADRUGADA_PET_ID,MADRUGADA_INSIGNIA_ID,MADRUGADA_MAX_SEALS,
 madrugadaPhase,madrugadaScore,madrugadaRanking,madrugadaDamage
} from '../src/neon/madrugada-rules.js'
import {PET_STATUS_SPECIALTIES,petCombatSpecialty,petPvpSpecialty} from '../src/neon/game-catalog.js'

const source=name=>readFileSync(new URL('../src/neon/'+name,import.meta.url),'utf8')
test('one event, exactly 03:33–05:48 Sao Paulo, with 3 million HP',()=>{
 assert.equal(MADRUGADA_START,Date.parse('2026-10-31T06:33:00Z'))
 assert.equal(MADRUGADA_END,Date.parse('2026-10-31T08:48:00Z'))
 assert.equal(MADRUGADA_END-MADRUGADA_START,135*60000)
 assert.equal(MADRUGADA_HP,3000000)
 assert.equal(madrugadaPhase(MADRUGADA_START-1),'scheduled')
 assert.equal(madrugadaPhase(MADRUGADA_START),'open')
 assert.equal(madrugadaPhase(MADRUGADA_END-1),'open')
 assert.equal(madrugadaPhase(MADRUGADA_END),'closed')
 assert.equal(MADRUGADA_GROUP,'120363429534634131@g.us')
})
test('70/30 score and 10-minute seals cannot be inflated',()=>{
 assert.equal(madrugadaScore({damage:100000,seals:14},100000),100)
 assert.equal(madrugadaScore({damage:100000,seals:100},100000),100)
 assert.equal(madrugadaScore({damage:50000,seals:7},100000),50)
 assert.equal(madrugadaScore({damage:200000,seals:0},100000),70)
 assert.equal(MADRUGADA_MAX_SEALS,14)
 assert.deepEqual(madrugadaRanking([{jid:'1',name:'A',damage:100,seals:14}]),[])
 const r=madrugadaRanking([
  {jid:'joao',name:'João',damage:200000,seals:0},
  {jid:'kaique',name:'Kaique',damage:150000,seals:14},
  {jid:'fake',name:'Spam',damage:0,seals:14}
 ])
 assert.deepEqual(r.map(p=>p.jid),['kaique','joao'])
 assert.equal(madrugadaDamage(1000,false,1),1000)
 assert.equal(madrugadaDamage(1000,true,1),1500)
})
test('Cerberus is true Guardian, second strongest raw power in raid catalog',()=>{
 const db=source('db.js')
 const engine=source('madrugada-amaldicoada.js')
 assert.match(db,/cerbero_0333_20261031:'guardiao'/)
 assert.match(db,/cerbero_0333_20261031:480/)
 assert.match(db,/cerbero_0333_20261031:\{base:400,growth:28/)
 assert.equal(PET_STATUS_SPECIALTIES[MADRUGADA_PET_ID].stats.defense,12)
 assert.equal(PET_STATUS_SPECIALTIES[MADRUGADA_PET_ID].stats.damage,8)
 assert.equal(PET_STATUS_SPECIALTIES[MADRUGADA_PET_ID].stats.crit,6)
 assert.equal(PET_STATUS_SPECIALTIES[MADRUGADA_PET_ID].stats.dodge,5)
 assert.equal(petCombatSpecialty(MADRUGADA_PET_ID).defense,.12)
 assert.ok(petPvpSpecialty(MADRUGADA_PET_ID,100).defense<=.045)
 assert.match(engine,/FALSE,0\)',\[entry\.jid,id,MADRUGADA_PET_NAME,energy,hp\]/)
 assert.match(engine,/\,430\,/)
 assert.match(engine,/existing\.rowCount\)throw new Error\('Cérbero já existe/)
})
test('event writes rewards only on defeat and only one pet + insignia',()=>{
 const src=source('madrugada-amaldicoada.js')
 assert.match(src,/if\(hp===0\)\{/)
 assert.match(src,/await award\(c,1,ranking\[0\]\)/)
 assert.match(src,/await award\(c,2,ranking\[1\]\)/)
 assert.match(src,/rank INTEGER PRIMARY KEY CHECK\(rank IN \(1,2\)\)/)
 assert.match(src,/ON CONFLICT DO NOTHING RETURNING rank/)
 assert.match(src,/WHERE id=\$1 AND status<>'defeated'/)
 assert.ok(!src.includes('await award(c,3,'))
 assert.match(src,/madrugada_players_20261031/)
 assert.match(src,/halloweenOrderedAttackers/)
 assert.match(src,/halloweenAttackDue/)
 assert.match(src,/!madrugada proteger/)
 assert.match(src,/if\(chat!==MADRUGADA_GROUP\)/)
 assert.ok(MADRUGADA_INSIGNIA_ID.includes('ultima_vigilia'))
 assert.ok(MADRUGADA_EVENT_ID.includes('20261031_0333'))
})
test('notices are retry-safe and sent to only the AlphaBot group',()=>{
 const src=source('madrugada-amaldicoada.js')
 assert.match(src,/sock\.sendMessage\(MADRUGADA_GROUP/)
 assert.match(src,/status:'sent'/)
 assert.match(src,/status:'failed'/)
 assert.match(src,/status:'sending'/)
 assert.match(src,/if\(now<MADRUGADA_START\)/)
 assert.match(src,/notifyOnce\(sock,'ready'/)
 assert.match(src,/notifyOnce\(sock,'start'/)
 assert.match(src,/notifyOnce\(sock,'finish'/)
 assert.match(source('index.js'),/scheduleMadrugada\(sock/)
})
