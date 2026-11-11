import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  getRaidLotePublicBoard,getRaidLoteCurrentProgress,
  formatRaidLoteProgress,formatRaidLotePublicBoard
} from '../src/neon/raid-lote-public.js'

test('painel consulta apenas jogos e nomes, sem saldo ou mutacao',async()=>{
  const captured=[]
  const db={query:async(sql,args)=>{
    captured.push({sql,args})
    return {rows:[{player_name:'Joao Pedro',jid:'5511000000000@s.whatsapp.net',
      level:75,status:'running',started:3,won_count:2,requested:10,
      attempt_seq:3,battle_status:'active',battle_round:'18',boss_hp:'350000',boss_max_hp:'1000000',last_round_at:'1700000000000'}]}
  }}
  const data=await getRaidLotePublicBoard(db,100)
  assert.equal(data.length,1)
  assert.deepEqual(captured[0].args,[15])
  assert.match(captured[0].sql,/DISTINCT ON \(j\.jid\)/)
  assert.match(captured[0].sql,/FROM raid_lote_jobs/)
  assert.match(captured[0].sql,/LEFT JOIN trevo_games/)
  assert.match(captured[0].sql,/NOW\(\)-INTERVAL '24 hours'/)
  assert.doesNotMatch(captured[0].sql,/UPDATE |DELETE |INSERT /)
  const output=formatRaidLotePublicBoard(data,1700000010000)
  assert.match(output,/Joao Pedro/)
  assert.match(output,/2\/10 vitórias/)
  assert.match(output,/Rodada: 18/)
  assert.match(output,/35%/)
  assert.match(output,/há 10s/)
  assert.doesNotMatch(output,/5511000000000/)
})
test('painel lista derrota, termino e fila; nenhum jogador ficticio se vazio',()=>{
  const rows=[{player_name:'*NOME\nINJETADO*',level:75,status:'lost',won_count:0,requested:5,started:1},
    {player_name:'Guto',level:10,status:'won',won_count:10,requested:10,started:10},
    {player_name:'Augusto',level:70,status:'queued',won_count:0,requested:3,started:0}]
  const rendered=formatRaidLotePublicBoard(rows)
  assert.match(rendered,/NOME INJETADO/)
  assert.doesNotMatch(rendered,/\*NOME/)
  assert.match(rendered,/DERROTA/)
  assert.match(rendered,/CONCLUÍDO/)
  assert.match(rendered,/AGUARDANDO/)
  assert.match(formatRaidLotePublicBoard([]),/Nenhum pacote/)
})
test('status de tentativa existente mostra ultima rodada e alerta atraso',()=>{
  const progress=formatRaidLoteProgress({
    attempt_seq:1,battle_status:'active',battle_round:'30',
    boss_hp:'800',boss_max_hp:'1000',last_round_at:'1700000000000'
  },1700000095000)
  assert.match(progress,/Rodada: 30/)
  assert.match(progress,/80%/)
  assert.match(progress,/sem avanço recente/)
  assert.equal(formatRaidLoteProgress(null),'')
})
test('consulta de tentativa confere job id para nao expor combate de outro pacote',async()=>{
  const db={query:async(sql,args)=>{
    assert.deepEqual(args,['att-a','job-a'])
    assert.match(sql,/a\.id=\$1 AND a\.job_id=\$2/)
    assert.doesNotMatch(sql,/UPDATE |INSERT |DELETE /)
    return {rows:[{attempt_seq:1,battle_round:'3',battle_status:'active'}]}
  }}
  assert.equal((await getRaidLoteCurrentProgress(db,{id:'job-a',current_attempt_id:'att-a'})).attempt_seq,1)
  assert.equal(await getRaidLoteCurrentProgress(db,{id:'job-a'}),null)
})
test('compra e consulta liberadas no grupo, com alvo apenas em leitura; cancelamento segue autor',()=>{
  const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  const start=source.indexOf("} else if(['raidlote'].includes(cmd)){")
  const end=source.indexOf("} else if(['raid','raidstatus'].includes(cmd))",start)
  assert.ok(start>0&&end>start)
  const command=source.slice(start,end)
  assert.doesNotMatch(command,/if\(isGroup\)return await reply\('🔒/)
  assert.match(command,/getRaidLotePublicBoard\(db,12\)/)
  assert.match(command,/mentionsOf\(msg\)\[0\]/)
  assert.match(command,/getRaidLoteJob\(db,target\)/)
  assert.match(command,/cancelRaidLote\(db,sender\)/)
  assert.match(command,/purchaseRaidLote\(db,\{jid:sender,/)
  assert.match(command,/createHash\('sha256'\)\.update\(sender\+':'\+chat\+':'\+messageId\)/)
  assert.match(command,/confirmar/)
})
