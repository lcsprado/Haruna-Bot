import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {handleAuctionAlphaCommand} from '../src/neon/auction-alpha.js'

const source=readFileSync(new URL('../src/neon/auction-alpha.js',import.meta.url),'utf8')
const endLiteral=source.match(/const END=Date\.parse\('([^']+)'\)/)?.[1]
assert.ok(endLiteral,'edição do leilão precisa ter um fim imutável')
const deadline=Date.parse(endLiteral)

test('eventos históricos não aceitam lance nem acessam banco ou licenças',async()=>{
 assert.ok(Date.now()>deadline,'este caso só é executado depois do evento histórico')
 let answer='',calls=0
 const result=await handleAuctionAlphaCommand({
  cmd:'lance',args:['99999999'],chat:'grupo@g.us',sender:'teste',name:'Teste',
  reply:async message=>{calls++;answer=String(message)}
 })
 assert.equal(result,true)
 assert.equal(calls,1)
 assert.match(answer,/encerrado/)
 assert.match(answer,/Nenhum novo lance será cobrado/)
})
test('trava temporal existe dentro da transação, depois da checagem do lote',()=>{
 const fn=source.slice(source.indexOf('export async function handleAuctionAlphaCommand('),
  source.indexOf('export async function getAuctionWebStatus('))
 const guard=fn.indexOf("if(cmd==='lance'&&Date.now()>=END)")
 const changed=fn.indexOf('const result=await change(async(state,c)=>')
 const locked=fn.indexOf("if(Date.now()>=END||state.phase!=='running'")
 const debit=fn.indexOf("UPDATE wallets SET cash=cash-$1,bank=bank-$2")
 assert.ok(guard>=0&&guard<changed)
 assert.ok(locked>changed&&locked<debit)
 assert.match(source,/const acceptingBids=!AUCTION_PAUSED_FOR_AUDIT&&state\.phase==='running'&&groupAllowed&&now>=START&&now<END/)
})
test('comando de consulta não é bloqueado pela guarda financeira de lance',()=>{
 const fn=source.slice(source.indexOf('export async function handleAuctionAlphaCommand('),
 source.indexOf('export async function getAuctionWebStatus('))
 assert.match(fn,/if\(cmd==='leilao'\)\{/)
 assert.match(fn,/state\?\.phase==='completed'\?'🏁 Leilão Oculto encerrado/)
 assert.match(fn,/if\(cmd==='lance'&&Date\.now\(\)>=END\)/)
})
