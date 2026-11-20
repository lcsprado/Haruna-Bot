import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const wa=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
const web=readFileSync(new URL('../web/app.js',import.meta.url),'utf8')
test('catálogo WA V2 não incentiva raid70 solo nem exibe os valores antigos de Boss',()=>{
 assert.match(wa,/classesOnlyRebootEnabled\(\)\?'\*Raid 70 exige 3 jogadores Lv.90\+/)
 assert.match(wa,/classesOnlyRebootEnabled\(\)\?'150 mil HP • ATK 45 • fundo R\$ 40 mil'/)
 assert.match(wa,/classesOnlyRebootEnabled\(\)\?' \(ambos Lv.21\+\)'/)
})
test('suporte de Raid aparece sem adicionar dano duplicado; Boss concluído não aparece ativo',()=>{
 assert.match(wa,/Proteção de aliados: '\+fmt\(x.alliedProtection\)/)
 assert.match(wa,/já incluído no dano total/)
 assert.match(web,/ui.data\?\.rebootV2&&Number\(p.alliedProtection\|\|0\)>0/)
 assert.match(web,/ui.data\?\.rebootV2&&Number\(p.curseTeamDamage\|\|0\)>0/)
 assert.match(web,/g.boss.mode!=='completed'/)
})
