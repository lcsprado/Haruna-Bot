import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const index=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')

test('Owner raid 2x multiplier affects XP of players and pets on raid completion',()=>{
 assert.match(games,/const ownerRaid=await getOwnerEventMultiplier\(c,'raid'\)/)
 assert.match(games,/const xpMultiplier=Math\.max\([^\n]*ownerRaid,ownerGeneralXp\)/)
 assert.match(games,/const petXpMultiplier=Math\.max\([^\n]*ownerRaid,effectivePetXp\)\/effectivePetXp/)
 assert.match(games,/ownerRaidMultiplier:ownerRaid/)
})

test('30 Oct Raid 75 XP numbers already reflect 2x multiplier, avoiding double payment',()=>{
 const damages=[618626,451290,357930]
 const total=damages.reduce((sum,n)=>sum+n,0)
 const getXp=(damage,petBonus=0)=>Math.round(Math.floor(29000*(.10+.90*damage/total)*(1+petBonus))*2)
 const getPetXp=damage=>Math.floor(2800*(.15+.85*damage/total))*2
 assert.equal(getXp(damages[0],.05),29836)
 assert.equal(getXp(damages[1]),22298)
 assert.equal(getXp(damages[2]),18884)
 assert.equal(getPetXp(damages[0]),2902)
 assert.equal(getPetXp(damages[1]),2344)
})

test('Raid completion explicitly displays the event already applied',()=>{
 assert.match(index,/const raidXpEventMultiplier=Math\.max\(1,/)
 assert.match(index,/EVENTO ATIVO — /)
 assert.match(index,/Bônus já aplicado ao XP de jogador e pets/)
 assert.match(index,/Não altera dinheiro nem fragmentos/)
})
