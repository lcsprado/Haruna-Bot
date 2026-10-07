import http from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'

const port = Number(process.env.PORT || 10000)
const health = globalThis.__trevoHealth || (globalThis.__trevoHealth = {whatsapp:'starting',lastChange:Date.now(),lastOpen:0,everConnected:false})

http.createServer((req,res)=>{
  if(req.url==='/health'){
    const connected=health.whatsapp==='open'
    res.writeHead(connected?200:503,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'})
    return res.end(JSON.stringify({ok:connected,service:'alpha-bot-whatsapp',whatsapp:health.whatsapp,lastOpen:health.lastOpen||null}))
  }
  res.writeHead(200,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'})
  res.end('Alpha Bot WhatsApp online')
}).listen(port,'0.0.0.0',()=>console.log('[HTTP] Alpha Bot WhatsApp-only listening on port '+port))

const srcUrl=new URL('./index.js',import.meta.url)
const runtimeUrl=new URL('./.index-whatsapp-runtime.mjs',import.meta.url)
let src=await readFile(srcUrl,'utf8')
const put=(mark,chunk)=>{
  if(!src.includes(mark)) throw new Error('[Cidade] marcador não encontrado')
  if(!src.includes(chunk.trim().slice(0,32))) src=src.replace(mark,chunk+mark)
}
const npcImport="import { initNpcShops, listNpcShops, getNpcShop, buyNpcShopItem } from './npc-shops.js'"
if(!src.includes("from './city.js'")) src=src.replace(npcImport,npcImport+"\nimport { initCity, listCityLocations, getCityLocation, startNpcConversation, resolveNpcConversation, robCityNpc, getDarkContractBoard, acceptDarkContract, performDarkCityAction, claimDarkContract } from './city.js'")
if(!src.includes('await initCity()')) src=src.replace('await initNpcShops()\n  await initLoans()','await initNpcShops()\n  await initCity()\n  await initLoans()')

put('async function showNpcMerchantsMenu(chat,sender,reply){',String.raw`
  async function showCityMenu(chat,sender,reply){
    const c=await listCityLocations(sender)
    setQuickFlow(chat,sender,'city_select',{},120000)
    let t='🏙️ *CIDADE ALPHA*\n\n⚖️ Karma: *'+(c.karma>0?'+':'')+c.karma+'* — '+c.title+'\n\n'
    for(const x of c.locations) t+=x.locked?(x.number+'. 🌫️ *???*\n'):(x.number+'. '+x.emoji+' *'+x.name+'* — '+x.npcName+'\n')
    t+='\n👉 Responda com o número do local.\n0️⃣ Sair'
    await reply(t)
  }

  async function showCityPlace(chat,sender,reply,ref){
    const x=await getCityLocation(sender,ref)
    setQuickFlow(chat,sender,'city_place',{ref:x.id},120000)
    let t=x.emoji+' *'+x.name.toUpperCase()+'*\n\n👤 *'+x.npcName+' — '+x.title+'*\n“'+x.greeting+'”\n\n'
    t+='🤝 Reputação: *'+(x.npcReputation>0?'+':'')+x.npcReputation+'*\n⚖️ Karma: *'+(x.karma>0?'+':'')+x.karma+'*\n\n'
    t+=(x.shopType==='dark'?'1️⃣ Missões sombrias\n2️⃣ Conversar\n3️⃣ Sair':'1️⃣ Comprar / serviços\n2️⃣ Conversar\n3️⃣ Tentar roubar\n4️⃣ Sair')
    await reply(t)
  }

  async function showShadowMenu(chat,sender,reply){
    const b=await getDarkContractBoard(sender)
    let t='🌑 *MERCADO SOMBRIO*\n\n⚖️ Karma: *'+(b.karma>0?'+':'')+b.karma+'*\n\n'
    b.missions.forEach((m,i)=>t+=(i+1)+'. *'+m.title+'*\n🎯 '+m.description+'\n💰 R$ '+fmt(m.cash)+'\n\n')
    if(b.active){
      clearQuickFlow(chat,sender)
      t+='📌 Ativo: *'+b.active.mission.title+'* — '+b.active.progress+'/'+b.active.target+(b.active.claimed?' ✅':'')
      if(Number(b.active.progress)>=Number(b.active.target)&&!b.active.claimed) t+='\n🎁 Use *!resgatarsombras*.'
    }else{
      setQuickFlow(chat,sender,'city_dark',{},120000)
      t+='👉 Responda 1, 2 ou 3 para aceitar.'
    }
    await reply(t)
  }

  async function openCityService(chat,sender,reply,ref){
    const x=await getCityLocation(sender,ref)
    if(x.shopType==='contracts'){ clearQuickFlow(chat,sender); return reply(await alphaContractBoardMessage(sender)) }
    if(x.shopType==='npcs') return showNpcMerchantsMenu(chat,sender,reply)
    if(x.shopType==='dark') return showShadowMenu(chat,sender,reply)
    if(x.shopType==='gear'||x.shopType==='consumables') return shopCategoryMenu()
    if(x.shopType==='cars'){
      clearQuickFlow(chat,sender)
      let t='🚗 *CONCESSIONÁRIA DO DANTE*\n\n'
      CARS.forEach((v,i)=>t+=(i+1)+'. *'+v.name+'* — R$ '+fmt(v.price)+'\n')
      return reply(t+'\n🛒 Use *!comprarcarro número*.')
    }
    if(x.shopType==='motorcycles'){
      clearQuickFlow(chat,sender)
      let t='🏍️ *GARAGEM DO RIKO*\n\n'
      MOTORCYCLES.forEach((v,i)=>t+=(i+1)+'. *'+v.name+'* — R$ '+fmt(v.price)+'\n')
      return reply(t+'\n🛒 Use *!comprarmoto número*.')
    }
  }

`)

put("    if(flow.stage==='npc_select'){",String.raw`
    if(flow.stage==='city_select'){
      if(!/^[1-7]$/.test(input)){ await reply('🏙️ Escolha de *1 a 7*.'); return true }
      try{ await showCityPlace(chat,sender,reply,input) }catch(e){ await reply('❌ '+e.message) }
      return true
    }
    if(flow.stage==='city_place'){
      const x=await getCityLocation(sender,flow.data.ref)
      if(x.shopType==='dark'&&input==='3'){ clearQuickFlow(chat,sender); await reply('🌑 Você saiu do Mercado Sombrio.'); return true }
      if(input==='1'){ await openCityService(chat,sender,reply,x.id); return true }
      if(input==='2'){
        try{
          const q=await startNpcConversation(sender,x.id)
          setQuickFlow(chat,sender,'city_talk',{ref:x.id,q:q.questionId},120000)
          await reply('💬 *'+q.npcName+'*\n\n“'+q.text+'”\n\n1️⃣ Sim\n2️⃣ Não')
        }catch(e){ await reply('❌ '+e.message) }
        return true
      }
      if(input==='3'&&x.robbable){
        setQuickFlow(chat,sender,'city_rob',{ref:x.id},90000)
        await reply('🥷 Tentar roubar *'+x.npcName+'*?\n\n1️⃣ Sim\n2️⃣ Não\n\n⚠️ Cooldown de 2h. Falha também tem consequência.')
        return true
      }
      if(input==='4'){ clearQuickFlow(chat,sender); await reply('🏙️ Você saiu da loja.'); return true }
      await reply('Escolha uma opção válida.')
      return true
    }
    if(flow.stage==='city_talk'){
      if(!['1','2','sim','s','nao','não','n'].includes(input)){ await reply('Responda *1 Sim* ou *2 Não*.'); return true }
      const a=['1','sim','s'].includes(input)?'sim':'nao'
      try{
        const r=await resolveNpcConversation(sender,flow.data.ref,flow.data.q,a)
        clearQuickFlow(chat,sender)
        await reply((r.truthful?'✅ *VERDADE*':'🎭 *MENTIRA DESCOBERTA*')+'\n\n'+r.message+'\n🤝 Reputação: '+(r.npcRep>0?'+':'')+r.npcRep+'\n⚖️ Karma: '+(r.karma>0?'+':'')+r.karma)
      }catch(e){ clearQuickFlow(chat,sender); await reply('❌ '+e.message) }
      return true
    }
    if(flow.stage==='city_rob'){
      if(input==='2'){ await showCityPlace(chat,sender,reply,flow.data.ref); return true }
      if(input!=='1'){ await reply('Escolha *1 Sim* ou *2 Não*.'); return true }
      try{
        const r=await robCityNpc(sender,flow.data.ref)
        clearQuickFlow(chat,sender)
        await reply(r.success?'🥷 *ROUBO BEM-SUCEDIDO!*\n💰 +R$ '+fmt(r.amount)+'\n⚖️ Karma: '+r.karma:'🚓 *VOCÊ FOI PEGO!*\n💸 Multa: R$ '+fmt(r.amount)+'\n⚖️ Karma: '+r.karma)
      }catch(e){ clearQuickFlow(chat,sender); await reply('❌ '+e.message) }
      return true
    }
    if(flow.stage==='city_dark'){
      if(!['1','2','3'].includes(input)){ await reply('🌑 Escolha de *1 a 3*.'); return true }
      try{
        const r=await acceptDarkContract(sender,input)
        clearQuickFlow(chat,sender)
        const next=r.mission.task==='attack_city'?'!atacarcidade':r.mission.task==='sabotage_city'?'!sabotarcidade':'!roubarnpc 1'
        await reply('🌑 *MISSÃO ACEITA!*\n'+r.mission.title+'\n🎯 '+r.mission.description+'\n💰 R$ '+fmt(r.mission.cash)+'\n👉 '+next)
      }catch(e){ clearQuickFlow(chat,sender); await reply('❌ '+e.message) }
      return true
    }

`)

put("        } else if(['npcs','mercadores','comerciantes','mercadoalpha','lojanpc'].includes(cmd)){",String.raw`
        } else if(['cidade','city'].includes(cmd)){
          if(args[0]) await showCityPlace(chat,sender,reply,args[0])
          else await showCityMenu(chat,sender,reply)

        } else if(['roubarnpc'].includes(cmd)){
          if(!args[0]) return await reply('🥷 Use *!roubarnpc 1* ou entre pelo *!cidade*.')
          const r=await robCityNpc(sender,args[0])
          await reply(r.success?'🥷 *ROUBO AO NPC BEM-SUCEDIDO!*\n💰 +R$ '+fmt(r.amount)+'\n⚖️ Karma: '+r.karma:'🚓 *ROUBO FRACASSOU!*\n💸 Multa: R$ '+fmt(r.amount)+'\n⚖️ Karma: '+r.karma)

        } else if(['mercadosombrio','missoessombras','contratossombrios'].includes(cmd)){
          await showShadowMenu(chat,sender,reply)

        } else if(['aceitarsombras'].includes(cmd)){
          if(!args[0]) return await showShadowMenu(chat,sender,reply)
          const r=await acceptDarkContract(sender,args[0])
          await reply('🌑 *MISSÃO ACEITA!*\n'+r.mission.title+'\n🎯 '+r.mission.description)

        } else if(['atacarcidade','sabotarcidade'].includes(cmd)){
          const r=await performDarkCityAction(sender,cmd==='atacarcidade'?'attack_city':'sabotage_city')
          await reply(r.success?'🌑 *AÇÃO SOMBRIA CONCLUÍDA!*\n⚖️ Karma: '+r.karma+'\n🎁 Use *!resgatarsombras*.':'🚨 *VOCÊ FOI PEGO!*\n💸 Multa: R$ '+fmt(r.fine)+'\n⚖️ Karma: '+r.karma)

        } else if(['resgatarsombras'].includes(cmd)){
          const r=await claimDarkContract(sender)
          await reply('🌑 *CONTRATO SOMBRIO CONCLUÍDO!*\n💰 +R$ '+fmt(r.cash))

`)

if(!src.includes("'reputacao','reputação','cidade','city'")){
  src=src.replace("'reputacao','reputação','buffxp'","'reputacao','reputação','cidade','city','roubarnpc','mercadosombrio','missoessombras','contratossombrios','aceitarsombras','atacarcidade','sabotarcidade','resgatarsombras','buffxp'")
}
if(!src.includes('🏙️ *!cidade*')) src=src.replace('🏘️ *!npcs* — Helena, Mordek e Baltazar','🏙️ *!cidade* — lojas, NPCs, conversas e caminhos de Karma\n🏘️ *!npcs* — Helena, Mordek e Baltazar')

await writeFile(runtimeUrl,src,'utf8')
console.log('[Cidade] runtime WhatsApp preparado')
await import(runtimeUrl.href)
