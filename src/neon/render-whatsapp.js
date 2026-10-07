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
if(!src.includes("from './city.js'")) src=src.replace(npcImport,npcImport+"\nimport { initCity, listCityLocations, getCityLocation, startNpcConversation, resolveNpcConversation, robCityNpc, getDarkContractBoard, acceptDarkContract, performDarkCityAction, claimDarkContract, getDarkShop, buyDarkShopItem, getCityStanding, getNpcMemory, respondNpcMemory, spreadCityRumor, listCityRumors, maybeCreateCityEncounter, getPendingCityEncounter, resolveCityEncounter, recordPlayerRobberyIncident } from './city.js'")
if(!src.includes('await initCity()')) src=src.replace('await initNpcShops()\n  await initLoans()','await initNpcShops()\n  await initCity()\n  await initLoans()')

put('async function showNpcMerchantsMenu(chat,sender,reply){',String.raw`
  async function showCityMenu(chat,sender,reply){
    const [c,s]=await Promise.all([listCityLocations(sender),getCityStanding(sender)])
    setQuickFlow(chat,sender,'city_select',{},120000)
    let t='🏙️ *CIDADE ALPHA*\n\n⚖️ Karma: *'+(c.karma>0?'+':'')+c.karma+'* — '+c.title+
      '\n🤝 Confiança: *'+(s.trust>=0?'+':'')+s.trust+'* • 👁️ Notoriedade: *'+s.notoriety+'/100*\n\n'
    for(const x of c.locations) t+=x.locked?(x.number+'. 🌫️ *???*\n'):(x.number+'. '+x.emoji+' *'+x.name+'* — '+x.npcName+'\n')
    t+='\n👉 Responda com o número do local.\n\n🗣️ *!rumor* — ouvir os boatos\n📣 *!rumor @pessoa texto* — espalhar um rumor\n🌑 *!mercadonegro* — missões das sombras\n🚶 *!explorar* — procurar acontecimentos pela cidade\n0️⃣ Sair'
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
      t+='📌 Ativo: *'+b.active.mission.title+'* — '+b.active.progress+'/'+b.active.target+(b.active.claimed?' ✅':'')+'\n💰 R$ '+fmt(b.active.reward?.cash||b.active.mission.cash)+' • ✨ '+fmt(b.active.reward?.xp||0)+' XP'
      if(Number(b.active.progress)>=Number(b.active.target)&&!b.active.claimed) t+='\n🎁 Use *!resgatarsombras*.'
    }else{
      setQuickFlow(chat,sender,'city_dark',{},120000)
      t+='👉 Responda 1, 2 ou 3 para aceitar.'
    }
    t+='\n\n🛒 Loja clandestina: *!lojaclandestina*'
    await reply(t)
  }

  async function showDarkShop(sender,reply){
    const s=await getDarkShop(sender)
    let t='🌑 *LOJA CLANDESTINA*\n\n⚖️ Karma: *'+s.karma+'*\n🛒 Compras restantes: *'+s.remaining+'/2* neste ciclo\n\n'
    for(const g of s.goods){
      const lock=g.permitted?'':' 🔒 Karma '+g.requiredKarma+' ou inferior'
      t+=g.number+'. *'+g.name+'* — R$ '+fmt(g.price)+lock+'\n'
    }
    t+='\n👉 Comprar: *!comprarsombras número*'
    await reply(t)
  }


  async function showCityRumors(reply){
    const rows=await listCityRumors(6)
    let t='🗣️ *RUMORES DA CIDADE*\n\n'
    if(!rows.length) t+='Nenhum rumor forte circulando agora.'
    else rows.forEach((r,i)=>{
      t+=(i+1)+'. Dizem que *'+(r.accused_name||'alguém')+'* está envolvido em *'+r.claim+'*.\n'
      t+='📣 Credibilidade: *'+Number(r.credibility||0)+'%*\n\n'
    })
    t+='\n⚠️ Rumores falsos podem ser descobertos. O autor perde Karma e confiança quando a mentira cai.'
    await reply(t.trim())
  }

  async function showCityMemory(chat,sender,reply,ref){
    const m=await getNpcMemory(sender,ref)
    if(m.kind==='incident'&&m.incident?.id){
      setQuickFlow(chat,sender,'city_memory',{ref:m.location.id,incidentId:m.incident.id},120000)
      return reply('💬 *'+m.location.npcName+'*\n\n'+m.text+'\n\n1️⃣ “Eu vi.”\n2️⃣ “Não vi nada.”\n3️⃣ “Posso tentar ajudar.”\n\n9️⃣ Voltar')
    }
    setQuickFlow(chat,sender,'city_memory_idle',{ref:m.location.id},120000)
    await reply('💬 *'+m.location.npcName+'*\n\n'+m.text+'\n\n1️⃣ Continuar conversando\n2️⃣ Voltar')
  }

  function formatCityEncounterMessage(e,mention=''){
    const p=e?.payload||{}
    const who=mention?('\n👤 *'+mention+'*, essa decisão caiu nas suas mãos.\n'):'\n'
    if(e?.event_key==='monster'){
      return '👹 *EVENTO DA CIDADE — INVASÃO*\n\n'+
        '🚨 *Um monstro invadiu a cidade!*'+who+
        '\n'+(p.text||'Gritos vêm da praça. Você está perto o bastante para agir.')+
        '\n\n⚖️ *Sua decisão terá consequências:*\n'+
        '⚔️ Defender pode render *Karma, EXP e dinheiro*, mas você também pode sair ferido e ter prejuízo.\n'+
        '🚶 Ignorar evita o confronto, mas se alguém perceber que você fugiu, sua *reputação e Karma podem cair*.\n'+
        '\n🎯 *O que você faz?*\n'+
        '1️⃣ ⚔️ Defender a cidade\n'+
        '2️⃣ 🚶 Ignorar e seguir caminho\n'+
        '\n⏳ *10 minutos para decidir*\n'+
        '👉 *!cidadeevento 1* ou *!cidadeevento 2*'
    }
    if(e?.event_key==='help'){
      return '🧓 *EVENTO DA CIDADE — PEDIDO DE AJUDA*\n\n'+
        'Um morador precisa de ajuda.'+who+
        '\n'+(p.text||'Você encontra alguém machucado tentando carregar suas coisas.')+
        '\n\n⚖️ *Sua escolha pode ser lembrada:*\n'+
        '🤝 Ajudar pode melhorar *Karma e confiança* e render EXP.\n'+
        '🚶 Ignorar pode não dar em nada... ou algum NPC pode ver e comentar depois.\n'+
        '\n🎯 *O que você faz?*\n'+
        '1️⃣ 🤝 Ajudar\n'+
        '2️⃣ 🚶 Ignorar\n'+
        '\n⏳ *10 minutos para decidir*\n'+
        '👉 *!cidadeevento 1* ou *!cidadeevento 2*'
    }
    if(e?.event_key==='rob_npc'){
      return '🌒 *EVENTO DA CIDADE — OPORTUNIDADE*\n\n'+
        (p.text||'Um comerciante está andando sozinho pela noite.')+who+
        '\n👁️ Parece que ninguém está olhando... mas a cidade sempre acaba sabendo de alguma coisa.\n'+
        '\n⚖️ *Sua escolha pode mudar como os NPCs tratam você:*\n'+
        '🥷 Assaltar pode render dinheiro, mas reduz *Karma e confiança*. Se der errado, tem multa — e o NPC vai lembrar.\n'+
        '🌙 Ignorar mantém você fora do crime; alguém pode até notar que você deixou a oportunidade passar.\n'+
        '\n🎯 *O que você faz?*\n'+
        '1️⃣ 🥷 Assaltar\n'+
        '2️⃣ 🌙 Ignorar\n'+
        '\n⏳ *10 minutos para decidir*\n'+
        '👉 *!cidadeevento 1* ou *!cidadeevento 2*'
    }
    return (p.title||'🏙️ *EVENTO NA CIDADE*')+'\n\n'+(p.text||'')+'\n\n'+(p.options||[]).join('\n')+'\n\n⏳ *10 minutos para decidir*\n👉 *!cidadeevento 1* ou *!cidadeevento 2*'
  }

  async function showCityEncounter(chat,sender,reply,e){
    if(!e) return reply('🌆 Você caminhou pela cidade, mas nada fora do comum aconteceu agora.')
    await reply(formatCityEncounterMessage(e))
  }

  async function openCityService(chat,sender,reply,ref){
    const x=await getCityLocation(sender,ref)
    if(x.shopType==='contracts'){ clearQuickFlow(chat,sender); return reply(await alphaContractBoardMessage(sender)) }
    if(x.shopType==='npcs') return showNpcMerchantsMenu(chat,sender,reply)
    if(x.shopType==='dark') return showShadowMenu(chat,sender,reply)
    if(x.shopType==='gear'||x.shopType==='consumables') return showShopCategoryMenu(chat,sender,reply)
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
        try{ await showCityMemory(chat,sender,reply,x.id) }
        catch(e){ await reply('❌ '+e.message) }
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

    if(flow.stage==='city_memory'){
      if(input==='9'){ await showCityPlace(chat,sender,reply,flow.data.ref); return true }
      if(!['1','2','3'].includes(input)){ await reply('💬 Escolha *1 Eu vi*, *2 Não vi* ou *3 Posso ajudar*.'); return true }
      try{
        const r=await respondNpcMemory(sender,flow.data.ref,flow.data.incidentId,Number(input))
        await reply('💬 *RESPOSTA REGISTRADA*\n\n'+r.text+(r.karma?'\n⚖️ Karma: *+'+r.karma+'*':''))
        await showCityPlace(chat,sender,reply,flow.data.ref)
      }catch(e){ clearQuickFlow(chat,sender); await reply('❌ '+e.message) }
      return true
    }
    if(flow.stage==='city_memory_idle'){
      if(input==='2'){ await showCityPlace(chat,sender,reply,flow.data.ref); return true }
      if(input!=='1'){ await reply('Escolha *1 Continuar conversando* ou *2 Voltar*.'); return true }
      try{
        const q=await startNpcConversation(sender,flow.data.ref)
        setQuickFlow(chat,sender,'city_talk',{ref:flow.data.ref,q:q.questionId},120000)
        await reply('💬 *'+q.npcName+'*\n\n“'+q.text+'”\n\n1️⃣ Sim\n2️⃣ Não')
      }catch(e){ await reply('❌ '+e.message) }
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
        await reply('🌑 *MISSÃO ACEITA!*\n'+r.mission.title+'\n🎯 '+r.mission.description+'\n💰 R$ '+fmt(r.mission.reward?.cash||r.mission.cash)+' • ✨ '+fmt(r.mission.reward?.xp||0)+' XP\n👉 '+next)
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
          await reply(r.success
            ?'🥷 *ROUBO AO NPC BEM-SUCEDIDO!*\n💰 +R$ '+fmt(r.amount)+'\n⚖️ Karma: '+r.karma
            :'🚓 *ROUBO FRACASSOU!*\n💸 Multa: R$ '+fmt(r.amount)+'\n⚖️ Karma: '+r.karma)

        } else if(['rumor','rumores'].includes(cmd)){
          const targetMention=mentionsOf(msg)[0]
          if(!targetMention){
            await showCityRumors(reply)
          }else{
            const targetIdentity=await resolvePlayerIdentity(sock,chat,targetMention,msg)
            const target=targetIdentity.jid
            if(!target?.endsWith('@s.whatsapp.net')) return await reply('⚠️ Não consegui identificar essa pessoa.')
            await consolidateUserIdentity(target,targetIdentity.aliases)
            const claim=String(args.join(' ')||'').replace(/@\\d+/g,'').replace(/\\s+/g,' ').trim()||'roubo'
            const r=await spreadCityRumor(sender,target,claim)
            const accused=(await getProfile(target).catch(()=>null))?.push_name||'essa pessoa'
            await reply('🗣️ *RUMOR LANÇADO*\n\n📣 Você começou a espalhar que *'+accused+'* está envolvido em *'+claim+'*.\n🎲 Credibilidade inicial: *'+r.credibility+'%*\n⏳ Circula por até *24h*.\n\n⚠️ Pode afetar preços e confiança. Se a mentira for descoberta, a consequência volta para você.')
          }

        } else if(['mercadonegro','mercadosombrio','missoessombras','contratossombrios'].includes(cmd)){
          await showShadowMenu(chat,sender,reply)

        } else if(['aceitarsombras'].includes(cmd)){
          if(!args[0]) return await showShadowMenu(chat,sender,reply)
          const r=await acceptDarkContract(sender,args[0])
          await reply('🌑 *MISSÃO ACEITA!*\n'+r.mission.title+'\n🎯 '+r.mission.description+'\n💰 R$ '+fmt(r.mission.reward?.cash||r.mission.cash)+' • ✨ '+fmt(r.mission.reward?.xp||0)+' XP')

        } else if(['atacarcidade','sabotarcidade'].includes(cmd)){
          const r=await performDarkCityAction(sender,cmd==='atacarcidade'?'attack_city':'sabotage_city')
          await reply(r.success
            ?'🌑 *AÇÃO SOMBRIA CONCLUÍDA!*\n⚖️ Karma: '+r.karma+'\n🎁 Use *!resgatarsombras*.'
            :'🚨 *VOCÊ FOI PEGO!*\n💸 Multa: R$ '+fmt(r.fine)+'\n⚖️ Karma: '+r.karma)

        } else if(['resgatarsombras'].includes(cmd)){
          const r=await claimDarkContract(sender)
          await reply('🌑 *CONTRATO SOMBRIO CONCLUÍDO!*\n💰 +R$ '+fmt(r.cash)+'\n✨ +'+fmt(r.xp||0)+' XP')

        } else if(['lojaclandestina','lojasombria'].includes(cmd)){
          try{ await showDarkShop(sender,reply) }
          catch(e){ await reply('❌ '+e.message) }

        } else if(['comprarsombras','comprarsombrio'].includes(cmd)){
          if(!args[0]) return await showDarkShop(sender,reply)
          try{
            const r=await buyDarkShopItem(sender,args[0])
            await reply('🌑 *NEGÓCIO FECHADO!*\n📦 '+r.item.name+' ×1\n💸 Pago: *R$ '+fmt(r.price)+'*\n🛒 Compras restantes: *'+r.remaining+'/2*\n👁️ Sua notoriedade aumentou.')
          }catch(e){ await reply('❌ '+e.message) }

        } else if(['explorar','explorarcidade'].includes(cmd)){
          await showCityEncounter(chat,sender,reply,await maybeCreateCityEncounter(sender,{force:true}))

        } else if(['cidadeevento','eventocidade'].includes(cmd)){
          const e=await getPendingCityEncounter(sender)
          if(!e) return await reply('🏙️ Você não possui evento da cidade pendente.')
          const choice=Number(args[0])
          if(![1,2].includes(choice)) return await reply('🏙️ Use *!cidadeevento 1* ou *!cidadeevento 2*.')
          const r=await resolveCityEncounter(sender,e.id,choice)
          const cash=Number(r.cash||0)>0?'\n💰 Dinheiro: *+R$ '+fmt(r.cash)+'*':Number(r.cash||0)<0?'\n💸 Prejuízo: *-R$ '+fmt(Math.abs(r.cash))+'*':''
          const xp=Number(r.xp||0)>0?'\n✨ EXP: *+'+fmt(r.xp)+'*':''
          const karma=Number(r.karma||0)?'\n⚖️ Karma: *'+(r.karma>0?'+':'')+r.karma+'*':''
          await reply('🏙️ *CONSEQUÊNCIA*\n\n'+r.text+cash+xp+karma)

`)

