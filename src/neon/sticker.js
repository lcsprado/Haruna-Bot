import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import webp from 'node-webpmux'
import { fileTypeFromBuffer } from 'file-type'

if(ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)

const TEMP_DIR=path.join(os.tmpdir(),'alpha-bot-stickers')
const MAX_INPUT_BYTES=3*1024*1024
const MAX_OUTPUT_BYTES=512*1024
try{ fs.mkdirSync(TEMP_DIR,{recursive:true}) }catch{}

function tempFile(ext){
  return path.join(TEMP_DIR,`${randomBytes(8).toString('hex')}.${ext}`)
}

async function safeUnlink(file){
  if(!file) return
  await fs.promises.unlink(file).catch(()=>{})
}

async function convertToWebp(buffer,type){
  const input=tempFile(type.ext || (type.mime?.startsWith('video/')?'mp4':'jpg'))
  const output=tempFile('webp')
  await fs.promises.writeFile(input,buffer)

  const isVideo=type.mime?.startsWith('video/')

  try{
    await new Promise((resolve,reject)=>{
      let timer
      let job=ffmpeg(input)
        .on('error',error=>{clearTimeout(timer);reject(error)})
        .on('end',()=>{clearTimeout(timer);resolve()})
        .outputOptions([
          '-vcodec','libwebp',
          '-vf',"scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
          '-preset','default',
          '-an',
          '-vsync','0'
        ])

      if(isVideo){
        job=job.outputOptions([
          '-loop','0',
          '-ss','00:00:00.0',
          '-t','00:00:06.0',
          '-r','15'
        ])
      }else{
        job=job.outputOptions(['-lossless','0','-q:v','82'])
      }

      timer=setTimeout(()=>{job.kill('SIGKILL');reject(new Error('A conversão da figurinha excedeu 30 segundos.'))},30000)
      timer.unref?.()
      job.toFormat('webp').save(output)
    })

    return await fs.promises.readFile(output)
  }finally{
    await Promise.all([safeUnlink(input),safeUnlink(output)])
  }
}

async function addExif(webpBuffer,metadata={}){
  const input=tempFile('webp')
  const output=tempFile('webp')
  await fs.promises.writeFile(input,webpBuffer)

  try{
    const json={
      'sticker-pack-id':'alpha-bot',
      'sticker-pack-name':metadata.packName || 'Alpha Bot',
      'sticker-pack-publisher':metadata.packPublish || 'Alpha Bot',
      emojis:metadata.emojis || ['🤖','🍀']
    }

    const exifAttr=Buffer.from([
      0x49,0x49,0x2a,0x00,0x08,0x00,0x00,0x00,
      0x01,0x00,0x41,0x57,0x07,0x00,0x00,0x00,
      0x00,0x00,0x16,0x00,0x00,0x00
    ])
    const jsonBuff=Buffer.from(JSON.stringify(json),'utf8')
    const exif=Buffer.concat([exifAttr,jsonBuff])
    exif.writeUIntLE(jsonBuff.length,14,4)

    const image=new webp.Image()
    await image.load(input)
    image.exif=exif
    await image.save(output)
    return await fs.promises.readFile(output)
  }finally{
    await Promise.all([safeUnlink(input),safeUnlink(output)])
  }
}

export async function toStickerBuffer(buffer,metadata={}){
  if(!Buffer.isBuffer(buffer)) buffer=Buffer.from(buffer)
  if(buffer.length>MAX_INPUT_BYTES) throw new Error('Mídia muito grande para figurinha.')

  const type=await fileTypeFromBuffer(buffer)
  if(!type) throw new Error('Não consegui identificar o formato da mídia.')

  const supported=
    type.mime==='image/webp'
    || type.mime?.startsWith('image/')
    || type.mime?.startsWith('video/')

  if(!supported) throw new Error('Use uma imagem, vídeo ou figurinha.')

  const webpBuffer=type.mime==='image/webp'
    ? buffer
    : await convertToWebp(buffer,type)

  if(webpBuffer.length>MAX_OUTPUT_BYTES)throw new Error('A figurinha gerada excedeu 512 KB.')
  const result=await addExif(webpBuffer,metadata)
  if(result.length>MAX_OUTPUT_BYTES)throw new Error('A figurinha gerada excedeu 512 KB.')
  return result
}
