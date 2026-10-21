// Encantamentos permanentes: pontos percentuais somados, sem multiplicacao.
import {db, getEquipmentInfo, equipmentStatsAtLevel} from './db.js'

export const STONES=Object.freeze({
  pedra_furia_alpha:{name:'Pedra da Fúria',stat:'damage',value:.02,categories:['weapon'],label:'+2 p.p. dano'},
  pedra_forca_alpha:{name:'Pedra da Força',stat:'atk',value:5,categories:['weapon'],label:'+5 ATK'},
  pedra_fortaleza_alpha:{name:'Pedra da Fortaleza',stat:'def',value:5,categories:['armor','helmet'],label:'+5 DEF'},
  pedra_agilidade_alpha:{name:'Pedra da Agilidade',stat:'spd',value:2,categories:['boots'],label:'+2 VEL'},
  pedra_precisao_alpha:{name:'Pedra da Precisão',stat:'crit',value:.01,categories:['weapon','helmet'],label:'+1 p.p. CRIT'}
})
const fm=n=>Number(n).toLocaleString('pt-BR')
const itemRows=Object.entries(STONES).map(([id,v])=>[id,v.name,'Encantamento permanente: '+v.label+'. Até 3 pedras por equipamento.','consumable',0,'event'])

let initPromise=null
export async function initEnchantments(){
  if(initPromise)return initPromise
  initPromise=(async()=>{
  await db.query('CREATE TABLE IF NOT EXISTS equipment_enchantments (jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE, item_id TEXT NOT NULL REFERENCES items(id), stone_id TEXT NOT NULL REFERENCES items(id), quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 3), PRIMARY KEY(jid,item_id,stone_id))')
  for(const [id,name,description,category,price,rarity] of itemRows){
    await db.query('INSERT INTO items(id,name,description,category,price,rarity,sellable,stackable) VALUES($1,$2,$3,$4,$5,$6,FALSE,TRUE) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,rarity=EXCLUDED.rarity,sellable=FALSE',
      [id,name,description,category,price,rarity])
  }
  })()
  try{return await initPromise}catch(e){initPromise=null;throw e}
}
export function sumEnchants(rows=[]){
  const out={atk:0,def:0,spd:0,crit:0,damage:0,attackPct:0,stones:[]}
  for(const r of rows){
    const stone=STONES[r.stone_id]
    if(!stone)continue
    const n=Math.max(0,Math.min(3,Number(r.quantity)||0))
    out[stone.stat]+=stone.value*n
    out.stones.push({id:r.stone_id,itemId:r.item_id,quantity:n,label:stone.name,bonus:stone.label})
  }
  out.damage=Math.min(.24,out.damage)
  return out
}
export async function getEquippedEnchants(queryable,jid,itemIds=[]){
  const ids=[...new Set(itemIds.filter(Boolean))]
  // Selo de Potência: bônus passivo e permanente de +5% no ATK final.
  // Mesmo SELECT de encantamentos, sem consulta extra por ataque de Boss.
  const sealId='selo_poder_5pct_alpha_20261019'
  const result=await queryable.query(`
    SELECT item_id,stone_id,quantity FROM equipment_enchantments
      WHERE jid=$1 AND item_id=ANY($2::text[])
    UNION ALL
    SELECT NULL::text AS item_id,$3::text AS stone_id,1::integer AS quantity
      FROM inventories WHERE jid=$1 AND item_id=$3 AND quantity>0
  `,[jid,ids,sealId])
  const out=sumEnchants(result.rows)
  out.attackPct=result.rows.some(row=>row.stone_id===sealId)?0.05:0
  return out
}
async function applyStone(jid,stoneId,itemId){
  const stone=STONES[stoneId],eq=getEquipmentInfo(itemId)
  if(!stone)throw Error('Pedra de encantamento inválida.')
  if(!eq||!stone.categories.includes(eq.category))throw Error('Essa pedra não pode ser aplicada nesse tipo de equipamento.')
  const c=await db.connect()
  try{
    await c.query('BEGIN')
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['enchant:'+jid+':'+itemId])
    const inv=(await c.query('SELECT item_id,quantity FROM inventories WHERE jid=$1 AND item_id=ANY($2::text[]) AND quantity>0 FOR UPDATE',[jid,[stoneId,itemId]])).rows
    if(!inv.some(x=>x.item_id===stoneId))throw Error('Você não possui essa pedra.')
    if(!inv.some(x=>x.item_id===itemId))throw Error('Você não possui esse equipamento.')
    const current=(await c.query('SELECT stone_id,quantity FROM equipment_enchantments WHERE jid=$1 AND item_id=$2 FOR UPDATE',[jid,itemId])).rows
    const total=current.reduce((a,x)=>a+Number(x.quantity),0)
    if(total>=3)throw Error('Esse equipamento já possui o limite de 3 encantamentos.')
    const percentage=current.filter(x=>STONES[x.stone_id]?.stat==='damage'||STONES[x.stone_id]?.stat==='crit').reduce((a,x)=>a+Number(x.quantity),0)
    if((stone.stat==='damage'||stone.stat==='crit')&&percentage>=2)throw Error('Máximo de 2 encantamentos percentuais no mesmo equipamento.')
    await c.query('UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2',[jid,stoneId])
    await c.query('INSERT INTO equipment_enchantments(jid,item_id,stone_id,quantity) VALUES($1,$2,$3,1) ON CONFLICT(jid,item_id,stone_id) DO UPDATE SET quantity=equipment_enchantments.quantity+1',[jid,itemId,stoneId])
    await c.query('INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,$1,0,$2,$3)',[jid,'equipment_enchant',stoneId+':'+itemId])
    await c.query('COMMIT')
    return '✨ *ENCANTAMENTO APLICADO!*\n⚙️ '+eq.name+'\n💎 '+stone.name+' — '+stone.label+'\n✅ Bônus permanente enquanto o equipamento estiver equipado.'
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
}

