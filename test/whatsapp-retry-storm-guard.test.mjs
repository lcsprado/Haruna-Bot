import test from 'node:test'
import assert from 'node:assert/strict'
import {createGroupRetryStormGuard} from '../src/neon/whatsapp-retry-storm-guard.js'

test('permite tres tentativas por mensagem de grupo e limita repeticoes',()=>{
 const guard=createGroupRetryStormGuard({maxRequestsPerMessage:3,maxRequestsPerMinute:100})
 for(let i=0;i<3;i++)assert.equal(guard.inspect({remoteJid:'123@g.us',id:'a'}).allowed,true)
 assert.equal(guard.inspect({remoteJid:'123@g.us',id:'a'}).reason,'repeat')
 assert.equal(guard.inspect({remoteJid:'123@g.us',id:'b'}).allowed,true)
})
test('limita tempestade de retries por minuto sem afetar conversas privadas',()=>{
 const guard=createGroupRetryStormGuard({maxRequestsPerMinute:2})
 assert.equal(guard.inspect({remoteJid:'123@g.us',id:'a'}).allowed,true)
 assert.equal(guard.inspect({remoteJid:'123@g.us',id:'b'}).allowed,true)
 assert.equal(guard.inspect({remoteJid:'123@g.us',id:'c'}).reason,'rate')
 assert.equal(guard.inspect({remoteJid:'123@s.whatsapp.net',id:'a'}).allowed,true)
})
test('abre janela de taxa nova e expira limite antigo por mensagem',()=>{
 let t=0
 const guard=createGroupRetryStormGuard({maxRequestsPerMessage:1,maxRequestsPerMinute:1,ttlMs:20000,now:()=>t})
 assert.equal(guard.inspect({remoteJid:'123@g.us',id:'a'}).allowed,true)
 assert.equal(guard.inspect({remoteJid:'123@g.us',id:'a'}).reason,'repeat')
 t=61000
 assert.equal(guard.inspect({remoteJid:'123@g.us',id:'a'}).allowed,true)
})
