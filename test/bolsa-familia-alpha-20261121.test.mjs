import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {BOLSA_FAMILIA_ALPHA as P,assessBolsaFamiliaAlpha as assess} from '../src/neon/bolsa-familia-alpha-policy.js'

const now=Date.parse('2026-11-21T16:00:00-03:00')
const check=overrides=>assess({cash:0,bank:0,claims:[],pixSent:0,now,...overrides})

test('kit pequeno, poções vinculadas e 2 pedidos em 7 dias',()=>{
 assert.equal(P.cash,300)
 assert.equal(P.potionCount,2)
 assert.equal(P.potionId,'pocao_m_bolsa_alpha')
 assert.equal(P.maxBalance,500)
 assert.equal(P.cooldownMs,72*60*60*1000)
 assert.equal(P.maxClaims,2)
 assert.equal(P.windowMs,7*24*60*60*1000)
 assert.equal(P.recentPixLimit,500)
})

test('saldo considera carteira e banco inclusive valores separados',()=>{
 assert.equal(check({cash:500}).ok,true)
 assert.equal(check({cash:200,bank:300}).ok,true)
 assert.equal(check({cash:201,bank:300}).status,'balance')
 assert.equal(check({cash:0,bank:501}).status,'balance')
 // Dívida negativa não pode disfarçar dinheiro realmente disponível.
 assert.equal(check({cash:2000,bank:-1900}).status,'balance')
})

test('resgate usa relógio de 72 horas e limite móvel de 7 dias',()=>{
 const first=check()
 assert.equal(first.ok,true)
 assert.deepEqual(first.claims,[now])
 assert.equal(check({claims:[now-1]}).status,'cooldown')
 assert.equal(check({claims:[now-P.cooldownMs]}).ok,true)
 const old=now-6*24*60*60*1000
 const recent=now-3*24*60*60*1000
 assert.equal(check({claims:[old,recent]}).status,'weekly')
 assert.equal(check({claims:[now-P.windowMs,now-P.cooldownMs]}).ok,true)
 assert.equal(check({claims:[now-2*P.windowMs]}).ok,true)
 assert.equal(check({claims:[now-12*60*60*1000]}).status,'cooldown')
})

test('bloqueia PIX relevante na janela e falha fechado para dados inválidos',()=>{
 assert.equal(check({pixSent:499}).ok,true)
 assert.equal(check({pixSent:500}).status,'pix')
 assert.equal(check({cash:NaN}).status,'invalid')
 assert.equal(check({claims:'wrong'}).status,'invalid')
})

test('integração: benefício atômico, não vendável, com cura e comandos na V2',()=>{
 const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
 const app=source('src/neon/bolsa-familia-alpha.js')
 const db=source('src/neon/db.js')
 const potions=source('src/neon/player-potions.js')
 const game=source('src/neon/games.js')
 const wa=source('src/neon/index.js')
 assert.match(app,/SELECT cash,bank FROM wallets WHERE jid=\$1 FOR UPDATE/)
 assert.match(app,/AND type='transfer'/)
 assert.match(app,/INSERT INTO trevo_settings\(key,value,updated_at\)/)
 assert.match(app,/INSERT INTO transactions\(from_jid,to_jid,amount,type,note\)/)
 assert.match(app,/VALUES\('system',\$1,\$2,'bolsa_familia_alpha'/)
 assert.match(app,/await c\.query\('COMMIT'\)/)
 assert.match(db,/UPDATE items SET sellable=FALSE,stackable=TRUE,price=0 WHERE id='pocao_m_bolsa_alpha'/)
 assert.match(potions,/pocao_m_bolsa_alpha:/)
 assert.match(game,/pocao_m_bolsa_alpha/)
 assert.match(wa,/claimBolsaFamiliaAlpha\(sender\)/)
 assert.match(wa,/\['bolsafamilia','bolsaalpha'\]/)
 assert.match(wa,/!bolsafamilia/)
})
