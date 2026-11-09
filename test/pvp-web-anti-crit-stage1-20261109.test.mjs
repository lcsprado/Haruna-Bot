import test from 'node:test'
import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {runPvpCombat} from '../src/neon/pvp-combat.js'
import {ANTI_CRIT_SHIELDS,antiCritShieldStats,effectiveShieldedCritChance,shieldedCriticalMultiplier} from '../src/neon/anti-crit-shields.js'

const fighter=(name,crit=.70,shieldCritResist=0,shieldCritGuard=0)=>({
 name,hp:9000,maxHp:9000,atk:550,def:130,spd:name==='Atacante'?600:400,
 crit,shieldCritResist,shieldCritGuard,classId:'warrior',classApplied:false,
 attackIndex:0,lastProcAttack:0,petHealUses:0,petBonus:null,petSpecies:null
})
const firstHit=(chance,guard=0,roll=.65)=>{
 const a=fighter('Atacante')
 const b=fighter('Defensor',.10,chance,guard)
 let n=0
 const random=()=>{const value=n%2===0?.5:roll;n++;return value}
 return runPvpCombat(a,b,random,1)[0]
}

test('contrato: catalogo e progressao anticritica identicos a regra WhatsApp',()=>{
 assert.deepEqual(ANTI_CRIT_SHIELDS.map(g=>g.id),[
  'escudo_madeira','escudo_ferro','escudo_runico','egide_celestial','bastiao_eclipse'
 ])
 assert.equal(antiCritShieldStats('escudo_runico',10,5).critResist,.1044)
 assert.equal(antiCritShieldStats('bastiao_eclipse',10,5).critResist,.20)
 assert.equal(antiCritShieldStats('bastiao_eclipse',10,5).critGuard,.30)
 assert.equal(effectiveShieldedCritChance(.70,.12),.58)
 assert.equal(effectiveShieldedCritChance(1,.20),.80)
 assert.equal(effectiveShieldedCritChance(.03,.20),.03)
 assert.equal(shieldedCriticalMultiplier(1.6,.30),1.42)
})

test('simulador: resistencia de escudo remove critico em pontos percentuais',()=>{
 assert.equal(firstHit(0,0,.65).crit,true,'70% precisa critar com sorteio de 65%')
 assert.equal(firstHit(.12,0,.65).crit,false,'70%-12pp=58%, logo 65% nao crita')
})

test('simulador: 100% critico sem teto antigo de 40%',()=>{
 const attacker=fighter('Atacante',1)
 const defender=fighter('Defensor',.10,.20)
 let calls=0
 const random=()=>{const value=calls%2===0?.5:.70;calls++;return value}
 assert.equal(runPvpCombat(attacker,defender,random,1)[0].crit,true,'100%-20pp=80%')
})

test('simulador: guarda reduz dano critico sem reduzir ataque normal',()=>{
 const open=firstHit(0,0,.1)
 const guard=firstHit(0,.30,.1)
 assert.equal(open.crit,true)
 assert.equal(guard.crit,true)
 assert.ok(guard.dmg<open.dmg,'a guarda deve reduzir apenas a parcela critica')
 const common=firstHit(0,0,.95)
 const commonGuard=firstHit(0,.30,.95)
 assert.equal(common.crit,false)
 assert.equal(commonGuard.crit,false)
 assert.equal(commonGuard.dmg,common.dmg)
})

// Contrato P0 incompleto: nunca marcar a API como equivalente por passar
// apenas nos testes de simulacao. battle() no db.js opera independentemente.
test('battle() real da API integra herois, Despertar, maestria e escudos',()=>{
 const dbSource=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
 const battle=dbSource.split('export async function battle(')[1]?.split('export async function ')[0]||''
 assert.match(battle,/FROM player_hero_mode m/)
 assert.match(battle,/FROM player_awakenings/)
 assert.match(battle,/heroMasteryStage:/)
 assert.match(battle,/classPvpAttack\(/)
 assert.match(battle,/heroPvpAttack\(/)
 assert.match(battle,/effectiveShieldedCritChance\(/)
 assert.match(battle,/shieldedCriticalMultiplier\(/)
 assert.match(battle,/pvpShieldStats\(/)
})
// Paridade verificada por test/pvp-web-vs-whatsapp-fixture-20261109.test.mjs (5 cenarios comparando ambas as funcoes reais).
test.todo('preservar Cerco V5 e perfil Web com estatisticas equivalentes')
