import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {halloweenMysticHelmetReduction} from '../src/neon/halloween-rules.js'
import {raidAttackSkillEvents,raidDefenseSkillEvents,incrementRaidSkillCounts,formatRaidSkillLine} from '../src/neon/raid-skill-summary.js'
const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')

test('AB-01: elmo Soberano das Almas concede somente 1,5% de redução, com 3 Místicos e sem aumentar dano',()=>{
 const eligible={helmetId:'halloween_elmo_almas_20261026',teamStyle:'mistico',teamCount:3}
 assert.equal(halloweenMysticHelmetReduction(eligible),.015)
 for(const bad of [
  {...eligible,teamStyle:'vital'}, {...eligible,teamCount:2},
  {...eligible,helmetId:'halloween_elmo_abobora_20261026'},
  {...eligible,teamCount:4}])assert.equal(halloweenMysticHelmetReduction(bad),0)
 assert.equal((games.match(/halloweenMysticHelmetReduction\(/g)||[]).length,3)
 assert.match(games,/halloweenHelmetId:st\.helmet_id/)
 assert.equal((games.match(/halloweenHelmetId:st\.helmet_id/g)||[]).length,2)
 assert.match(games,/baseTeamSynergy=petTeamSynergy\(teamPets\)/)
})

test('AB-01: registro de ataques distingue Ban e classes, sem atribuir passivas não ativadas',()=>{
 const ban=raidAttackSkillEvents({heroId:'pecado_ban',result:{banActivations:['Snatch','Snatch']}})
 assert.deepEqual(ban,['Snatch','Snatch'])
 const samurai=raidAttackSkillEvents({classId:'samurai',classApplied:true,critical:true,awakeningStage:5,attackIndex:6})
 assert.deepEqual(samurai,['Lâmina Perfeita'])
 const none=raidAttackSkillEvents({classId:'samurai',classApplied:false,critical:true})
 assert.deepEqual(none,[])
 const counts=incrementRaidSkillCounts({'Snatch':2},['Snatch','Lâmina Perfeita','Snatch'])
 assert.equal(counts.Snatch,4)
 assert.equal(counts['Lâmina Perfeita'],1)
 assert.equal(games.includes("incrementRaidSkillCounts(p.skillActivations,raidAttackSkillEvents({"),true)
 assert.equal(games.includes("attackIndex:p.heroId?heroAttackIndex:s.round"),true)
})

test('AB-01: habilidades de defesa só são registradas se acionadas',()=>{
 const effect=raidDefenseSkillEvents({classId:'paladin',classApplied:true,awakeningStage:5,
 previousState:{paladinMiracleUsed:false},result:{awakeningState:{paladinMiracleUsed:true}}})
 assert.deepEqual(effect,['Intervenção Divina'])
 assert.deepEqual(raidDefenseSkillEvents({heroId:'pecado_diane',classId:'paladin',classApplied:true}),[])
 assert.match(games,/incrementRaidSkillCounts\(p\.skillActivations,raidDefenseSkillEvents\(/)
})

test('AB-01: recompensas e relatórios preservam contagens, identificam herói e marcam salas parciais',()=>{
 assert.match(games,/skillActivations:\{\.\.\.\(p\.skillActivations\|\|\{\}\)\}/)
 assert.match(games,/skillTrackingPartial:Boolean\(p\.skillTrackingPartial\)/)
 assert.match(games,/p\.skillTrackingPartial=!oldBan&&Number\(p\.damage\|\|0\)>0/)
 const rendered=formatRaidSkillLine({
  activeHeroId:'pecado_escanor',skillActivations:{'Cruel Sun':8},
  skillTrackingPartial:true
 })
 assert.match(rendered,/Cruel Sun 8×/)
 assert.match(rendered,/contagem parcial/)
})

test('AB-01: coletor não modifica HP, XP, inventários nem premiações',()=>{
 const old={Snatch:1},copy=incrementRaidSkillCounts(old,['Snatch'])
 assert.equal(old.Snatch,1)
 assert.equal(copy.Snatch,2)
 assert.deepEqual(raidAttackSkillEvents({classApplied:false,heroId:null}),[])
})
