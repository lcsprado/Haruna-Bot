// One forged piece per model; unstarred duplicates keep independent upgrade levels.
const scale=[1,1.10,1.22,1.36,1.52,1.70,1.90,2.10,2.30,2.50]
export function selectEffectiveGear(normal=1,forgedLevel=0,stars=1){
 const regular=Math.max(1,Math.min(10,Number(normal)||1))
 const level=Math.max(0,Math.min(10,Number(forgedLevel)||0))
 const count=Math.max(1,Math.min(5,Number(stars)||1))
 const preferForge=level>0&&scale[level-1]*(1+.04*(count-1))>scale[regular-1]
 return preferForge?{level,stars:count}:{level:regular,stars:1}
}
export async function syncEffectiveGear(client,jid,itemId){
 const normal=(await client.query('SELECT COALESCE(MAX(level),1)::int level FROM equipment_upgrade_copies WHERE jid=$1 AND item_id=$2',[jid,itemId])).rows[0]
 const forge=(await client.query('SELECT level,stars FROM equipment_star_forges WHERE jid=$1 AND item_id=$2',[jid,itemId])).rows[0]
 const best=selectEffectiveGear(normal?.level,forge?.level,forge?.stars)
 await client.query(`INSERT INTO equipment_upgrades(jid,item_id,level,updated_at) VALUES($1,$2,$3,EXTRACT(EPOCH FROM NOW())::BIGINT)
 ON CONFLICT(jid,item_id) DO UPDATE SET level=EXCLUDED.level,updated_at=EXCLUDED.updated_at`,[jid,itemId,best.level])
 return best
}
