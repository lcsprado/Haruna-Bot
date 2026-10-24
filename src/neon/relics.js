import {db,ensureUser} from './db.js'
import {weeklyInsigniaFromId} from './weekly-boss-insignias.js'
const RELICS={
  insignia_nem_cirurgia_derrubou_lenda:{name:'Insígnia Nem a Cirurgia Derrubou a Lenda',effect:'🦶 +1% dano contra Bosses e Raids (sem PvP)',boss:0.01,raidAttack:0.01},
  insignia_matador_titas:{name:'Insígnia Matador de Titãs',effect:'⚔️ +1% dano Boss/Raid (sem PvP)',boss:0.01,raidAttack:0.01},
  insignia_eco_ancestral:{name:'Insígnia do Eco Ancestral',effect:'🪨 +1% dano contra Bosses e Raids (sem PvP)',boss:0.01,raidAttack:0.01},
  insignia_tita_ancestral:{name:'Insígnia do Titã Ancestral',effect:'🗿 +3% dano e +1pp crítico contra Bosses e Raids (sem PvP)',boss:0.03,raidAttack:0.03,bossCrit:0.01,raidCrit:0.01},
  insignia_eclipse:{name:'Insígnia do Eclipse',effect:'🌘 +2% dano contra Bosses (sem PvP)',boss:0.02},
  insignia_sete_pecados:{name:'Insígnia dos Sete Pecados',effect:'🌑 +2% dano e +1pp crítico contra Bosses e Raids (sem PvP)',boss:0.02,raidAttack:0.02,bossCrit:0.01,raidCrit:0.01},
  insignia_guardiao_ruptura:{name:'Insígnia Guardião da Ruptura',effect:'🌌 -1% dano recebido em Raids (sem PvP)',raid:0.01},
  marca_insone:{name:'Marca do Insone',effect:'🌙 +2% EXP de pet em atividades e combates (sem PvP)',petXp:0.02}
}
export async function initRelics(){
  await db.query(`CREATE TABLE IF NOT EXISTS player_active_relics(
    jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
  )`)
}
export async function activeRelic(queryable,jid){
  const r=await queryable.query('SELECT item_id FROM player_active_relics WHERE jid=$1',[jid])
  const id=r.rows[0]?.item_id
  const relic=RELICS[id]||weeklyInsigniaFromId(id)
  return relic?{id,...relic}:null
}
export async function relicStatus(jid){
  await ensureUser(jid)
  const [owned,active]=await Promise.all([
    db.query("SELECT item_id,quantity FROM inventories WHERE jid=$1 AND quantity>0 AND (item_id=ANY($2::text[]) OR item_id LIKE 'insignia_semanal_%')",[jid,Object.keys(RELICS)]),
    activeRelic(db,jid)
  ])
  return {active,items:owned.rows.map(r=>({id:r.item_id,...(RELICS[r.item_id]||weeklyInsigniaFromId(r.item_id)),qty:Number(r.quantity)})).filter(r=>r.name)}
}
export async function selectRelic(jid,itemId){
  await ensureUser(jid)
  if(itemId==='nenhuma'||itemId==='0'){
    await db.query('DELETE FROM player_active_relics WHERE jid=$1',[jid])
    return null
  }
  const relic=RELICS[itemId]||weeklyInsigniaFromId(itemId)
  if(!relic)throw Error('Insígnia inválida. Use !reliquias.')
  const c=await db.connect()
  try{
    await c.query('BEGIN')
    const owned=(await c.query('SELECT quantity FROM inventories WHERE jid=$1 AND item_id=$2 FOR UPDATE',[jid,itemId])).rows[0]
    if(Number(owned?.quantity||0)<1)throw Error('Você não possui essa insígnia.')
    await c.query(`INSERT INTO player_active_relics(jid,item_id) VALUES($1,$2)
      ON CONFLICT(jid) DO UPDATE SET item_id=EXCLUDED.item_id,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT`,[jid,itemId])
    await c.query('COMMIT')
    return {id:itemId,...relic}
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export const relicCatalog=RELICS
