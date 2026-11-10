import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PECADOS_HEROES,PECADOS_HERO_IDS} from '../src/neon/sete-pecados-catalog.js'
import {VITAL_PETS,VITAL_TEAM_BONUS,resolveVitalTeam} from '../src/neon/vital-pets.js'
import {resolveAstralLynxWildcard,PET_TEAM_WILDCARD_SPECIES,resolveCollabWildcardTeam} from '../src/neon/pet-astral-wildcard.js'
import {petCombatSpecialty,petPvpSpecialty} from '../src/neon/game-catalog.js'

const src=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const a=src.indexOf('const PET_TEAM_STYLE_BY_SPECIES={')
const b=src.indexOf('export const LEGENDARY_PET_SUMMONS=[',a)
assert.ok(a>=0&&b>a,'pure production team rules not found')
const block=src.slice(a,b).replace(/\bexport\s+(?=function|const)/g,'')
const factory=new Function('PECADOS_HEROES','PECADOS_HERO_IDS','VITAL_PETS','VITAL_TEAM_BONUS','resolveVitalTeam','resolveAstralLynxWildcard','PET_TEAM_WILDCARD_SPECIES','resolveCollabWildcardTeam',
 block+'\nreturn {petTeamSynergy,petStyleLabel}')
const {petTeamSynergy,petStyleLabel}=factory(PECADOS_HEROES,PECADOS_HERO_IDS,VITAL_PETS,VITAL_TEAM_BONUS,resolveVitalTeam,resolveAstralLynxWildcard,PET_TEAM_WILDCARD_SPECIES,resolveCollabWildcardTeam)
const team=(...list)=>list.map(species=>({species,hp:100,energy:20}))

test('AB-01 Vital: 3 lendários distintos ativam HP +8%, defesa -2% e pulso 5%',()=>{
 const r=petTeamSynergy(team('cervo_aurora_viva','guardiao_nucleo_vital','quimera_rubra'))
 assert.equal(r.style,'vital')
 assert.equal(r.hp,.08)
 assert.equal(r.defense,.02)
 assert.equal(r.vitalPulse,.05)
 assert.equal(r.attack,0)
 assert.equal(r.crit,0)
 assert.match(r.label,/Vínculo Vital/)
 assert.equal(petStyleLabel('serafim_vida_abissal'),'🧬 Vital')
 assert.equal(petTeamSynergy(team('cervo_aurora_viva','cervo_aurora_viva','quimera_rubra')),null)
})

test('AB-01 coringas: dois Vital + um Lince recebem fração 2/3 e não ativam Elo Universal',()=>{
 const r=petTeamSynergy(team('cervo_aurora_viva','quimera_rubra','lince_astral'))
 assert.equal(r.style,'vital')
 assert.ok(Math.abs(r.hp-(.08*2/3))<1e-12)
 assert.ok(Math.abs(r.defense-(.02*2/3))<1e-12)
 assert.ok(Math.abs(r.vitalPulse-(.05*2/3))<1e-12)
 assert.match(r.label,/2\/3/)
 assert.doesNotMatch(r.text,/Elo Universal/)
 const solo=petTeamSynergy(team('quimera_rubra','lince_astral','raposa_astral'))
 assert.ok(Math.abs(solo.hp-(.08/3))<1e-12)
 assert.equal(petTeamSynergy(team('lince_astral','raposa_astral','morcego_madrugada')),null)
 assert.equal(petTeamSynergy(team('quimera_rubra','lince_astral','leao_solar')),null)
})

test('AB-01 hero-only: nenhum dos 7 Pecados recebe sinergia como pet',()=>{
 assert.equal(petTeamSynergy(team('pecado_ban','pecado_meliodas','pecado_escanor')),null)
 assert.equal(petTeamSynergy(team('pecado_ban','quimera_rubra','lince_astral')),null)
 assert.equal(petTeamSynergy(team('pecado_ban','pecado_meliodas','leao_solar')),null)
})

test('AB-01: 3 Místicos normais seguem com redução +2% e 2 Místicos + coringa recebem fração correta',()=>{
 const full=petTeamSynergy(team('avatar_primordial','oraculo_alpha','esfinge_mares'))
 assert.equal(full.style,'mistico')
 assert.equal(full.defense,.02)
 assert.equal(full.crit,.025)
 const partial=petTeamSynergy(team('avatar_primordial','oraculo_alpha','lince_astral'))
 assert.equal(partial.style,'mistico')
 assert.ok(Math.abs(partial.defense-.02*2/3)<1e-12)
 assert.ok(Math.abs(partial.crit-.025*2/3)<1e-12)
})

test('AB-01: pet com atributo HP passa pelo catálogo e a parcela PvP não altera o PvE',()=>{
 const pve=petCombatSpecialty('quimera_rubra')
 const pvp=petPvpSpecialty('quimera_rubra',100)
 assert.ok(pve.hp>.10)
 assert.ok(pvp.hp>0)
 assert.ok(pvp.hp<=.15*.30)
 assert.ok(pve.damage>0)
})
