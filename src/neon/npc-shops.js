import { db, ensureUser } from './db.js'
import { alphaReputationTitle } from './progression.js'

// NPCs vendem consumíveis exclusivos e fragmentos das Raids 10–30.
// Equipamentos apenas de drop e materiais de nível 40/50 permanecem exclusivos das Raids.
const NPC_CATALOG=Object.freeze([
  {
    id:'helena',name:'Helena',title:'Guardiã da Ordem',emoji:'🛡️',
    description:'Proteção, ressurreição e relíquias de Honra.',
    goods:[
      {id:'pocao_g'}, {id:'elixir_supremo'},
      {id:'armadura_bastiao'}, {id:'couraca_guardiao',gate:30},
      {id:'pocao_ressurreicao',npcPrice:45000},
      {id:'selo_guardiao',npcPrice:28000,gate:10},
      {id:'elixir_disciplina',npcPrice:65000,gate:30},
      {id:'pergaminho_virtude',npcPrice:125000,gate:70}
    ]
  },
  {
    id:'mordek',name:'Mordek',title:'Mercador das Sombras',emoji:'🗡️',
    description:'Óleos, técnicas proibidas e tesouros do submundo.',
    goods:[
      {id:'pocao_pet_epica'}, {id:'energetico_pet'},
      {id:'foice_carmesim',gate:-30},
      {id:'oleo_sombras',npcPrice:35000,gate:-10},
      {id:'olho_abissal',npcPrice:55000,raidLevel:20},
      {id:'nucleo_titan',npcPrice:95000,raidLevel:25},
      {id:'elixir_sombras',npcPrice:65000,gate:-30},
      {id:'tomo_proibido',npcPrice:125000,gate:-70}
    ]
  },
  {
    id:'baltazar',name:'Baltazar',title:'Mercador Errante',emoji:'🎒',
    description:'Compra neutra de materiais e experiência para todos.',
    goods:[
      {id:'pocao_m'}, {id:'bota_vento'},
      {id:'caixa_sorte'}, {id:'chave_raid_10'},
      {id:'nucleo_pedra',npcPrice:18000,raidLevel:10},
      {id:'escama_vulcanica',npcPrice:30000,raidLevel:15},
      {id:'essencia_rei_abissal',npcPrice:160000,raidLevel:30},
      {id:'pergaminho_experiencia',npcPrice:48000}
    ]
  }
])
const NPC_PERIOD_SECONDS=4*60*60
const NPC_GLOBAL_LIMIT=3 // unidades por jogador, somando os três NPCs por janela de 4h
const NPC_GEAR_LIMIT=1
const NPC_DAILY_FRAGMENT_LIMIT=2
const RAID_MATERIAL_IDS=Object.freeze(['nucleo_pedra','escama_vulcanica','olho_abissal','nucleo_titan','essencia_rei_abissal'])
const npcDayStart=()=>Math.floor((Math.floor(Date.now()/1000)-3*3600)/86400)*86400+3*3600
async function npcHighestClearedRaid(query,jid){
  const {rows}=await query.query(`
    SELECT COALESCE(MAX(split_part(note,'_',2)::integer),0)::integer AS level
    FROM transactions
    WHERE to_jid=$1 AND type='minigame'
      AND note ~ '^raid_(10|15|20|25|30|40|50)$'
  `,[jid])
  return Number(rows[0]?.level||0)
}
async function npcDailyFragmentPurchases(query,jid){
  const {rows}=await query.query(`
    SELECT COALESCE(SUM(quantity),0)::integer AS amount
    FROM alpha_npc_purchases
    WHERE jid=$1 AND created_at >= $2 AND item_id=ANY($3::text[])
  `,[jid,npcDayStart(),RAID_MATERIAL_IDS])
  return Number(rows[0]?.amount||0)
}
const GEAR_CATEGORIES=new Set(['weapon','armor','boots'])
const resolveNpc=input=>{
  const key=String(input||'').trim().toLowerCase()
  return NPC_CATALOG.find((n,i)=>n.id===key||String(i+1)===key)||null
}
const periodNow=()=>Math.floor((Math.floor(Date.now()/1000)-3*3600)/NPC_PERIOD_SECONDS)
const nextRefresh=()=>((periodNow()+1)*NPC_PERIOD_SECONDS+3*3600)*1000

