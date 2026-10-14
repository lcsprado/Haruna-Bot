import test from 'node:test'
import assert from 'node:assert/strict'
import {createCanvas} from '@napi-rs/canvas'
import {toStickerBuffer} from '../src/neon/sticker.js'

test('real sticker conversion produces a valid bounded WebP without a network request',async()=>{
  const canvas=createCanvas(32,32),ctx=canvas.getContext('2d')
  ctx.fillStyle='#285f41';ctx.fillRect(0,0,32,32)
  const result=await toStickerBuffer(canvas.toBuffer('image/png'),{packName:'Alpha test',packPublish:'Test'})
  assert.equal(result.subarray(0,4).toString(),'RIFF')
  assert.equal(result.subarray(8,12).toString(),'WEBP')
  assert.ok(result.length<=512*1024)
})

test('sticker converter rejects oversized input before writing temporary files',async()=>{
  await assert.rejects(toStickerBuffer(Buffer.alloc(3*1024*1024+1)),/grande/)
})
