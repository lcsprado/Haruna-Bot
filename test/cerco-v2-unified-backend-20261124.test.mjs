import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {clanFortressStats,clanFortressOffer} from '../src/neon/clan-fortress.js'
const file=(path)=>readFileSync(new URL(path,import.meta.url),'utf8')
const config=JSON.parse(file('../web/vercel.json'))
const api=file('../src/neon/web-api.js')
const siege=file('../src/neon/clan-siege.js')
const web=file('../web/clan-siege-ui.js')
test('Vercel encaminha Cerco para o mesmo backend autenticado da V2, nao Render beta',()=>{
 assert.equal(config.rewrites.filter(x=>/clan-siege/.test(x.source)).length,0)
 const catchAll=config.rewrites.find(x=>x.source==='/api/v1/:path*')
 assert.equal(catchAll?.destination,'https://alpha-bot-whatsapp.onrender.com/api/v1/:path*')
 assert.ok(!JSON.stringify(config).includes('alpha-web-api-beta.onrender.com'))
})
test('GET e POST do Cerco so existem apos validar sessao Web com senha',()=>{
 const auth=api.indexOf('const session=await authSession(req)')
 const get=api.indexOf("url.pathname==='/api/v1/me/clan-siege'")
 const post=api.indexOf("url.pathname.startsWith('/api/v1/me/clan-siege/')")
 assert.ok(auth>0&&get>auth&&post>get)
 assert.match(api.slice(get,get+1500),/requiredWebVersion:'alpha-siege-v5-20261108'/)
 assert.match(api.slice(post,post+1750),/x-alpha-web-version/)
 assert.match(api.slice(post,post+1750),/fortress-upgrade/)
 assert.match(api.slice(post,post+1750),/sanitizePrivateRefs/)
})
test('investimento permanente independe de guerra, nao de permissao do lider',()=>{
 const code=siege.slice(siege.indexOf('export async function clanSiegeFortressUpgrade('),
   siege.indexOf('export async function clanSiegeChallenge('))
 assert.doesNotMatch(code,/gate\(\)/)
 assert.doesNotMatch(code,/group\(session\)/)
 assert.match(code,/ALPHA_CLAN_FORTRESS_UPGRADES_DISABLED/)
 assert.match(code,/return clanFortressUpgrade\(session\.jid,stat\)/)
 assert.match(file('../src/neon/clan-fortress.js'),/clan\.role!=='leader'/)
 assert.match(file('../src/neon/clan-fortress.js'),/UPDATE clans SET treasury=treasury-\$1/)
 assert.match(file('../src/neon/clan-fortress.js'),/if\(row\.upgrading_stat\)/)
})
test('bônus autenticos por nivel: Muralhas, Arsenal, Defesas',()=>{
 const stats=clanFortressStats({hp:2,attack:2,defense:1})
 assert.deepEqual(stats,{maxHp:2100,attackPct:0.04,defensePct:0.015})
 const max=clanFortressStats({hp:5,attack:5,defense:5})
 assert.deepEqual(max,{maxHp:2250,attackPct:0.1,defensePct:0.075})
 assert.deepEqual(clanFortressOffer('hp',0),{stat:'hp',nextLevel:1,cost:5000000,durationMs:4*3600000})
 assert.equal(clanFortressOffer('attack',5),null)
})
test('WEB usa valores autoritativos, preserva oferta, obra e nega compras sem flag',()=>{
 assert.match(web,/stats\.attackPct/)
 assert.match(web,/stats\.defensePct/)
 assert.match(web,/stats\.maxHp/)
 assert.match(web,/offer\?\.cost/)
 assert.match(web,/fortressUpgradesEnabled===true/)
 assert.match(web,/fortressUpgradesEnabled!==true/)
 assert.match(siege,/nextRulesVersion:V6_ON\(\)\?6:5/)
 assert.match(siege,/fortress,fortressUpgradesEnabled/)
})
