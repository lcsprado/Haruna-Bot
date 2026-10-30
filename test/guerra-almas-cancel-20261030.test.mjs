import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const src=readFileSync(new URL('../src/neon/guerra-almas-v2.js',import.meta.url),'utf8')
test('cancelamento bloqueia prêmios numa transação e mantém snapshot anterior',()=>{
 assert.match(src,/CANCELLATION_SNAPSHOT=KEY\+':cancelled_by_owner_20261030_snapshot'/)
 assert.match(src,/await c\.query\('BEGIN'\)/)
 assert.match(src,/FOR UPDATE/)
 assert.match(src,/if\(!s\.cancelled&&s\.secretEdition===EDITION&&!s\.final\)/)
 assert.match(src,/CANCELLATION_SNAPSHOT,JSON\.stringify\(s\)/)
 assert.match(src,/s\.cancelled=true/)
 assert.match(src,/s\.phase='cancelled'/)
 assert.match(src,/s\.final=\{cancelled:true,cancelledAt,rewardsGranted:false\}/)
 assert.match(src,/s\.notices=\[\]/)
 assert.match(src,/await c\.query\('COMMIT'\)/)
 assert.match(src,/ROLLBACK/)
})
test('impede continuar rodadas/comandos e remove avisos anteriores',()=>{
 assert.match(src,/if\(s\.cancelled\)return;await ensureRestart/)
 assert.match(src,/if\(s\.cancelled\)return '🚫/)
 assert.match(src,/const out=await handler\(c,s\)/)
 assert.match(src,/queue\(s,'cancel'/)
 assert.match(src,/s\.notices=\[\]/)
 assert.match(src,/if\(finished===true&&timer\)\{clearInterval\(timer\)/)
})
test('aviso somente do cancelamento aos dois grupos existentes',()=>{
 assert.match(src,/const GROUPS=Object\.freeze\(\['120363410230588690@g\.us','120363429534634131@g\.us'\]\)/)
 assert.match(src,/GROUPS\.filter\(g=>!\(n\.sentGroups\|\|\[\]\)\.includes\(g\)\)/)
 assert.match(src,/await sock\.sendMessage\(group,\{text:n\.text\}\)/)
 assert.match(src,/Nenhuma Alma, XP ou Caixa Lendária será distribuída/)
})
