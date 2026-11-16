import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'

const entry=readFileSync(new URL('../src/neon/render-whatsapp.js',import.meta.url),'utf8')
const backupService='srv-db34ae942hec738hkrr0'

test('Summoner7 permanece em espera independente de deploy automático na whatsapp-only',()=>{
 const start=entry.indexOf('const REDUNDANT_WHATSAPP_RENDER_SERVICE_ID=')
 const gate=entry.indexOf("if(process.env.ALPHA_WHATSAPP_ENABLE==='0' || standbyByService){")
 const launch=entry.indexOf("await import('./index.js')")
 assert.ok(start>0 && gate>start && launch>gate,'o import do motor WhatsApp deve ficar fora do bloco standby')
 assert.match(entry,/ALPHA_WHATSAPP_FORCE_PRIMARY!=='1'/)
 const snippet=entry.slice(start,gate)
 const mode=(serviceId,forcePrimary='0')=>vm.runInNewContext(snippet+';standbyByService;',{
   process:{env:{RENDER_SERVICE_ID:serviceId,ALPHA_WHATSAPP_FORCE_PRIMARY:forcePrimary}},
   console:{warn:()=>{}}
 })
 assert.equal(mode(backupService),true,'reserva deve ficar em espera mesmo com ALPHA_WHATSAPP_ENABLE padrão')
 assert.equal(mode('srv-db7qb38u01pc739nlvpg'),false,'principal não deve ser bloqueado pelo ID da reserva')
 assert.equal(mode(backupService,'1'),false,'override explícito de emergência existe e deve ser protegido por configuração')
 assert.match(entry,/if\(process\.env\.ALPHA_WHATSAPP_ENABLE==='0' \|\| standbyByService\)/)
})
