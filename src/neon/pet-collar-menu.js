import {MYTHIC_COLLAR_MATERIALS,MYTHIC_COLLAR_FEE,petCollar} from './pet-collars.js'
const ranks=['⚪ Comum','🟢 Incomum','🔵 Rara','🟣 Épica','🟠 Lendária','🔴 Mítica']
const names={coleira_egide_primordial:'Égide Primordial',nucleo_pedra:'Fragmentos Raid 10',olho_abissal:'Fragmentos Raid 20',essencia_rei_abissal:'Fragmentos Raid 30',fragmento_caos:'Fragmentos Raid 60'}
const busy=new Set()
export async function collarMenu({jid,chat,stage='main',data={},input,reply,setFlow,clearFlow,api,fmt}){
 const key=chat+'|'+jid
 if(busy.has(key))return
 busy.add(key)
 try{
 const catalog=api.catalog()
 if(!catalog.length){clearFlow();return await reply('Coleiras disponíveis somente na V2.')}
 const [pets0,inventory,team]=await Promise.all([api.pets(jid),api.inventory(jid),api.team(jid)])
 const slots=new Map(team.map(p=>[Number(p.id),Number(p.slot)]))
 const pets=pets0.filter(p=>p.id!=null).sort((a,b)=>(slots.get(Number(a.id))||99)-(slots.get(Number(b.id))||99)||Number(a.id)-Number(b.id))
 const count=id=>Number(inventory.find(x=>x.item_id===id)?.quantity||0)
 const label=c=>ranks[catalog.findIndex(x=>x.id===c.id)]+' • '+c.name
 const current=p=>petCollar(p?.collar_id)
 const nav='\n\n0️⃣ Voltar'
 const show=async (next,values,msg)=>{setFlow('collar_'+next,values,300000);return await reply(msg)}
 const main=()=>show('main',{},'🐾 *CENTRAL DE COLEIRAS — ALPHA V2*\n\n📿 Coleiras adquiridas: '+(catalog.reduce((n,c)=>n+count(c.id),0)+pets.filter(p=>current(p)).length)+'\n🛡️ Pets protegidos: '+pets.filter(p=>current(p)).length+'/'+pets.length+'\n\n1️⃣ 🛒 Loja de Coleiras\n2️⃣ 🎒 Minhas Coleiras\n3️⃣ 🐾 Equipar Coleira\n4️⃣ 🔓 Remover Coleira\n5️⃣ 🔨 Forja Mítica\n6️⃣ 📖 Informações\n\n0️⃣ Sair')
 const shop=()=>show('shop',{},'🛒 *LOJA DE COLEIRAS*\n\n'+catalog.map((c,i)=>(i+1)+'. '+label(c)+'\n🛡️ -'+c.percent+'% dano recebido • '+(c.price?'R$ '+fmt(c.price):'Forja exclusiva')).join('\n\n')+nav)
 const inv=()=>show('inventory',{},'🎒 *MINHAS COLEIRAS*\n\n'+catalog.map(c=>label(c)+' — '+count(c.id)+' livre(s) • '+pets.filter(p=>p.collar_id===c.id).length+' equipada(s)').join('\n')+nav)
 const forge=()=>show('forge',{},'🔨 *FORJA MÍTICA — CORAÇÃO DE ADAMANTIUM*\n🛡️ -25% dano recebido\n\n'+Object.entries(MYTHIC_COLLAR_MATERIALS).map(([id,n])=>(count(id)>=n?'✅':'❌')+' '+names[id]+': '+fmt(count(id))+'/'+fmt(n)+' • faltam '+fmt(Math.max(0,n-count(id)))).join('\n')+'\n💰 Custo: R$ '+fmt(MYTHIC_COLLAR_FEE)+'\n\n1️⃣ Confirmar fabricação'+nav)
 const pick=({mode='equip',page=0,itemId=null}={})=>{
 const eligible=pets.filter(p=>mode!=='remove'||current(p)).filter(p=>!itemId||p.collar_id!==itemId)
 const total=Math.max(1,Math.ceil(eligible.length/5));page=Math.min(Math.max(0,page),total-1)
 const rows=eligible.slice(page*5,page*5+5)
 return show('pets',{mode,page,itemId,ids:rows.map(p=>p.id)},'🐾 *'+(mode==='remove'?'REMOVER':'EQUIPAR')+' COLEIRA*\n\n'+(rows.map((p,i)=>(i+1)+'. *'+p.name+'*'+(slots.has(Number(p.id))?' • Time '+slots.get(Number(p.id)):'')+'\n🛡️ '+(current(p)?current(p).name+' (-'+current(p).percent+'%)':'Sem coleira')).join('\n\n')||'Nenhum pet disponível.')+'\n\nPágina '+(page+1)+'/'+total+(page>0?'\n8️⃣ Página anterior':'')+(page+1<total?'\n9️⃣ Próxima página':'')+nav)
 }
 const select=(p)=>{const options=catalog.filter(c=>count(c.id)>0&&p.collar_id!==c.id);return show('select',{petId:p.id,ids:options.map(c=>c.id)},'🐾 *'+p.name+'*\n🛡️ Atual: '+(current(p)?current(p).name+' (-'+current(p).percent+'%)':'Sem coleira')+'\n\n'+(options.map((c,i)=>(i+1)+'. '+label(c)+' — '+c.percent+'% • '+count(c.id)+' livre(s)').join('\n')||'Nenhuma coleira livre. Visite a loja.')+(current(p)?'\n7️⃣ Remover coleira atual':'')+nav)}
 const compare=(p,c)=>show('equip_confirm',{petId:p.id,itemId:c?.id||null,previous:p.collar_id||null},'🛡️ *CONFIRMAR '+(c?'EQUIPAMENTO':'REMOÇÃO')+'*\n\n🐾 '+p.name+'\nAtual: '+(current(p)?.percent||0)+'%\nNova: '+(c?.percent||0)+'%'+(current(p)?'\nA coleira anterior volta ao inventário.':'')+'\n\n1️⃣ Confirmar'+nav)
 const digit=/^[0-9]$/.test(String(input??''))?Number(input):-1
 if(input==null){const p=pets.find(p=>Number(p.id)===Number(data.petId));return p?select(p):main()}
 if(['sair','cancelar','cancel'].includes(input)||(stage==='main'&&digit===0)){clearFlow();return await reply('✅ Central de coleiras encerrada.')}
 if(digit===0)return main()
 if(stage==='main'){
 if(digit===1)return shop();if(digit===2)return inv();if(digit===3)return pick();if(digit===4)return pick({mode:'remove'});if(digit===5)return forge()
 if(digit===6)return show('info',{},'📖 *INFORMAÇÕES*\nUma coleira por pet. Reduz apenas o dano recebido pelo próprio pet nas Raids e Boss. Não transfere bônus ao jogador. Trocas durante atividades bloqueadas pelo sistema.'+nav)
 }
 if(stage==='shop'){
 const c=catalog[digit-1];if(c){if(!c.price)return forge();return show('buy_confirm',{itemId:c.id},'🛒 *'+label(c)+'*\n🛡️ -'+c.percent+'% dano recebido\n💰 R$ '+fmt(c.price)+'\n🎒 Livres: '+count(c.id)+'\n\n1️⃣ Confirmar compra'+nav)}
 }
 if(stage==='buy_confirm'&&digit===1){
 const c=catalog.find(c=>c.id===data.itemId&&c.price>0);if(!c)return main()
 clearFlow();const result=await api.buy(jid,c.id)
 return show('after_buy',{itemId:c.id},'✅ '+result.message+'\n\n1️⃣ Equipar agora\n2️⃣ Voltar à loja'+nav)
 }
 if(stage==='after_buy'){if(digit===1)return pick({itemId:data.itemId});if(digit===2)return shop()}
 if(stage==='forge'&&digit===1){
 clearFlow();const result=await api.craft(jid)
 return show('after_buy',{itemId:result.item.id},'✅ '+result.message+'\n\n1️⃣ Equipar agora'+nav)
 }
 if(stage==='pets'){
 if(digit===8||digit===9)return pick({...data,page:Number(data.page||0)+(digit===9?1:-1)})
 const p=pets.find(p=>Number(p.id)===Number(data.ids?.[digit-1]));if(p){if(data.mode==='remove')return compare(p,null);if(data.itemId){const c=catalog.find(c=>c.id===data.itemId);if(c&&count(c.id)>0)return compare(p,c);return select(p)}return select(p)}
 }
 if(stage==='select'){
 const p=pets.find(p=>Number(p.id)===Number(data.petId));if(p&&digit===7&&current(p))return compare(p,null);const c=catalog.find(c=>c.id===data.ids?.[digit-1]);if(p&&c&&count(c.id)>0)return compare(p,c)
 }
 if(stage==='equip_confirm'&&digit===1){
 const p=pets.find(p=>Number(p.id)===Number(data.petId));if(!p||(p.collar_id||null)!==data.previous){await reply('⚠️ Equipamento mudou. Selecione novamente.');return main()}
 clearFlow();const result=await api.equip(jid,p.id,data.itemId||null);await reply('✅ '+result.message);return main()
 }
 if(digit!==-1)await reply('Escolha uma opção exibida no menu ou 0 para voltar.')
 }catch(err){clearFlow();await reply('❌ '+(err?.message||'Não foi possível concluir.')).catch(()=>{})}
 finally{busy.delete(key)}
}
