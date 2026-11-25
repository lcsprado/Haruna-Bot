// Encantamentos permanentes: pontos percentuais somados, sem multiplicacao.
import {db, getEquipmentInfo, equipmentStatsAtLevel, getEquipmentStarLevels} from './db.js'
import {assertRebootItemAllowed,classesOnlyRebootEnabled,isRebootCollabItemId} from './reboot-classes-policy.js'

import {randomInt,randomUUID} from 'node:crypto'
import {stoneLevels,stoneLevelValue,stoneRowValue,stoneUpgradeQuote,stoneUpgradeOutcome,stoneLevelLabel} from './stone-upgrade-policy.js'
import {STONES,planStoneApplication} from './enchantment-stones-catalog.js'
export {STONES}
const fm=n=>Number(n).toLocaleString('pt-BR')
const itemRows=Object.entries(STONES).map(([id,v])=>[id,v.name,'Encantamento permanente: '+v.label+'. Até 3 pedras por equipamento.','consumable',0,v.rarity])

let initPromise=null
export async function initEnchantments(){
  if(initPromise)return initPromise
  initPromise=(async()=>{
  await db.query('CREATE TABLE IF NOT EXISTS equipment_enchantments (jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE, item_id TEXT NOT NULL REFERENCES items(id), stone_id TEXT NOT NULL REFERENCES items(id), quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 3), PRIMARY KEY(jid,item_id,stone_id))')
  await db.query("ALTER TABLE equipment_enchantments ADD COLUMN IF NOT EXISTS upgrade_levels jsonb NOT NULL DEFAULT '[]'::jsonb")
  await db.query('CREATE TABLE IF NOT EXISTS equipment_stone_attempts (token uuid PRIMARY KEY, jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE, receipt jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())')
  for(const [id,name,description,category,price,rarity] of itemRows){
    await db.query('INSERT INTO items(id,name,description,category,price,rarity,sellable,stackable) VALUES($1,$2,$3,$4,$5,$6,TRUE,TRUE) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,rarity=EXCLUDED.rarity,sellable=TRUE',
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
    out[stone.stat]+=stoneRowValue(stone.value,r)
    out.stones.push({id:r.stone_id,itemId:r.item_id,quantity:n,label:stone.name,bonus:stoneLevels(r).map(lv=>'Lv.'+lv+' '+stoneLevelLabel(stone,lv)).join(' • '),levels:stoneLevels(r)})
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
    SELECT item_id,stone_id,quantity,COALESCE(to_jsonb(e)->'upgrade_levels','[]'::jsonb) AS upgrade_levels FROM equipment_enchantments e
      WHERE jid=$1 AND item_id=ANY($2::text[])
    UNION ALL
    SELECT NULL::text AS item_id,$3::text AS stone_id,1::integer AS quantity,'[]'::jsonb AS upgrade_levels
      FROM inventories WHERE jid=$1 AND item_id=$3 AND quantity>0
  `,[jid,ids,sealId])
  const out=sumEnchants(result.rows)
  out.attackPct=result.rows.some(row=>row.stone_id===sealId)?0.05:0
  return out
}
async function applyStone(jid,stoneId,itemId,expectedReplaceId=null){
  assertRebootItemAllowed(itemId)
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
    const current=(await c.query('SELECT stone_id,quantity,upgrade_levels FROM equipment_enchantments WHERE jid=$1 AND item_id=$2 FOR UPDATE',[jid,itemId])).rows
    const plan=planStoneApplication(current,stoneId)
    if(!plan)throw Error('Sem espaço para encantamento ou substituição por pedra superior da mesma família.')
    if(plan.replaceId!==expectedReplaceId)throw Error('Os encantamentos mudaram. Abra o menu novamente.')
    if(plan.replaceId){
      const old=current.find(x=>x.stone_id===plan.replaceId)
      if(Number(old.quantity)===1)await c.query('DELETE FROM equipment_enchantments WHERE jid=$1 AND item_id=$2 AND stone_id=$3',[jid,itemId,plan.replaceId])
      else {const levels=stoneLevels(old);levels.splice(levels.indexOf(Math.min(...levels)),1);await c.query('UPDATE equipment_enchantments SET quantity=quantity-1,upgrade_levels=$4::jsonb WHERE jid=$1 AND item_id=$2 AND stone_id=$3',[jid,itemId,plan.replaceId,JSON.stringify(levels)])}
    }
    await c.query('UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2',[jid,stoneId])
    await c.query('INSERT INTO equipment_enchantments(jid,item_id,stone_id,quantity) VALUES($1,$2,$3,1) ON CONFLICT(jid,item_id,stone_id) DO UPDATE SET quantity=equipment_enchantments.quantity+1',[jid,itemId,stoneId])
    await c.query('INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,$1,0,$2,$3)',[jid,'equipment_enchant',stoneId+':'+itemId+(plan.replaceId?':replace:'+plan.replaceId:'')])
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
export function previewEquipmentEnchantment(itemId,level,rows=[],stoneId,stars=1){
  const base=equipmentStatsAtLevel(itemId,level,stars)
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
  const plan=planStoneApplication(rows,stoneId)
  if(!plan)return null
  const removed=plan.replaceId?stoneLevelValue(STONES[plan.replaceId].value,Math.min(...stoneLevels(rows.find(r=>r.stone_id===plan.replaceId)))):0
  const after={...before,[stone.stat]:before[stone.stat]+stone.value-removed}
  if(stone.stat==='damage')after.damage=Math.min(.24,rows.filter(r=>STONES[r.stone_id]?.stat==='damage').reduce((n,r)=>n+stoneRowValue(STONES[r.stone_id].value,r),0)+stone.value-removed)
  return {before,after,...plan}
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
  const eligible=rows.filter(r=>(!classesOnlyRebootEnabled()||!isRebootCollabItemId(r.item_id))&&getEquipmentInfo(r.item_id))
  if(!eligible.length)return []
  const ids=eligible.map(r=>r.item_id)
  const [enchantResult,starLevels]=await Promise.all([
    db.query('SELECT item_id,stone_id,quantity,COALESCE(to_jsonb(e)->'upgrade_levels','[]'::jsonb) AS upgrade_levels FROM equipment_enchantments e WHERE jid=$1 AND item_id=ANY($2::text[])',[jid,ids]),
    getEquipmentStarLevels(jid,ids)
  ])
  const enchanted=enchantResult.rows
  const enchantByItem=new Map()
  for(const row of enchanted){
    if(!enchantByItem.has(row.item_id))enchantByItem.set(row.item_id,[])
    enchantByItem.get(row.item_id).push(row)
  }
  return eligible.map(r=>({...r,stars:starLevels[r.item_id]||1,preview:previewEquipmentEnchantment(r.item_id,r.level,enchantByItem.get(r.item_id)||[],stoneId,starLevels[r.item_id]||1)})).filter(r=>r.preview)
}
async function stoneMenu(jid){
  const stones=await stoneChoices(jid)
  if(!stones.length)return {ids:[],text:'✨ *ENCANTAMENTOS ALPHA*\n\nVocê não possui nenhuma pedra de encantamento no inventário.\n🎁 Conquiste pedras em mineração, eventos ou leilões.\n\nNenhum item será consumido.'}
  let text='✨ *ENCANTAR EQUIPAMENTO*\n\n💎 *Escolha uma pedra disponível:*\n\n'
  stones.forEach((s,i)=>{text+=(i+1)+'. *'+s.name+'* — '+s.label+' (×'+fm(s.quantity)+')\n'})
  text+='\n👉 Responda só com o número da pedra.\n0️⃣ Cancelar'
  return {ids:stones.map(s=>s.id),text}
}
async function gearMenu(jid,stoneId){
  const stone=STONES[stoneId]
  if(!stone)return {ids:[],text:'Pedra inválida. Use *!encantar* novamente.'}
  const gear=await equipmentChoices(jid,stoneId)
  if(!gear.length)return {ids:[],text:'⚠️ Nenhum equipamento disponível para *'+stone.name+'*.\nVerifique se você tem um equipamento compatível e espaço para novos encantamentos.\n\n99 — Voltar às pedras • 0️⃣ Cancelar'}
  const shown=gear.slice(0,40)
  let text='⚙️ *ESCOLHA O EQUIPAMENTO*\n\n💎 '+stone.name+' — *'+stone.label+'*\n\n'
  shown.forEach((g,i)=>{
    const icon=g.category==='weapon'?'⚔️':g.category==='armor'?'🛡️':g.category==='boots'?'👢':'🪖'
    text+=(i+1)+'. '+icon+' *'+g.name+'* • ⭐ Lv.'+g.level+(g.stars>1?' • 🌟 '+'★'.repeat(g.stars):'')+' • 🔒 '+g.used_slots+'/3\n'+
      '   📊 Atual: '+equipmentStatLine(g.preview.before)+'\n'+
      '   💎 Com pedra: '+equipmentStatLine(g.preview.after)+(g.preview.replaceId?' • substitui '+STONES[g.preview.replaceId].name:'')+'\n'
  })
  if(gear.length>shown.length)text+='\n⚠️ Exibindo os primeiros 40 equipamentos elegíveis.\n'
  text+='\n👉 Responda apenas o número do equipamento.\n99 — Voltar às pedras • 0️⃣ Cancelar'
  return {ids:shown.map(g=>g.item_id),text}
}
async function confirmMenu(jid,stoneId,itemId){
  const stone=STONES[stoneId]
  const gear=(await equipmentChoices(jid,stoneId)).find(g=>g.item_id===itemId)
  if(!stone||!gear)throw Error('Equipamento indisponível ou sem espaço para essa pedra. Escolha outro.')
  const owned=(await stoneChoices(jid)).some(s=>s.id===stoneId)
  if(!owned)throw Error('Você não possui mais essa pedra. Use !encantar novamente.')
  const {before,after}=gear.preview
  return {replaceId:gear.preview.replaceId,text:'✨ *CONFIRMAR ENCANTAMENTO?*\n\n💎 Pedra: *'+stone.name+'*\n⚙️ Equipamento: *'+gear.name+' Lv.'+gear.level+'*\n🎯 Efeito: *'+stone.label+'*\n\n📊 *ATRIBUTOS TOTAIS DA PEÇA*\n• Atual: '+equipmentStatLine(before)+'\n• Com a pedra: '+equipmentStatLine(after)+'\n\n📈 '+changedEquipmentStat(stone,before,after)+'\n🔒 Espaços usados: *'+gear.used_slots+'/3 → '+gear.preview.totalAfter+'/3*\n\n'+(gear.preview.replaceId?'⚠️ Substitui e consome definitivamente '+STONES[gear.preview.replaceId].name+'.\n':'')+'⚠️ A pedra será consumida apenas ao confirmar. Não há cobrança em dinheiro. O bônus é permanente e funciona quando esse equipamento estiver equipado.\n\n1️⃣ *Confirmar aplicação*\n2️⃣ *Cancelar aplicação*\n9️⃣ Voltar aos equipamentos\n0️⃣ Sair'}
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

  if(stage==='enchant_upgrade_pick'){
    const selected=data?.choices?.[nChoice(input)-1]
    if(!selected){await reply('Escolha um número da lista ou 0 para sair.');return true}
    const stone=STONES[selected.stoneId],q=stoneUpgradeQuote(stone,selected.level)
    set('enchant_upgrade_confirm',{...selected,token:randomUUID()})
    await reply('💎 *APRIMORAR ENCANTAMENTO?*\n⚙️ '+selected.itemName+'\n'+stone.name+' Lv.'+q.level+' → Lv.'+q.next+'\n📈 '+stoneLevelLabel(stone,q.level)+' → '+stoneLevelLabel(stone,q.next)+'\n💰 R$ '+fm(q.cost)+' (carteira)\n✅ Sucesso: '+q.success+'%\n⚠️ Falha: '+q.failure+'%\n💥 Quebra da pedra: '+q.breakage+'%\nNa falha perde apenas o dinheiro; na quebra perde apenas esta pedra e o dinheiro.\n\n1️⃣ Confirmar\n2️⃣ Cancelar')
    return true
  }
  if(stage==='enchant_upgrade_confirm'){
    if(input==='2'){clearFlow();await reply('Cancelado. Nenhuma cobrança.');return true}
    if(input!=='1'){await reply('Responda 1 para confirmar ou 2 para cancelar.');return true}
    set('enchant_processing',{})
    let receipt
    try{receipt=await upgradeAppliedStone(sender,data)}catch(e){clearFlow();await reply('❌ '+String(e.message||e));return true}
    clearFlow()
    await reply(upgradeReceipt(receipt)+'\n\nUse *!uparencanto* para uma nova tentativa.')
    return true
  }
  if(stage==='enchant_stone'){
    if(input==='99'){await restart();return true}
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
    if(input==='99'){await restart();return true}
    const index=nChoice(input)-1
    const itemId=data?.gearIds?.[index]
    if(!itemId){await reply('❌ Escolha um equipamento pelo número, *99* para voltar ou *0* para sair.');return true}
    try{
      const menu=await confirmMenu(sender,data.stoneId,itemId)
      set('enchant_confirm',{stoneId:data.stoneId,itemId,replaceId:menu.replaceId})
      await reply(menu.text)
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
      receipt=await applyStone(sender,String(data.stoneId),String(data.itemId),data.replaceId??null)
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
  if(cmd!=='encantar'&&cmd!=='encantamentos'&&cmd!=='uparencanto')return false
  await initEnchantments()
  if(cmd==='uparencanto'||(cmd==='encantamentos'&&args[0]==='upar')){
    if(!classesOnlyRebootEnabled()){await reply('Disponível na temporada V2.');return true}
    const choices=(await listAppliedStoneUpgrades(sender)).filter(x=>x.level<10).slice(0,40)
    if(!choices.length){clearFlow();await reply('Nenhum encantamento aplicado disponível para aprimorar.');return true}
    setFlow('enchant_upgrade_pick',{choices},ENCHANT_FLOW_MINUTES*60*1000)
    await reply('💎 *APRIMORAR ENCANTAMENTOS*\n\n'+choices.map((x,i)=>(i+1)+'. '+x.itemName+' — '+STONES[x.stoneId].name+' Lv.'+x.level+' ('+stoneLevelLabel(STONES[x.stoneId],x.level)+')').join('\n')+'\n\nEscolha o número ou 0 para sair.')
    return true
  }
  if(cmd==='encantar'){
    if(args.length>=2){
      // Compatibilidade com o comando antigo, sem pular a confirmação.
      const stoneId=String(args[0]),itemId=String(args[1])
      try{
        const message=await confirmMenu(sender,stoneId,itemId)
        setFlow('enchant_confirm',{stoneId,itemId,replaceId:message.replaceId},ENCHANT_FLOW_MINUTES*60*1000)
        await reply(message.text)
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
  const enchanted=ids.length?(await db.query('SELECT item_id,stone_id,quantity,COALESCE(to_jsonb(e)->'upgrade_levels','[]'::jsonb) AS upgrade_levels FROM equipment_enchantments e WHERE jid=$1 AND item_id=ANY($2::text[])',[sender,ids])).rows:[]
  let out='✨ *ENCANTAMENTOS ALPHA*\n\n💎 *Suas pedras:*\n'
  out+=stones.length?stones.map(x=>'• '+x.name+' ×'+fm(x.quantity)+' — '+STONES[x.item_id].label).join('\n'):'Nenhuma pedra no inventário.'
  out+='\n\n⚙️ *Encantamentos nos equipamentos:*\n'
  const enchantedGear=gear.filter(x=>enchanted.some(y=>y.item_id===x.item_id))
  out+=enchantedGear.length?enchantedGear.map(x=>'• '+x.name+': '+enchanted.filter(y=>y.item_id===x.item_id).map(y=>(STONES[y.stone_id]?.name||y.stone_id)+' '+stoneLevels(y).map(lv=>'Lv.'+lv+' ('+stoneLevelLabel(STONES[y.stone_id],lv)+')').join(', ')).join(', ')).join('\n'):'Nenhum encantamento aplicado.'
  out+='\n\n👉 Digite *!encantar* para escolher a pedra e o equipamento pelos números.\n⬆️ *!uparencanto* — evoluir pedras aplicadas até Lv.10.'
  await reply(out)
  return true
}

export async function listAppliedStoneUpgrades(jid){
 if(!classesOnlyRebootEnabled())return []
 await initEnchantments()
 const {rows}=await db.query("SELECT e.item_id,e.stone_id,e.quantity,e.upgrade_levels,i.name FROM equipment_enchantments e JOIN inventories v ON v.jid=e.jid AND v.item_id=e.item_id AND v.quantity>0 JOIN items i ON i.id=e.item_id WHERE e.jid=$1 ORDER BY i.name,e.stone_id",[jid])
 return rows.filter(r=>STONES[r.stone_id]&&!isRebootCollabItemId(r.item_id)).flatMap(r=>{
  const levels=stoneLevels(r)
  return levels.map((level,index)=>({itemId:r.item_id,itemName:r.name,stoneId:r.stone_id,level,index,levels,quote:level<10?stoneUpgradeQuote(STONES[r.stone_id],level):null}))
 })
}
export async function upgradeAppliedStone(jid,{itemId,stoneId,index,level,levels,token}={}){
 if(!classesOnlyRebootEnabled())throw Error('Disponível somente na V2.')
 assertRebootItemAllowed(itemId)
 const stone=STONES[stoneId],quote=stoneUpgradeQuote(stone,level)
 if(!Number.isInteger(index)||index<0||index>2||!Array.isArray(levels)||levels[index]!==level||!/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(String(token)))throw Error('Confirmação inválida. Abra o menu novamente.')
 await initEnchantments()
 const c=await db.connect()
 try{
  await c.query('BEGIN')
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['stone-attempt:'+token])
  const prior=(await c.query('SELECT jid,receipt FROM equipment_stone_attempts WHERE token=$1',[token])).rows[0]
  if(prior){if(prior.jid!==jid)throw Error('Confirmação inválida.');await c.query('COMMIT');return prior.receipt}
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['enchant:'+jid+':'+itemId])
  const inv=(await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 AND quantity>0 FOR UPDATE',[jid,itemId])).rows[0]
  if(!inv)throw Error('Você não possui mais o equipamento.')
  const row=(await c.query('SELECT quantity,upgrade_levels FROM equipment_enchantments WHERE jid=$1 AND item_id=$2 AND stone_id=$3 FOR UPDATE',[jid,itemId,stoneId])).rows[0]
  const now=stoneLevels(row)
  if(!row||JSON.stringify(now)!==JSON.stringify(levels)||now[index]!==level)throw Error('Encantamento alterado. Abra o menu novamente.')
  const debit=await c.query('UPDATE wallets SET cash=cash-$2,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$1 AND cash>=$2 RETURNING cash',[jid,quote.cost])
  if(!debit.rowCount)throw Error('Saldo insuficiente na carteira.')
  const outcome=stoneUpgradeOutcome(quote,randomInt(100))
  if(outcome==='success')now[index]=quote.next
  if(outcome==='breakage')now.splice(index,1)
  if(outcome!=='failure'){
    if(!now.length)await c.query('DELETE FROM equipment_enchantments WHERE jid=$1 AND item_id=$2 AND stone_id=$3',[jid,itemId,stoneId])
    else await c.query('UPDATE equipment_enchantments SET quantity=$4,upgrade_levels=$5::jsonb WHERE jid=$1 AND item_id=$2 AND stone_id=$3',[jid,itemId,stoneId,now.length,JSON.stringify(now)])
  }
  const receipt={itemId,stoneId,level,next:outcome==='success'?quote.next:outcome==='breakage'?null:level,outcome,cost:quote.cost,cash:Number(debit.rows[0].cash)}
  await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'enchant',$2,'stone_upgrade',$3)",[jid,quote.cost,stoneId+':'+itemId+':'+level+':'+outcome+':'+token])
  await c.query('INSERT INTO equipment_stone_attempts(token,jid,receipt) VALUES($1,$2,$3::jsonb)',[token,jid,JSON.stringify(receipt)])
  await c.query('COMMIT')
  return receipt
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
}
function upgradeReceipt(r){
 const stone=STONES[r.stoneId]
 return (r.outcome==='success'?'✅ *SUCESSO!* '+stone.name+' Lv.'+r.level+' → Lv.'+r.next+' — '+stoneLevelLabel(stone,r.next):r.outcome==='breakage'?'💥 *PEDRA QUEBRADA!* '+stone.name+' Lv.'+r.level+' foi destruída. Seu equipamento está intacto.':'⚠️ *FALHOU!* '+stone.name+' permanece Lv.'+r.level)+'\n💰 Custo: R$ '+fm(r.cost)+' • Saldo: R$ '+fm(r.cash)
}
