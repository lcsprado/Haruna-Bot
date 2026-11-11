import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {raidGoUnavailableMessage} from '../src/neon/raid-go-diagnostics.js'

const lp='player-lp',augusto='player-augusto'
const room={level:75,status:'lobby',host:augusto,hostName:'Augusto',players:{[augusto]:{jid:augusto}}}
test('Reproduz 11/11: sala do Augusto visível e LP não participante; indica entrar em vez de dizer inexistente',()=>{
 const message=raidGoUnavailableMessage({rooms:[room],sender:lp})
 assert.match(message,/Raid Lv\.75/)
 assert.match(message,/Augusto/)
 assert.match(message,/!entrar 75/)
 assert.match(message,/!go 75/)
 assert.doesNotMatch(message,/Não existe Raid pronta para iniciar/)
})
test('Mesmo que LP entre, !go somente do host: orienta aguardar Augusto',()=>{
 const joined={...room,players:{...room.players,[lp]:{jid:lp}}}
 const message=raidGoUnavailableMessage({rooms:[joined],sender:lp,level:75})
 assert.match(message,/Você já participa/)
 assert.match(message,/host.*!go 75/s)
 assert.doesNotMatch(message,/Você ainda não entrou/)
})
test('Sala em andamento oferece status e não incentiva reinício nem duplo consumo de chave',()=>{
 const message=raidGoUnavailableMessage({rooms:[{...room,status:'active'}],sender:augusto,level:75})
 assert.match(message,/já está em andamento/)
 assert.match(message,/!raid 75/)
})
test('Sem lobby expõe comando correto para reabrir ou conferir',()=>{
 assert.match(raidGoUnavailableMessage({rooms:[],sender:lp,level:75}),/Não existe sala aguardando/)
 assert.match(raidGoUnavailableMessage({rooms:[],sender:lp}),/!raid/)
})
test('Várias salas de outros hosts exigem seleção e preservam host-only',()=>{
 const message=raidGoUnavailableMessage({rooms:[room,{...room,level:70,host:'outro',hostName:'Kaique'}],sender:lp})
 assert.match(message,/várias salas/)
 assert.match(message,/Lv\.75/)
 assert.match(message,/Lv\.70/)
 assert.match(message,/host pode começar/)
})
test('Nome público do host é sanitizado contra quebra e formatação',()=>{
 const message=raidGoUnavailableMessage({rooms:[{...room,hostName:'*Augusto*\n!spam'}],sender:lp,level:75})
 assert.doesNotMatch(message,/\*\*Augusto\*\*/)
 assert.doesNotMatch(message,/\n!spam/)
})
test('Código mantém autorização host-only e recibo de status exibe o host',()=>{
 const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
 const main=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
 assert.match(games,/resolveRaidRoom\(c,chat,level\|\|null,\{host,lobbyOnly:true\}\)/)
 assert.match(games,/raidGoUnavailableMessage\(\{rooms:visible,level,sender:host\}\)/)
 assert.match(main,/👑 Host:/)
 assert.match(main,/Somente o host pode iniciar com/)
 assert.match(main,/!entrar '\+requestedRoom\.level/)
})
