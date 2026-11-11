import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {raidGoUnavailableMessage,raidJoinUnavailableMessage,RAID_LOBBY_TTL_MS} from '../src/neon/raid-go-diagnostics.js'

const augustus='5511982964423@s.whatsapp.net'
const lp='5511948523167@s.whatsapp.net'
const room={
 gameType:'raid:75',level:75,status:'lobby',host:augustus,hostName:'Augusto',
 players:{[augustus]:{jid:augustus,alive:true}},
 createdAt:1794432551726,expiresAt:1794432851726
}
test('18h32: !raid 75 mostra uma sala já aberta por outro host',()=>{
 const when=Date.parse('2026-11-11T18:32:00-03:00')
 assert.equal(room.expiresAt>when,true)
 const message=raidGoUnavailableMessage({rooms:[room],level:null,sender:lp,now:when})
 assert.match(message,/host é \*Augusto\*/)
 assert.match(message,/!entrar 75/)
 assert.match(message,/Somente o host/)
})
test('18h32: somente Augusto pode iniciar sua sala; LP deve entrar primeiro',()=>{
 const when=Date.parse('2026-11-11T18:32:00-03:00')
 const suggested=raidGoUnavailableMessage({rooms:[room],level:75,sender:lp,now:when})
 assert.match(suggested,/!entrar 75/)
 assert.doesNotMatch(suggested,/Não existe Raid pronta/)
})
test('18h39: !entrar identifica lobby antiga expirada em 5 minutos',()=>{
 const when=Date.parse('2026-11-11T18:39:00-03:00')
 const message=raidJoinUnavailableMessage({rooms:[room],now:when})
 assert.match(message,/Augusto/)
 assert.match(message,/expirou após 5 minutos/)
 assert.match(message,/!raid 75/)
 assert.match(message,/!entrar 75/)
})
test('18h39: !go identifica a sala expirada, sem informar que está pronta',()=>{
 const when=Date.parse('2026-11-11T18:39:00-03:00')
 const message=raidGoUnavailableMessage({rooms:[room],sender:lp,now:when})
 assert.match(message,/expirou/)
 assert.match(message,/Augusto/)
 assert.doesNotMatch(message,/aguardando, mas o host/)
})
test('A nova sala pode ser acessada até 15 minutos após criação',()=>{
 assert.equal(RAID_LOBBY_TTL_MS,15*60000)
 const live={...room,expiresAt:room.createdAt+RAID_LOBBY_TTL_MS}
 const during=raidGoUnavailableMessage({rooms:[live],sender:lp,now:live.createdAt+6*60000})
 assert.match(during,/!entrar 75/)
 const after=raidJoinUnavailableMessage({rooms:[live],now:live.expiresAt+1})
 assert.match(after,/expirou após 15 minutos/)
})
test('Sala em andamento não pode ser iniciada novamente',()=>{
 const msg=raidGoUnavailableMessage({rooms:[{...room,status:'active'}],sender:lp})
 assert.match(msg,/já está em andamento/)
})
test('Nenhuma sala existente informa a forma correta de abrir uma',()=>{
 const msg=raidJoinUnavailableMessage({rooms:[],level:75})
 assert.match(msg,/!raid 75/)
})
test('Uma sala alheia não se torna propriedade do jogador pelo !raid 75',()=>{
 const src=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 assert.match(src,/requestedRoom\.host===sender/)
 assert.match(src,/!entrar '\+requestedRoom\.level/)
 assert.match(src,/Somente o host pode iniciar|somente o host pode iniciar/)
})
test('Aumenta apenas TTL de Raid manual, não o torneio ou Raidlote interno',()=>{
 const src=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
 assert.match(src,/status:'lobby',level:cfg\.level,[^\n]*expiresAt:Date\.now\(\)\+RAID_LOBBY_TTL_MS/)
 assert.match(src,/expiresAt:Date\.now\(\)\+5\*60\*1000/)
 assert.match(src,/if\(!rooms\.length\) throw new Error\(raidJoinUnavailableMessage/)
 assert.match(src,/raidGoUnavailableMessage\(\{rooms:visible,level,sender:host,now:Date\.now\(\)\}\)/)
})
test('O evento do Cofre não intercepta !raid, !go e !entrar',()=>{
 const src=readFileSync(new URL('../src/neon/cofre-destino-20261111.js',import.meta.url),'utf8')
 assert.match(src,/if\(!\['cofre','explorar'\]\.includes\(cmd\)\)return false/)
})
