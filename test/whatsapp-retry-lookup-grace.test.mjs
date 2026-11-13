import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupOutboundWithGrace} from '../src/neon/whatsapp-retry-lookup-grace.js';

const key=(jid='1234567890123@lid')=>({remoteJid:jid,id:'XYZ123'});

test('recupera mensagem privada que chegou ao cache depois do primeiro retry',async()=>{
 let calls=0,waits=0;
 const lookup=async()=>++calls<4?{source:'miss'}:{source:'memory',message:{conversation:'ok'}};
 const r=await lookupOutboundWithGrace(lookup,key(),{sleep:async()=>{waits++;}});
 assert.equal(r.message?.conversation,'ok');
 assert.equal(calls,4);
 assert.equal(waits,3);
});

test('limita a espera ao numero de tentativas para mensagem antiga indisponivel',async()=>{
 let calls=0;
 const r=await lookupOutboundWithGrace(async()=>{calls++;return {source:'miss'}},key(),{sleep:async()=>{},maxAttempts:6});
 assert.equal(r.source,'miss');
 assert.equal(calls,7);
});

test('nao atrasa mensagens de grupo',async()=>{
 let calls=0;
 const r=await lookupOutboundWithGrace(async()=>{calls++;return {source:'miss'}},key('120363429534634131@g.us'),{sleep:async()=>{throw Error('nao deve esperar')}});
 assert.equal(r.source,'miss');
 assert.equal(calls,1);
});

test('nao tenta novamente para retorno de armazenamento indisponivel',async()=>{
 let calls=0;
 const r=await lookupOutboundWithGrace(async()=>{calls++;return {source:'unavailable'}},key(),{sleep:async()=>{throw Error('nao deve esperar')}});
 assert.equal(r.source,'unavailable');
 assert.equal(calls,1);
});

test('nao introduz espera quando cache ja possui mensagem ou quando nao ha chave',async()=>{
 let calls=0;
 const lookup=async()=>{calls++;return {source:'memory',message:{conversation:'preservada'}}};
 const r=await lookupOutboundWithGrace(lookup,key('5511999999999@s.whatsapp.net'),{sleep:async()=>{throw Error('nao deve esperar')}});
 assert.equal(r.message.conversation,'preservada');
 assert.equal(calls,1);
});