// A escala usa descontos modestos (máx. 8%) e sobretaxa limitada (máx. 10%).
export function npcPriceFactor(npcId,karma){
  const score=Math.max(-100,Math.min(100,Number(karma)||0))
  if(npcId==='baltazar') return 1
  const affinity=npcId==='helena'?score:-score
  if(affinity>=70) return .92
  if(affinity>=30) return .95
  if(affinity>=10) return .97
  if(affinity<=-30) return 1.10
  if(affinity<=-10) return 1.05
  return 1
}
function accessOffer(npc,offer,karma){
  if(!offer.gate) return true
  return npc.id==='helena'?karma>=offer.gate:karma<=offer.gate
}
const quotePrice=(base,factor)=>Math.max(1,Math.ceil(Number(base)*factor))
async function purchaseStats(query,jid,period){
  const rows=(await query.query(`
    SELECT p.item_id,p.quantity,i.category
    FROM alpha_npc_purchases p
    JOIN items i ON i.id=p.item_id
    WHERE p.jid=$1 AND p.period=$2
  `,[jid,period])).rows
  const used=rows.reduce((n,r)=>n+Number(r.quantity||0),0)
  const equipment=rows.reduce((n,r)=>n+(GEAR_CATEGORIES.has(r.category)?Number(r.quantity||0):0),0)
  return {used,equipment,remaining:Math.max(0,NPC_GLOBAL_LIMIT-used)}
}
export async function initNpcShops(){
  await db.query(`
    CREATE TABLE IF NOT EXISTS alpha_npc_purchases(
      id BIGSERIAL PRIMARY KEY,
      jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      npc_id TEXT NOT NULL,
      item_id TEXT NOT NULL REFERENCES items(id),
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity=1),
      spent BIGINT NOT NULL CHECK (spent>0),
      period BIGINT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );
    CREATE INDEX IF NOT EXISTS alpha_npc_purchase_period_idx
      ON alpha_npc_purchases(jid,period);
  `)
}
export async function listNpcShops(jid){
  await ensureUser(jid)
  const karma=Number((await db.query('SELECT karma FROM alpha_reputation WHERE jid=$1',[jid])).rows[0]?.karma||0)
  const period=periodNow()
  const stats=await purchaseStats(db,jid,period)
  return {
    karma,title:alphaReputationTitle(karma),
    remaining:stats.remaining,
    nextAt:nextRefresh(),
    merchants:NPC_CATALOG.map((n,i)=>({
      id:n.id,number:i+1,name:n.name,title:n.title,emoji:n.emoji,
      description:n.description,modifier:npcPriceFactor(n.id,karma)
    }))
  }
}
export async function getNpcShop(jid,npcRef){
  await ensureUser(jid)
  const npc=resolveNpc(npcRef)
  if(!npc) throw new Error('NPC inexistente. Use !npcs para ver os comerciantes.')
  const ids=npc.goods.map(x=>x.id)
  const [reputation,items,stats,highestRaid,fragmentsToday]=await Promise.all([
    db.query('SELECT karma FROM alpha_reputation WHERE jid=$1',[jid]),
    db.query('SELECT id,name,category,rarity,price FROM items WHERE id=ANY($1::text[])',[ids]),
    purchaseStats(db,jid,periodNow()),
    npcHighestClearedRaid(db,jid),
    npcDailyFragmentPurchases(db,jid)
  ])
  const karma=Number(reputation.rows[0]?.karma||0)
  const factor=npcPriceFactor(npc.id,karma)
  const byId=new Map(items.rows.map(x=>[x.id,x]))
  const stock=npc.goods.map((g,i)=>{
    const item=byId.get(g.id)
    if(!item) return null
    const basePrice=Number(g.npcPrice||item.price)
    if(basePrice<=0) return null
    const permitted=accessOffer(npc,g,karma) && (!g.raidLevel || highestRaid>=g.raidLevel) && (!g.raidLevel || fragmentsToday<NPC_DAILY_FRAGMENT_LIMIT)
    return {number:i+1,id:item.id,name:item.name,category:item.category,rarity:item.rarity,
      basePrice,price:quotePrice(basePrice,factor),permitted,
      requiredKarma:g.gate||null,requiredRaid:g.raidLevel||null,
      soldOut:!!g.raidLevel&&fragmentsToday>=NPC_DAILY_FRAGMENT_LIMIT}
  }).filter(Boolean)
  return {npc:{id:npc.id,name:npc.name,title:npc.title,emoji:npc.emoji,description:npc.description},
    karma,title:alphaReputationTitle(karma),factor,stock,remaining:stats.remaining,
    highestRaid,fragmentsRemaining:Math.max(0,NPC_DAILY_FRAGMENT_LIMIT-fragmentsToday),
    gearRemaining:Math.max(0,NPC_GEAR_LIMIT-stats.equipment),nextAt:nextRefresh()}
}
export async function buyNpcShopItem(jid,npcRef,number){
  await ensureUser(jid)
  const npc=resolveNpc(npcRef)
  if(!npc) throw new Error('NPC inexistente. Use !npcs.')
  const index=Number(number)
  if(!Number.isInteger(index)||index<1||index>npc.goods.length)
    throw new Error('Item inválido. Abra !npc '+(NPC_CATALOG.indexOf(npc)+1)+' para ver as opções.')
  const selected=npc.goods[index-1]
  const client=await db.connect()
  try{
    await client.query('BEGIN')
    // Wallet lock serializa compras simultâneas, evitando ultrapassar os limites.
    const wallet=(await client.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
    if(!wallet) throw new Error('Carteira não localizada.')
    const karma=Number((await client.query('SELECT karma FROM alpha_reputation WHERE jid=$1',[jid])).rows[0]?.karma||0)
    if(!accessOffer(npc,selected,karma)){
      throw new Error(npc.id==='helena'
        ?'🛡️ Helena recusou: esta oferta exige pelo menos +'+selected.gate+' de Honra.'
        :'🗡️ Mordek recusou: esta oferta exige Karma '+selected.gate+' ou inferior.')
    }
    const item=(await client.query('SELECT id,name,category,rarity,price FROM items WHERE id=$1',[selected.id])).rows[0]
    const basePrice=Number(selected.npcPrice||item?.price||0)
    if(!item||basePrice<=0||item.id==='pergaminho_reclassificacao')
      throw new Error('Item não disponível para compra.')
    if(selected.raidLevel){
      if(!RAID_MATERIAL_IDS.includes(item.id)) throw new Error('Fragmento não autorizado no NPC.')
      const cleared=await npcHighestClearedRaid(client,jid)
      if(cleared<selected.raidLevel) throw new Error('🔒 Este fragmento exige vitória na Raid Lv.'+selected.raidLevel+' ou superior.')
      const already=await npcDailyFragmentPurchases(client,jid)
      if(already>=NPC_DAILY_FRAGMENT_LIMIT) throw new Error('🔒 Limite de 2 fragmentos por dia atingido. Volte amanhã.')
    }
    const stats=await purchaseStats(client,jid,periodNow())
    if(stats.remaining<1) throw new Error('Você já comprou 3 itens de NPCs nesta janela de 4h. Aguarde o próximo quadro.')
    if(GEAR_CATEGORIES.has(item.category)&&stats.equipment>=NPC_GEAR_LIMIT)
      throw new Error('Você já comprou 1 equipamento em NPCs nesta janela de 4h.')
    const price=quotePrice(basePrice,npcPriceFactor(npc.id,karma))
    const cash=Number(wallet.cash||0),bank=Number(wallet.bank||0)
    if(cash+bank<price) throw new Error('Saldo insuficiente. Preço desta oferta: R$ '+price.toLocaleString('pt-BR')+'.')
    const paidCash=Math.min(price,cash),paidBank=price-paidCash
    await client.query('UPDATE wallets SET cash=cash-$1,bank=bank-$2,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$3',
      [paidCash,paidBank,jid])
    await client.query(`
      INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1)
      ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1
    `,[jid,item.id])
    await client.query(
      'INSERT INTO alpha_npc_purchases(jid,npc_id,item_id,quantity,spent,period) VALUES($1,$2,$3,1,$4,$5)',
      [jid,npc.id,item.id,price,periodNow()])
    await client.query(
      "INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'shop',$2,'purchase',$3)",
      [jid,price,'NPC '+npc.name+' — '+item.name])
    await client.query('COMMIT')
    return {npc:{id:npc.id,name:npc.name,title:npc.title,emoji:npc.emoji},
      item:{id:item.id,name:item.name,rarity:item.rarity,category:item.category},
      karma,basePrice,price,
      saved:basePrice-price,remaining:stats.remaining-1}
  }catch(error){
    await client.query('ROLLBACK')
    throw error
  }finally{client.release()}
}
