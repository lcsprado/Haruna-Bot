import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parseBossAttackSelection,formatBossTargetMenu} from '../src/neon/boss-target-selection.js'

const bosses=[
  {target:'event',name:'Imperador do Eclipse',hp:61860,maxHp:61860},
  {target:'weekly',name:'Golem Ancestral do Alpha',hp:93523,maxHp:150000}
]
test('dois Bosses: !atacar sem alvo pede escolha sem iniciar automaticamente o maior',()=>{
  assert.deepEqual(parseBossAttackSelection([],bosses),{choose:true,usePet:true})
  assert.deepEqual(parseBossAttackSelection(['sempet'],bosses),{choose:true,usePet:false})
  assert.match(formatBossTargetMenu(bosses),/!atacar 1/)
  assert.match(formatBossTargetMenu(bosses),/!atacar 2/)
  assert.match(formatBossTargetMenu(bosses),/61\.860\/61\.860 HP/)
  assert.match(formatBossTargetMenu(bosses),/93\.523\/150\.000 HP/)
})
test('escolha explícita não redireciona Eclipse de 60k para Golem de 150k',()=>{
  for(const word of ['1','evento','eclipse','imperador','60k','60000']){
    assert.deepEqual(parseBossAttackSelection([word],bosses),{target:'event',usePet:true},word)
  }
  for(const word of ['2','semanal','superboss','golem','maior','150k','150000']){
    assert.deepEqual(parseBossAttackSelection([word],bosses),{target:'weekly',usePet:true},word)
  }
  assert.deepEqual(parseBossAttackSelection(['1','sempet'],bosses),{target:'event',usePet:false})
  assert.deepEqual(parseBossAttackSelection(['sozinho','2'],bosses),{target:'weekly',usePet:false})
  assert.match(parseBossAttackSelection(['1','2'],bosses).error,/apenas um Boss/)
})
test('um Boss: !atacar sem argumento seleciona o único disponível',()=>{
  assert.deepEqual(parseBossAttackSelection([],bosses.slice(0,1)),{target:'event',usePet:true})
  assert.deepEqual(parseBossAttackSelection([],bosses.slice(1)),{target:'weekly',usePet:true})
  assert.match(parseBossAttackSelection(['1'],bosses.slice(1)).error,/não está ativo/)
  assert.match(parseBossAttackSelection(['xyz'],bosses).error,/desconhecido/)
  assert.match(parseBossAttackSelection([],[]).error,/Nenhum Boss disponível/)
})
test('bot fixa alvo em ataques seguintes e reboots; evento V2 não recebe prêmio legado',()=>{
  const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
  const games=source('src/neon/games.js')
  const wa=source('src/neon/index.js')
  assert.match(games,/requestedTarget=String\(options\.target\|\|'auto'\)/)
  assert.match(games,/event\.eventId==='eclipse'/)
  assert.match(games,/requestedTarget==='auto'&&rebootEconomyEnabled\(\)&&eventAvailable&&weeklyAvailable/)
  assert.match(games,/commonV2=rebootEconomyEnabled\(\)&&!weekly\?commonBossRewardV2/)
  assert.match(games,/if\(eventMode&&!rebootEconomyEnabled\(\)\)/)
  assert.match(games,/boss_event_eclipse_v2/)
  assert.match(wa,/runBossSession\(chat,jid,name,sendReply,usePet=true,target='auto'\)/)
  assert.match(wa,/skipEnsureUser:true,target/)
  assert.match(wa,/s\.boss_id\|\|''\)\.startsWith\('event:'\)/)
  assert.match(wa,/parseBossAttackSelection\(args,targets\)/)
  assert.match(wa,/formatBossTargetMenu\(targets,prefix\)/)
})

test('restaura o fluxo antigo: especial tem prioridade e o comum volta após a conclusão semanal',()=>{
  const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
  assert.ok(games.includes("const commonAvailable=common?.mode==='common'&&Number(common.hp)>0&&!weeklyAvailable&&!eventAvailable"),'Boss comum não deve aparecer com Boss especial ativo')
  assert.ok(games.includes("if(weekly&&(!rebootEconomyEnabled()||(weekly.mode==='weekly'&&Number(weekly.hp)>0&&Number(weekly.endsAt||0)>Date.now())))"),'!boss deve deixar o comum voltar quando o semanal termina na V2, mantendo a V1')
  assert.ok(games.includes("if(requestedTarget==='common'&&rebootEconomyEnabled()&&(eventAvailable||weeklyAvailable))"),'atacar comum não deve contornar a prioridade dos especiais')
  assert.ok(games.includes("const weeklyActive=!eventActive&&(rebootEconomyEnabled()?weeklyAvailable:weekend.open)&&requestedTarget!=='common'"),'Boss semanal concluído não deve continuar sendo selecionado no lugar do comum')
  assert.ok(games.includes("const weeklyState=weekend.open&&(rebootEconomyEnabled()||!eventAvailable)?await loadWeeklyBoss(c,weekend,{create:true}):null"),'preservar o fluxo de evento da V1')
  assert.ok(games.includes('lastCommonEndedAt<60*60*1000'),'recarga comum de 60 minutos preservada')
})
