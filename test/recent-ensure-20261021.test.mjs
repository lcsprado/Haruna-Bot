import test from 'node:test'
import assert from 'node:assert/strict'
import {createRecentEnsureCache} from '../src/neon/recent-ensure.js'

test('cadastro comprovado evita INSERT redundante no mesmo intervalo',()=>{
 let at=1000
 const cache=createRecentEnsureCache({now:()=>at,ttlMs:30000})
 assert.equal(cache.isFresh('A','Ana'),false)
 cache.remember('A','Ana')
 assert.equal(cache.isFresh('A','Ana'),true)
 assert.equal(cache.isFresh('A',''),true)
 assert.equal(cache.isFresh('B','Ana'),false)
 at+=29999
 assert.equal(cache.isFresh('A','Ana'),true)
 at++
 assert.equal(cache.isFresh('A','Ana'),false)
})

test('mudança de nome invalida fast path sem perder nome anterior em chamadas vazias',()=>{
 const cache=createRecentEnsureCache()
 cache.remember('A','Ana')
 assert.equal(cache.isFresh('A','Ana'),true)
 assert.equal(cache.isFresh('A','Maria'),false)
 cache.remember('A','')
 assert.equal(cache.isFresh('A','Maria'),false)
 assert.equal(cache.isFresh('A','Ana'),true)
 cache.remember('A','Maria')
 assert.equal(cache.isFresh('A','Ana'),false)
 assert.equal(cache.isFresh('A','Maria'),true)
})

test('falha nunca é marcada automaticamente; cache limitado e invalidável',()=>{
 const cache=createRecentEnsureCache({maxEntries:2})
 assert.equal(cache.isFresh('A',''),false)
 cache.remember('A','')
 cache.remember('B','')
 cache.remember('C','')
 assert.equal(cache.isFresh('A',''),false)
 assert.equal(cache.isFresh('C',''),true)
 cache.invalidate('C')
 assert.equal(cache.isFresh('C',''),false)
})
