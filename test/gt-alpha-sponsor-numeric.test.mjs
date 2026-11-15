import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {GT_SPONSORS,gtSponsorOption} from '../src/neon/gt-alpha-sponsor-rules.js'
const source=path=>readFileSync(new URL('../src/neon/'+path,import.meta.url),'utf8')
test('1, 2 e 3 escolhem patrocinadores existentes, preservando aliases',()=>{
 assert.deepEqual(['1','2','3'].map(gtSponsorOption),['oficina','pitstop','turbo'])
 assert.deepEqual(GT_SPONSORS.map(s=>s.id),['oficina','pitstop','turbo'])
 for(const id of ['oficina','pitstop','turbo'])assert.equal(gtSponsorOption(id),id)
 for(const value of ['0','4','12','','999','cancelar',null,undefined])assert.equal(gtSponsorOption(value),null)
})
test('menu numerado apresenta todas metas e exige fluxo com 5 minutos',()=>{
 const sponsors=source('gt-alpha-sponsors.js')
 const event=source('gt-alpha-event.js')
 assert.match(sponsors,/GT_SPONSORS\.map\(\(s,i\)=>/)
 assert.match(sponsors,/Responda só 1, 2 ou 3/)
 assert.match(sponsors,/withStatus\?\{text,canChoose:true\}:text/)
 assert.match(sponsors,/withStatus\?\{text,canChoose:false\}:text/)
 assert.match(sponsors,/contract\(gtSponsorOption\(id\)\)/)
 assert.match(sponsors,/ON CONFLICT\(jid,week_start\) DO NOTHING/)
 assert.match(event,/gtSponsorText\(sender,\{withStatus:true\}\)/)
 assert.match(event,/if\(menu\.canChoose\)openSponsorFlow\?\.\(\)/)
 assert.match(event,/closeSponsorFlow\?\.\(\)/)
})
test('número solto só funciona com menu individual e expira em 5min',()=>{
 const src=source('index.js')
 assert.match(src,/flow\.stage==='gt_sponsor_choose'/)
 assert.match(src,/if\(!\/\^\[1-3\]\$\/\.test\(input\)\)/)
 assert.match(src,/gtSponsorChoose\(sender,input\)/)
 assert.match(src,/clearQuickFlow\(chat,sender\)/)
 assert.match(src,/setQuickFlow\(chat,sender,'gt_sponsor_choose',\{\},5\*60\*1000\)/)
 assert.match(src,/if\(getQuickFlow\(chat,sender\)\?\.stage==='gt_sponsor_choose'\)clearQuickFlow\(chat,sender\)/)
 assert.ok(src.indexOf("if(flow.stage==='gt_sponsor_choose')")<src.indexOf("if(String(flow.stage||'').startsWith('voucher_'))"))
 assert.match(src,/const quickFlowKey=\(chat,sender\)=>/)
 assert.match(src,/await recoverQuickFlow\(chat,sender\)/)
})
