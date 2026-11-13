import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {LEGENDARY_PVE_RULES,LEGENDARY_TRAIT_MAX,legendaryPveTrait} from '../src/neon/legendary-pve-traits.js'

const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
const app=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const ids=Object.keys(LEGENDARY_PVE_RULES)

test('especializacoes apenas para 7 armas e 7 armaduras de raid',()=>{
 assert.equal(ids.length,14)
 assert.equal(ids.filter(id=>LEGENDARY_PVE_RULES[id].category==='weapon').length,7)
 assert.equal(ids.filter(id=>LEGENDARY_PVE_RULES[id].category==='armor').length,7)
 const raidSection=db.slice(db.indexOf('export const RAID_WEAPON_FORGE_ORIGINS'),db.indexOf('export const RAID_GEAR_FORGE_ORIGINS'))
 for(const id of ids) assert.match(raidSection,new RegExp('\\b'+id+'\\s*:'))
})
test('nunca excede 10% e nao afeta itens dos 7 pecados',()=>{
 assert.equal(LEGENDARY_TRAIT_MAX,.10)
 for(const [id,rule] of Object.entries(LEGENDARY_PVE_RULES)){
  for(const ctx of ['boss','raid']){
   assert.ok(rule[ctx]>=0 && rule[ctx]<=.10,id+':'+ctx)
   const trait=legendaryPveTrait(id,10,5,ctx)
   assert.ok(trait.damage<=.10 && trait.reduction<=.10)
   assert.equal(trait.category,rule.category)
   assert.ok(trait.active)
  }
 }
 assert.equal(legendaryPveTrait('pecados_lostvayne',10,5,'boss').damage,0)
 assert.equal(legendaryPveTrait('pecados_armadura_diane',10,5,'raid').reduction,0)
})
test('passiva necessita Lv.10 e tres estrelas reais',()=>{
 for(const lv of [1,5,9]){
  for(const star of [1,3,4,5]) assert.equal(legendaryPveTrait('exterminadora_eclipse',lv,star,'boss').damage,0)
 }
 assert.equal(legendaryPveTrait('exterminadora_eclipse',10,2,'boss').damage,0)
 assert.ok(Math.abs(legendaryPveTrait('exterminadora_eclipse',10,3,'boss').damage-.03)<1e-10)
 assert.ok(Math.abs(legendaryPveTrait('exterminadora_eclipse',10,4,'boss').damage-.06)<1e-10)
 assert.ok(Math.abs(legendaryPveTrait('exterminadora_eclipse',10,5,'boss').damage-.09)<1e-10)
})
test('dano e reducao nao se misturam, nem geram valores em outras categorias',()=>{
 const w=legendaryPveTrait('katana_divina',10,5,'raid')
 const a=legendaryPveTrait('armadura_divina',10,5,'raid')
 assert.equal(w.damage,.10)
 assert.equal(w.reduction,0)
 assert.equal(a.damage,0)
 assert.equal(a.reduction,.09)
 assert.equal(Math.round(1000*(1+w.damage)),1100)
 assert.equal(Math.round(1000*(1-a.reduction)),910)
})
test('snapshot de Raid aplica bonus na entrada normal e tardia e mitiga ataque recebido',()=>{
 assert.equal((games.match(/legendaryRaidDamage:legendaryPveTrait\(st\.weapon_id,w\.level,w\.stars,'raid'\)\.damage/g)||[]).length,2)
 assert.equal((games.match(/legendaryRaidReduction:legendaryPveTrait\(st\.armor_id,a\.level,a\.stars,'raid'\)\.reduction/g)||[]).length,2)
 assert.match(games,/Math\.round\(classHit\.damage\*Number\(p\.legendaryRaidDamage\|\|0\)\)/)
 assert.match(games,/Math\.round\(protectedDamage\*\(1-Number\(p\.legendaryRaidReduction\|\|0\)\)\)/)
})
test('Boss aplica bonus antes dos tetos de dano e armadura na defesa',()=>{
 assert.match(games,/const legendaryBossWeapon=legendaryPveTrait\(st\.weapon_id,weapon\.level,weapon\.stars,'boss'\)/)
 assert.match(games,/const legendaryBossArmor=legendaryPveTrait\(st\.armor_id,armor\.level,armor\.stars,'boss'\)/)
 const from=games.indexOf('Math.round(passiveHit.damage*legendaryBossWeapon.damage)')
 const capped=games.indexOf('if(s.eventId===COLLAB_FARM_ID)',from)
 assert.ok(from>0&&capped>from,'bonus deve entrar antes do cap de eventos')
 assert.match(games,/Math\.round\(bossRawDamage\*\(1-legendaryBossArmor\.reduction\)\)/)
})
test('comando de consulta e !status exibem efeitos, sem mutacoes ou PvP novo',()=>{
 assert.match(app,/\['lendarias','lendarios'\]\.includes\(cmd\)/)
 assert.match(app,/legendaryStatus/)
 assert.match(app,/Não afeta PvP nem armas de collab/)
 assert.doesNotMatch(games,/legendaryPveTrait\(.*'pvp'\)/)
})
