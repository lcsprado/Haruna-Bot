// Encantamentos permanentes: pontos percentuais somados, sem multiplicacao.
import {db, getEquipmentInfo} from './db.js'

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
  const out={atk:0,def:0,spd:0,crit:0,damage:0,stones:[]}
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
  if(!ids.length)return sumEnchants()
  const result=await queryable.query('SELECT item_id,stone_id,quantity FROM equipment_enchantments WHERE jid=$1 AND item_id=ANY($2::text[])',[jid,ids])
  return sumEnchants(result.rows)
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
export async function handleEnchantCommand({cmd,args,sender,reply}){
  if(cmd!=='encantar'&&cmd!=='encantamentos')return false
  await initEnchantments()
  const items=(await db.query('SELECT v.item_id,i.name,i.category,v.quantity FROM inventories v JOIN items i ON i.id=v.item_id WHERE v.jid=$1 AND v.quantity>0 ORDER BY i.name',[sender])).rows
  const gear=items.filter(x=>['weapon','armor','boots','helmet'].includes(x.category))
  const stones=items.filter(x=>Boolean(STONES[x.item_id]))
  if(cmd==='encantamentos'||!args.length){
    const ids=gear.map(x=>x.item_id)
    const enchanted=ids.length?(await db.query('SELECT item_id,stone_id,quantity FROM equipment_enchantments WHERE jid=$1 AND item_id=ANY($2::text[])',[sender,ids])).rows:[]
    let out='✨ *ENCANTAMENTOS ALPHA*\n\n💎 *Pedras disponíveis:*\n'
    out+=stones.length?stones.map(x=>'- '+x.name+' ×'+fm(x.quantity)+' ['+x.item_id+']').join('\n'):'Nenhuma pedra no inventário.'
    out+='\n\n⚙️ *Seus equipamentos:*\n'
    out+=gear.length?gear.map(x=>{
      const v=enchanted.filter(y=>y.item_id===x.item_id)
      return '- '+x.name+' ['+x.item_id+']'+(v.length?' — '+v.map(y=>STONES[y.stone_id]?.name+' ×'+y.quantity).join(', '):'')
    }).join('\n'):'Nenhum equipamento.'
    out+='\n\n👉 *!encantar pedra_furia_alpha espada_ferro*\n👉 *!encantamentos* para consultar.\n🔒 Limite: 3 encantamentos por equipamento; 2 percentuais.'
    await reply(out);return true
  }
  if(args.length<2){await reply('Uso: *!encantar <pedra_id> <equipamento_id>*. Confira *!encantamentos*.');return true}
  try{await reply(await applyStone(sender,String(args[0]),String(args[1])))}catch(e){await reply('❌ '+String(e.message||e))}
  return true
}