const ENCHANT_FLOW_MINUTES=5
const percentageStoneIds=Object.keys(STONES).filter(id=>['damage','crit'].includes(STONES[id].stat))
const fmtBonus=n=>Number(n.toFixed(2)).toLocaleString('pt-BR',{maximumFractionDigits:2})
const nChoice=raw=>/^\d+$/.test(String(raw||''))?Number(raw):NaN

async function stoneChoices(jid){
  const owned=(await db.query('SELECT item_id,quantity FROM inventories WHERE jid=$1 AND quantity>0 AND item_id=ANY($2::text[])',[jid,Object.keys(STONES)])).rows
  const counts=new Map(owned.map(r=>[r.item_id,Number(r.quantity)]))
  return Object.keys(STONES).filter(id=>Number(counts.get(id)||0)>0).map(id=>({id,quantity:counts.get(id),...STONES[id]}))
}
// Prévia somente de leitura: nível do equipamento + encantamentos existentes.
// A nova pedra é simulada, sem modificar atributos ou consumir inventário.
export function previewEquipmentEnchantment(itemId,level,rows=[],stoneId){
  const base=equipmentStatsAtLevel(itemId,level)
  const stone=STONES[stoneId]
  if(!base||!stone)return null
  const applied=sumEnchants(rows)
  const before={
    atk:Number(base.atk||0)+applied.atk,
    def:Number(base.def||0)+applied.def,
    hp:Number(base.hp||0),
    spd:Number(base.spd||0)+applied.spd,
    crit:Number(base.crit||0)+applied.crit,
    damage:applied.damage
  }
  const after={...before,[stone.stat]:before[stone.stat]+stone.value}
  return {before,after}
}
const statDescriptions={
  atk:['⚔️','ATK'],def:['🛡️','DEF'],hp:['❤️','HP'],
  spd:['💨','VEL'],crit:['🎯','CRIT'],damage:['💥','DANO']
}
const statValue=(key,value)=>fmtBonus((key==='crit'||key==='damage'?100:1)*Number(value||0))+(key==='crit'||key==='damage'?'%':'')
function equipmentStatLine(stats){
  return Object.entries(statDescriptions)
    .filter(([key])=>Math.abs(Number(stats?.[key]||0))>1e-8)
    .map(([key,[icon,label]])=>icon+' +'+statValue(key,stats[key])+' '+label)
    .join(' • ')||'Sem bônus de atributos'
}
function changedEquipmentStat(stone,before,after){
  const [icon,label]=statDescriptions[stone.stat]
  return icon+' '+label+': *+'+statValue(stone.stat,before[stone.stat])+' → +'+statValue(stone.stat,after[stone.stat])+'*'
}

