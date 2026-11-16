// Leilão 15/11 — direitos de escolha e passe Raid Lote; resgates atômicos.
import {db} from './db.js'
import {syncEffectiveGear} from './equipment-star-logic.js'
export const REWARDS_15=Object.freeze([
 {id:'voucher_arsenal_supremo_20261115',name:'Decreto do Arsenal Supremo',description:'Escolhe arma, armadura ou bota de drop de Raid, entregue FORJADA ★★★★★ Lv.1. Uso único.'},
 {id:'voucher_essencia_perfeicao_20261115',name:'Essência da Perfeição',description:'Eleva qualquer equipamento próprio para FORJADO ★★★★★ Lv.10. Uso único.'},
 {id:'voucher_passe_raidlote_triplo_20261115',name:'Passe Supremo de Raid Lote',description:'Ativa até três pacotes especiais de !raidlote em 24 horas, com 100% das recompensas-base e chances da Raid manual. Uso único.'}
])
const voucher=(n)=>REWARDS_15[n].id
const gear=new Set(['weapon','armor','boots','helmet','shield'])
const localTime=ms=>new Date(ms).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})
const passKey=jid=>'auction_raid_lote_pass_20261115:'+jid
let initPromise=null
export async function initAuction15Rewards(){
 if(initPromise)return initPromise
 initPromise=(async()=>{
  for(const r of REWARDS_15)await db.query(
   "INSERT INTO items(id,name,description,category,price,rarity,sellable,stackable) VALUES($1,$2,$3,'special',0,'event',FALSE,TRUE) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,category='special',rarity='event',sellable=FALSE,stackable=TRUE",
   [r.id,r.name,r.description])
 })().catch(e=>{initPromise=null;throw e})
 return initPromise
}
const eligible=x=>{
 const d=String(x?.description||'')
 return ['weapon','armor','boots'].includes(String(x?.category))&&
 ['legendary','epic'].includes(String(x?.rarity))&&/(raid|drop)/i.test(d)&&
 !/(boss|cerco|collab|colab|exclusiv[oa].*evento)/i.test(d)
}
export async function raidDropItems(){
 const r=await db.query("SELECT id,name,category,rarity,description FROM items WHERE category IN ('weapon','armor','boots') AND rarity IN ('legendary','epic') ORDER BY name")
 return r.rows.filter(eligible)
}
async function tx(fn){
 const c=await db.connect()
 try{
  await c.query('BEGIN')
  await c.query("SET LOCAL statement_timeout='12000ms'")
  const out=await fn(c)
  await c.query('COMMIT')
  return out
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}
 finally{c.release()}
}
async function spendVoucher(c,jid,id){
 const r=await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',[jid,id])
 if(!r.rowCount||Number(r.rows[0].quantity)<1)throw Error('Você não possui o voucher necessário.')
 const update=await c.query('UPDATE inventories SET quantity=quantity-1 WHERE jid=$1 AND item_id=$2 AND quantity>0 RETURNING quantity',[jid,id])
 if(update.rowCount!==1)throw Error('Voucher já utilizado.')
}
const validId=id=>/^[a-z0-9_-]{2,100}$/.test(String(id||''))
export async function redeemArsenal(jid,itemId){
 if(!validId(itemId))throw Error('Informe o ID de um drop: !itensraid')
 return tx(async c=>{
  await c.query('SELECT jid FROM users WHERE jid=$1 FOR UPDATE',[jid])
  const item=(await c.query('SELECT id,name,category,rarity,description FROM items WHERE id=$1',[itemId])).rows[0]
  if(!eligible(item))throw Error('Item indisponível ou não é drop de Raid. Confira !itensraid.')
  await spendVoucher(c,jid,voucher(0))
  await c.query('INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1',[jid,itemId])
  // O jogo registra forja por modelo; nunca rebaixar forja já superior.
  await c.query('INSERT INTO equipment_star_forges(jid,item_id,stars,level,updated_at) VALUES($1,$2,5,1,EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT(jid,item_id) DO UPDATE SET stars=5,level=GREATEST(equipment_star_forges.level,1),updated_at=EXCLUDED.updated_at',[jid,itemId])
  await syncEffectiveGear(c,jid,itemId)
  await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,0,'auction_arsenal_redeem',$2)",[jid,itemId])
  return item.name
 })
}
export async function redeemPerfection(jid,itemId){
 if(!validId(itemId))throw Error('Informe o ID do equipamento de seu inventário.')
 return tx(async c=>{
  await c.query('SELECT jid FROM users WHERE jid=$1 FOR UPDATE',[jid])
  const item=(await c.query('SELECT i.id,i.name,i.category,inv.quantity FROM inventories inv JOIN items i ON i.id=inv.item_id WHERE inv.jid=$1 AND inv.item_id=$2 FOR UPDATE OF inv',[jid,itemId])).rows[0]
  if(!item||Number(item.quantity)<1||!gear.has(item.category))throw Error('Você precisa possuir esse equipamento.')
  await spendVoucher(c,jid,voucher(1))
  await c.query('INSERT INTO equipment_star_forges(jid,item_id,stars,level,updated_at) VALUES($1,$2,5,10,EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT(jid,item_id) DO UPDATE SET stars=5,level=10,updated_at=EXCLUDED.updated_at',[jid,itemId])
  await syncEffectiveGear(c,jid,itemId)
  await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,0,'auction_perfection_redeem',$2)",[jid,itemId])
  return item.name
 })
}
export async function activateRaidLotePass(jid,at=Date.now()){
 return tx(async c=>{
  await c.query('SELECT jid FROM users WHERE jid=$1 FOR UPDATE',[jid])
  const key=passKey(jid)
  const old=(await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[key])).rows[0]?.value
  if(Number(old?.expiresAt)>at)throw Error('Passe Supremo já ativo. Use !passeraidlote status para acompanhar.')
  await spendVoucher(c,jid,voucher(2))
  const state={activatedAt:at,expiresAt:at+86400000,maxPackages:3,source:'leilao_15_11'}
  await c.query('INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at',[key,JSON.stringify(state)])
  await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,0,'auction_raidpass_activate','Passe de 3 pacotes por 24h')",[jid])
  return state
 })
}
export async function raidPassText(jid){
 const s=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[passKey(jid)])).rows[0]?.value
 if(!s||Number(s.expiresAt)<=Date.now())return '🎟️ Nenhum Passe Supremo ativo. Se possui o ticket, use !passeraidlote para ativar.'
 const n=(await db.query('SELECT COUNT(*)::int AS n FROM raid_lote_jobs WHERE jid=$1 AND created_at>=to_timestamp($2/1000.0) AND created_at<to_timestamp($3/1000.0)',[jid,s.activatedAt,s.expiresAt])).rows[0]?.n||0
 return '🎟️ *PASSE RAIDLOTE — SUPREMO ATIVO*\n📦 Pacotes utilizados: '+n+'/'+s.maxPackages+'\n⌛ Até '+localTime(s.expiresAt)+'\n🏆 Pacotes especiais: 100% das recompensas-base da Raid manual (EXP, dinheiro, maestria, pets, fragmentos, caixas e equipamentos).\n💰 Compra, chaves e taxas normais.\n⚔️ !raidlote 75 10 para consultar um pacote.'
}
export async function isNextRaidLotePassPackage(jid,at=Date.now()){
 const state=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[passKey(jid)])).rows[0]?.value
 if(!(Number(state?.activatedAt)>0&&Number(state?.expiresAt)>at&&Number(state?.maxPackages)===3))return false
 const used=(await db.query('SELECT COUNT(*)::int AS n FROM raid_lote_jobs WHERE jid=$1 AND created_at>=to_timestamp($2/1000.0) AND created_at<to_timestamp($3/1000.0)',[jid,state.activatedAt,state.expiresAt])).rows[0]?.n||0
 return Number(used)<3
}
export async function handleAuction15RewardCommand({cmd,args=[],sender,reply}){
 if(!['itensraid','usardecreto','usarperfeicao','passeraidlote','usarpasse','meupasse'].includes(cmd))return false
 try{
  await initAuction15Rewards()
  if(cmd==='itensraid'){
   const items=await raidDropItems()
   await reply('📜 *DROPS DE RAID PARA ESCOLHA*\n'+items.map(x=>'• '+x.name+' — '+x.id).join('\n')+'\n\nUse !usardecreto ID.')
  }else if(cmd==='usardecreto')await reply('✅ *DECRETO RESGATADO* — '+await redeemArsenal(sender,args[0])+' ★★★★★ Lv.1.')
  else if(cmd==='usarperfeicao')await reply('✅ *PERFEIÇÃO APLICADA* — '+await redeemPerfection(sender,args[0])+' ★★★★★ Lv.10.')
  else if(cmd==='usarpasse'){
    await reply('🎟️ O comando foi separado. Use *!passeraidlote* para ativar o ticket do leilão.')
   }else if(cmd==='passeraidlote'){
    const action=String(args[0]||'').toLowerCase()
    if(action==='status'||action==='ver')await reply(await raidPassText(sender))
    else if(action)await reply('🎟️ Use *!passeraidlote* para ativar ou *!passeraidlote status* para consultar.')
    else{
      const current=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[passKey(sender)])).rows[0]?.value
      if(Number(current?.expiresAt)>Date.now())await reply(await raidPassText(sender))
      else{
        const active=await activateRaidLotePass(sender)
        await reply('✅ *PASSE RAIDLOTE ATIVADO!*\n📦 Até 3 pacotes especiais em 24h.\n🏆 Recompensas-base iguais às da Raid manual, sem redução de drop.\n💰 Preços, chaves e taxas continuam normais.\n⌛ Até '+localTime(active.expiresAt)+'.\n⚔️ Compre com *!raidlote* e veja em *!passeraidlote status*.')
      }
    }
   }else await reply(await raidPassText(sender))
 }catch(e){await reply('❌ '+String(e?.message||e).slice(0,220))}
 return true
}
