import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  FIRST_500_KEY,FIRST_500_TITLE,crossedFirst500,
  claimFirst500Title,isFirst500TitleHolder,transferFirst500Title
} from '../src/neon/first-level-500-title.js'

function fakeDb(){
  const settings=new Map()
  const client={
    statements:[],
    async query(sql,args){
      this.statements.push({sql,args})
      if(sql.includes('INSERT INTO trevo_settings')){
        const [key,jid]=args
        if(settings.has(key))return {rowCount:0,rows:[]}
        settings.set(key,{winner_jid:jid,milestone_level:500})
        return {rowCount:1,rows:[{key}]}
      }
      if(sql.includes('SELECT 1 FROM trevo_settings')){
        const [key,jid]=args
        return {rows:settings.get(key)?.winner_jid===jid?[{found:1}]:[]}
      }
      if(sql.includes('UPDATE trevo_settings')){
        const [target,source,key]=args
        if(settings.get(key)?.winner_jid===source)settings.get(key).winner_jid=target
        return {rowCount:1,rows:[]}
      }
      throw new Error('Unexpected SQL in milestone test: '+sql)
    }
  }
  return {client,settings}
}

test('reconhece cruzamento real e não concede em nível menor, repetição ou redução',()=>{
  assert.equal(crossedFirst500(499,500),true)
  assert.equal(crossedFirst500(498,507),true)
  assert.equal(crossedFirst500(499,499),false)
  assert.equal(crossedFirst500(500,501),false)
  assert.equal(crossedFirst500(550,500),false)
  assert.equal(crossedFirst500(1,1),false)
  assert.equal(crossedFirst500(0,500),false)
  assert.equal(FIRST_500_TITLE,'👑 O Primeiro dos 500')
})

test('primeira concessão ganha e segunda não recebe o título, independentemente do grupo',async()=>{
  const {client,settings}=fakeDb()
  assert.equal(await claimFirst500Title(client,'jogador-a',499,500),true)
  assert.equal(await claimFirst500Title(client,'jogador-b',499,500),false)
  assert.equal(settings.size,1)
  assert.equal(settings.get(FIRST_500_KEY)?.winner_jid,'jogador-a')
  assert.equal(await isFirst500TitleHolder(client,'jogador-a'),true)
  assert.equal(await isFirst500TitleHolder(client,'jogador-b'),false)
  assert.match(client.statements[0].sql,/ON CONFLICT\(key\) DO NOTHING/)
})

test('dois jogadores que alcançam 500 simultaneamente não duplicam o título',async()=>{
  const {client,settings}=fakeDb()
  const results=await Promise.all([
    claimFirst500Title(client,'jogador-a',499,500),
    claimFirst500Title(client,'jogador-b',499,500)
  ])
  assert.deepEqual(results.sort(),[false,true])
  assert.equal(settings.size,1)
})

test('aumento via admin não é premiação e a evolução depois de 500 não reabre disputa',async()=>{
  const {client}=fakeDb()
  assert.equal(await claimFirst500Title(client,'jogador-a',500,501),false)
  assert.equal(client.statements.length,0)
  assert.equal(await claimFirst500Title(client,'jogador-a',499,499),false)
  assert.equal(client.statements.length,0)
})

test('a conquista acompanha a mesma pessoa quando LID é consolidado com telefone',async()=>{
  const {client,settings}=fakeDb()
  await claimFirst500Title(client,'jogador-lid',499,500)
  await transferFirst500Title(client,'jogador-telefone','jogador-lid')
  assert.equal(settings.get(FIRST_500_KEY)?.winner_jid,'jogador-telefone')
  assert.equal(await isFirst500TitleHolder(client,'jogador-telefone'),true)
  assert.equal(await isFirst500TitleHolder(client,'jogador-lid'),false)
  assert.equal(await claimFirst500Title(client,'outro',499,500),false)
})

test('integração: apenas XP comum concede e o WhatsApp exibe somente no perfil',()=>{
  const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8')
  const whatsapp=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  assert.match(db,/if\(!options\.ignoreFirst500Title\)await claimFirst500Title\(client,jid,startingLevel,level\)/)
  assert.match(db,/applyExp\(client,jid,amount,\{ignoreFirst500Title:true\}\)/)
  assert.match(db,/await transferFirst500Title\(client,targetJid,sourceJid\)/)
  assert.match(whatsapp,/isFirst500TitleHolder\(db,jid\)/)
  assert.match(whatsapp,/\$\{isFirst500Champion\?' • '\+FIRST_500_TITLE:''\}/)
  assert.equal(whatsapp.split('FIRST_500_TITLE').length-1,2)
})