async function equipmentChoices(jid,stoneId){
  const stone=STONES[stoneId]
  if(!stone)return []
  const rows=(await db.query(
    'SELECT v.item_id,i.name,i.category,COALESCE(u.level,1)::int AS level,COALESCE(SUM(e.quantity),0)::int AS used_slots,COALESCE(SUM(CASE WHEN e.stone_id=ANY($3::text[]) THEN e.quantity ELSE 0 END),0)::int AS used_percentage FROM inventories v JOIN items i ON i.id=v.item_id LEFT JOIN equipment_upgrades u ON u.jid=v.jid AND u.item_id=v.item_id LEFT JOIN equipment_enchantments e ON e.jid=v.jid AND e.item_id=v.item_id WHERE v.jid=$1 AND v.quantity>0 AND i.category=ANY($2::text[]) GROUP BY v.item_id,i.name,i.category,u.level ORDER BY i.category,i.name',
    [jid,stone.categories,percentageStoneIds]
  )).rows
  const eligible=rows.filter(r=>getEquipmentInfo(r.item_id)&&Number(r.used_slots)<3&&(!['damage','crit'].includes(stone.stat)||Number(r.used_percentage)<2))
  if(!eligible.length)return []
  const enchanted=(await db.query('SELECT item_id,stone_id,quantity FROM equipment_enchantments WHERE jid=$1 AND item_id=ANY($2::text[])',[jid,eligible.map(r=>r.item_id)])).rows
  const enchantByItem=new Map()
  for(const row of enchanted){
    if(!enchantByItem.has(row.item_id))enchantByItem.set(row.item_id,[])
    enchantByItem.get(row.item_id).push(row)
  }
  return eligible.map(r=>({...r,preview:previewEquipmentEnchantment(r.item_id,r.level,enchantByItem.get(r.item_id)||[],stoneId)}))
}
async function stoneMenu(jid){
  const stones=await stoneChoices(jid)
  if(!stones.length)return {ids:[],text:'✨ *ENCANTAMENTOS ALPHA*\n\nVocê não possui nenhuma pedra de encantamento no inventário.\n🎁 Conquiste pedras em eventos ou leilões.\n\nNenhum item será consumido.'}
  let text='✨ *ENCANTAR EQUIPAMENTO*\n\n💎 *Escolha uma pedra disponível:*\n\n'
  stones.forEach((s,i)=>{text+=(i+1)+'. *'+s.name+'* — '+s.label+' (×'+fm(s.quantity)+')\n'})
  text+='\n👉 Responda só com o número da pedra.\n0️⃣ Cancelar'
  return {ids:stones.map(s=>s.id),text}
}
async function gearMenu(jid,stoneId){
  const stone=STONES[stoneId]
  if(!stone)return {ids:[],text:'Pedra inválida. Use *!encantar* novamente.'}
  const gear=await equipmentChoices(jid,stoneId)
  if(!gear.length)return {ids:[],text:'⚠️ Nenhum equipamento disponível para *'+stone.name+'*.\nVerifique se você tem um equipamento compatível e espaço para novos encantamentos.\n\n9️⃣ Voltar às pedras • 0️⃣ Cancelar'}
  const shown=gear.slice(0,40)
  let text='⚙️ *ESCOLHA O EQUIPAMENTO*\n\n💎 '+stone.name+' — *'+stone.label+'*\n\n'
  shown.forEach((g,i)=>{
    const icon=g.category==='weapon'?'⚔️':g.category==='armor'?'🛡️':g.category==='boots'?'👢':'🪖'
    text+=(i+1)+'. '+icon+' *'+g.name+'* • ⭐ Lv.'+g.level+' • 🔒 '+g.used_slots+'/3\n'+
      '   📊 Atual: '+equipmentStatLine(g.preview.before)+'\n'+
      '   💎 Com pedra: '+equipmentStatLine(g.preview.after)+'\n'
  })
  if(gear.length>shown.length)text+='\n⚠️ Exibindo os primeiros 40 equipamentos elegíveis.\n'
  text+='\n👉 Responda apenas o número do equipamento.\n9️⃣ Voltar às pedras • 0️⃣ Cancelar'
  return {ids:shown.map(g=>g.item_id),text}
}
async function confirmMenu(jid,stoneId,itemId){
  const stone=STONES[stoneId]
  const gear=(await equipmentChoices(jid,stoneId)).find(g=>g.item_id===itemId)
  if(!stone||!gear)throw Error('Equipamento indisponível ou sem espaço para essa pedra. Escolha outro.')
  const owned=(await stoneChoices(jid)).some(s=>s.id===stoneId)
  if(!owned)throw Error('Você não possui mais essa pedra. Use !encantar novamente.')
  const {before,after}=gear.preview
  return '✨ *CONFIRMAR ENCANTAMENTO?*\n\n💎 Pedra: *'+stone.name+'*\n⚙️ Equipamento: *'+gear.name+' Lv.'+gear.level+'*\n🎯 Efeito: *'+stone.label+'*\n\n📊 *ATRIBUTOS TOTAIS DA PEÇA*\n• Atual: '+equipmentStatLine(before)+'\n• Com a pedra: '+equipmentStatLine(after)+'\n\n📈 '+changedEquipmentStat(stone,before,after)+'\n🔒 Espaços usados: *'+gear.used_slots+'/3 → '+(Number(gear.used_slots)+1)+'/3*\n\n⚠️ A pedra será consumida apenas ao confirmar. O bônus é permanente e funciona quando esse equipamento estiver equipado.\n\n1️⃣ *Confirmar aplicação*\n2️⃣ *Cancelar aplicação*\n9️⃣ Voltar aos equipamentos\n0️⃣ Sair'
}
export async function handleEnchantFlow({stage,data,input,sender,reply,setFlow,clearFlow}){
  if(!String(stage||'').startsWith('enchant_'))return false
  await initEnchantments()
  const set=(next,values)=>setFlow(next,values,ENCHANT_FLOW_MINUTES*60*1000)
  const restart=async()=>{
    const menu=await stoneMenu(sender)
    if(menu.ids.length)set('enchant_stone',{stoneIds:menu.ids})
    else clearFlow()
    await reply(menu.text)
  }
  if(stage==='enchant_stone'){
    if(input==='9'){await restart();return true}
    const index=nChoice(input)-1
    const stoneId=data?.stoneIds?.[index]
    if(!STONES[stoneId]){await reply('❌ Escolha um número da lista ou *0* para cancelar.');return true}
    const menu=await gearMenu(sender,stoneId)
    if(menu.ids.length)set('enchant_gear',{stoneId,gearIds:menu.ids})
    else set('enchant_gear',{stoneId,gearIds:[]})
    await reply(menu.text)
    return true
  }
  if(stage==='enchant_gear'){
    if(input==='9'){await restart();return true}
    const index=nChoice(input)-1
    const itemId=data?.gearIds?.[index]
    if(!itemId){await reply('❌ Escolha um equipamento pelo número, *9* para voltar ou *0* para sair.');return true}
    try{
      const menu=await confirmMenu(sender,data.stoneId,itemId)
      set('enchant_confirm',{stoneId:data.stoneId,itemId})
      await reply(menu)
    }catch(e){await reply('❌ '+String(e.message||e)+'\n9️⃣ Voltar • 0️⃣ Sair')}
    return true
  }
  if(stage==='enchant_confirm'){
    if(input==='9'){
      const menu=await gearMenu(sender,data.stoneId)
      set('enchant_gear',{stoneId:data.stoneId,gearIds:menu.ids})
      await reply(menu.text)
      return true
    }
    if(input==='2'){
      clearFlow()
      await reply('✅ Encantamento cancelado. Nenhuma pedra foi consumida.\nUse *!encantar* para tentar novamente.')
      return true
    }
    if(input!=='1'){
      await reply('Responda *1* para confirmar, *2* para cancelar, *9* para voltar ou *0* para sair.')
      return true
    }
    // Reserva o fluxo enquanto o encantamento é gravado, evitando que um
    // segundo "1" seja interpretado por outro menu durante a confirmação.
    set('enchant_processing',{stoneId:data.stoneId,itemId:data.itemId})
    let receipt
    try{
      receipt=await applyStone(sender,String(data.stoneId),String(data.itemId))
    }catch(e){
      clearFlow()
      await reply('❌ '+String(e.message||e)+'\nNenhuma pedra foi consumida. Use *!encantar* para recomeçar.')
      return true
    }
    // O commit já aconteceu: erro ao enviar mensagem não é falha do
    // encantamento. Nunca orientar o jogador a reaplicar por esse motivo.
    try{
      await reply(receipt+'\n\n📋 Confira em *!encantamentos*. Use *!encantar* para outra pedra.')
    }catch(e){
      console.warn('[ENCANTAMENTO] aplicado no banco, mas confirmação WhatsApp não enviada:',e?.message||e)
    }finally{
      clearFlow()
    }
    return true
  }
  if(stage==='enchant_processing'){
    await reply('⌛ Encantamento em processamento. Aguarde a confirmação; não envie outra escolha.')
    return true
  }
  clearFlow()
  await reply('⚠️ Menu expirado. Use *!encantar* novamente.')
  return true
}
export async function handleEnchantCommand({cmd,args,sender,reply,setFlow,clearFlow}){
  if(cmd!=='encantar'&&cmd!=='encantamentos')return false
  await initEnchantments()
  if(cmd==='encantar'){
    if(args.length>=2){
      // Compatibilidade com o comando antigo, sem pular a confirmação.
      const stoneId=String(args[0]),itemId=String(args[1])
      try{
        const message=await confirmMenu(sender,stoneId,itemId)
        setFlow('enchant_confirm',{stoneId,itemId},ENCHANT_FLOW_MINUTES*60*1000)
        await reply(message)
      }catch(e){await reply('❌ '+String(e.message||e)+'\nUse *!encantar* para escolher pelas listas numeradas.')}
      return true
    }
    const menu=await stoneMenu(sender)
    if(menu.ids.length)setFlow('enchant_stone',{stoneIds:menu.ids},ENCHANT_FLOW_MINUTES*60*1000)
    else clearFlow()
    await reply(menu.text)
    return true
  }
  const items=(await db.query('SELECT v.item_id,i.name,i.category,v.quantity FROM inventories v JOIN items i ON i.id=v.item_id WHERE v.jid=$1 AND v.quantity>0 ORDER BY i.name',[sender])).rows
  const gear=items.filter(x=>['weapon','armor','boots','helmet'].includes(x.category))
  const stones=items.filter(x=>Boolean(STONES[x.item_id]))
  const ids=gear.map(x=>x.item_id)
  const enchanted=ids.length?(await db.query('SELECT item_id,stone_id,quantity FROM equipment_enchantments WHERE jid=$1 AND item_id=ANY($2::text[])',[sender,ids])).rows:[]
  let out='✨ *ENCANTAMENTOS ALPHA*\n\n💎 *Suas pedras:*\n'
  out+=stones.length?stones.map(x=>'• '+x.name+' ×'+fm(x.quantity)+' — '+STONES[x.item_id].label).join('\n'):'Nenhuma pedra no inventário.'
  out+='\n\n⚙️ *Encantamentos nos equipamentos:*\n'
  const enchantedGear=gear.filter(x=>enchanted.some(y=>y.item_id===x.item_id))
  out+=enchantedGear.length?enchantedGear.map(x=>'• '+x.name+': '+enchanted.filter(y=>y.item_id===x.item_id).map(y=>(STONES[y.stone_id]?.name||y.stone_id)+' ×'+y.quantity).join(', ')).join('\n'):'Nenhum encantamento aplicado.'
  out+='\n\n👉 Digite *!encantar* para escolher a pedra e o equipamento pelos números.'
  await reply(out)
  return true
}