if(!src.includes("'reputacao','reputação','cidade','city'")){
  src=src.replace("'reputacao','reputação','buffxp'","'reputacao','reputação','cidade','city','rumor','rumores','explorar','explorarcidade','cidadeevento','eventocidade','roubarnpc','mercadonegro','mercadosombrio','missoessombras','contratossombrios','aceitarsombras','atacarcidade','sabotarcidade','resgatarsombras','lojaclandestina','lojasombria','comprarsombras','comprarsombrio','buffxp'")
}
if(!src.includes('🏙️ *!cidade*')) src=src.replace('🏘️ *!npcs* — Helena, Mordek e Baltazar','🏙️ *!cidade* — lojas, NPCs, memória, rumores e caminhos de Karma\n🗣️ *!rumor @pessoa texto* — espalha boato; mentira pode ser descoberta\n🌑 *!mercadonegro* — missões criminosas por nível\n🚶 *!explorar* — encontros aleatórios da cidade\n🏘️ *!npcs* — Helena, Mordek e Baltazar')

put("          if(!flow) continue",String.raw`
          if(!flow && isGroup){
            try{
              const license=await getGroupLicense(chat)
              if(license && groupLicenseIsActive(license)){
                const cityEvent=await maybeCreateCityEncounter(sender)
                if(cityEvent){
                  const mention='@'+String(sender||'').split('@')[0]
                  await sock.sendMessage(chat,{
                    text:formatCityEncounterMessage(cityEvent,mention),
                    mentions:[sender]
                  }).catch(()=>{})
                }
              }
            }catch(err){
              console.error('[Cidade] encontro aleatório',err?.message||err)
            }
          }

`)

await writeFile(runtimeUrl,src,'utf8')
console.log('[Cidade] runtime WhatsApp preparado')
await import(runtimeUrl.href)
