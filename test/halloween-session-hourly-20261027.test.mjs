import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {HALLOWEEN_HOURLY_START,HALLOWEEN_SESSION_MS,HALLOWEEN_SESSION_REMINDER_MS,halloweenHourlyEnabled,halloweenSessionExpiry,halloweenSessionValid,halloweenSessionTime,halloweenSessionRemaining} from '../src/neon/halloween-session.js'

const code=readFileSync(new URL('../src/neon/halloween-alpha.js',import.meta.url),'utf8')
const start=HALLOWEEN_HOURLY_START

test('regra horária só começa na meia-noite de São Paulo de 27 de outubro',()=>{
 assert.equal(start,Date.parse('2026-10-27T00:00:00-03:00'))
 assert.equal(halloweenHourlyEnabled(start-1),false)
 assert.equal(halloweenHourlyEnabled(start),true)
 assert.equal(halloweenSessionValid({active:true},start-1,'2026-10-26'),true)
 assert.equal(halloweenSessionValid({active:true},start,'2026-10-27'),false)
})
test('sessão por jogador dura uma hora exata e não cobre o dia seguinte',()=>{
 assert.equal(HALLOWEEN_SESSION_MS,3600000)
 assert.equal(HALLOWEEN_SESSION_REMINDER_MS,300000)
 const p={active:true,lease_day:'2026-10-27',lease_expires_at:halloweenSessionExpiry(start)}
 assert.equal(halloweenSessionValid(p,start+3599999,'2026-10-27'),true)
 assert.equal(halloweenSessionValid(p,start+3600000,'2026-10-27'),false)
 assert.equal(halloweenSessionValid(p,start,'2026-10-28'),false)
 assert.equal(halloweenSessionRemaining(p.lease_expires_at,start),60)
 assert.equal(halloweenSessionRemaining(p.lease_expires_at,start+55*60000),5)
 assert.equal(halloweenSessionTime(p.lease_expires_at),'01:00')
})
test('a fila de combate só recebe sessões não expiradas',()=>{
 assert.match(code,/active=TRUE AND lease_day=\$1 AND lease_expires_at>\$2 FOR UPDATE/)
 assert.match(code,/WHERE active=TRUE AND \(lease_day<>\$1 OR lease_expires_at<=\$2\)/)
 assert.match(code,/if\(now<Number\(state.revive_at\|\|0\)\)return alerts/)
 assert.match(code,/const minute=Math.floor\(now\/HALLOWEEN_MAINTENANCE_MS\)/)
})
test('aviso ao grupo é consolidado; renewal não zera danos anteriores',()=>{
 assert.match(code,/const sessionGroups=new Map\(\)/)
 assert.match(code,/FALTAM ATÉ 5 MINUTOS/)
 assert.match(code,/SESSÃO DE HALLOWEEN ENCERRADA/)
 assert.match(code,/last_attack=CASE WHEN \$4 THEN 0 ELSE last_attack END/)
 assert.doesNotMatch(code,/SET all_damage=0/)
})
