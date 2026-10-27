import {db} from './db.js'
import {PECADOS_HERO_IDS} from './sete-pecados-catalog.js'

/**
 * Converts legacy 7-Sins pets into hero-only unlocks without deleting any
 * pet_collection record. Rebuilds the active pet from a real non-hero
 * companion and stores the former team as an audit record.
 * Only invoked after initDatabase has finished; safe to run more than once.
 */
export async function archiveSevenSinsPetAssignments(){
  const {rows:players}=await db.query(`
    SELECT DISTINCT jid FROM (
      SELECT c.jid FROM pet_collection c WHERE c.species=ANY($1::text[])
        AND (c.active OR EXISTS(SELECT 1 FROM pet_team t WHERE t.pet_id=c.id))
      UNION SELECT p.jid FROM pets p WHERE p.species=ANY($1::text[])
    ) legacy`,[PECADOS_HERO_IDS])
  let migrated=0,noPet=0
  for(const {jid} of players){
    const c=await db.connect()
    try{
      await c.query('BEGIN')
      await c.query('SELECT jid FROM users WHERE jid=$1 FOR UPDATE',[jid])
      const legacy=(await c.query('SELECT * FROM pets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]||null
      const oldTeam=(await c.query(`
        SELECT t.slot,t.pet_id,p.species FROM pet_team t
        JOIN pet_collection p ON p.id=t.pet_id WHERE t.jid=$1
        ORDER BY t.slot FOR UPDATE OF t,p`,[jid])).rows
      const sinTeam=oldTeam.some(t=>PECADOS_HERO_IDS.includes(String(t.species||'')))
      const sinLegacy=PECADOS_HERO_IDS.includes(String(legacy?.species||''))
      const sinActive=(await c.query(`SELECT id FROM pet_collection
        WHERE jid=$1 AND active=TRUE AND species=ANY($2::text[])
        FOR UPDATE`,[jid,PECADOS_HERO_IDS])).rows[0]
      if(!sinTeam&&!sinLegacy&&!sinActive){await c.query('COMMIT');continue}

      // Synchronise the last active Sins snapshot back to its retained unlock.
      if(sinLegacy&&sinActive){
        await c.query(`UPDATE pet_collection SET
          level=$1,xp=$2,power=$3,energy=$4,hp=$5,max_hp=$6,
          wins=$7,losses=$8,hunger=$9,hygiene=$10,last_action=$11,last_rest=$12
          WHERE jid=$13 AND id=$14`,[
          legacy.level,legacy.xp,legacy.power,legacy.energy,legacy.hp,legacy.max_hp,
          legacy.wins,legacy.losses,legacy.hunger,legacy.hygiene,
          legacy.last_action,legacy.last_rest,jid,sinActive.id])
      }

      const {rows:eligible}=await c.query(`SELECT p.*,t.slot AS previous_slot
        FROM pet_collection p
        LEFT JOIN pet_team t ON t.pet_id=p.id AND t.jid=p.jid
        WHERE p.jid=$1 AND p.species<>ALL($2::text[])
          AND NOT EXISTS (SELECT 1 FROM pet_expeditions e
            WHERE e.pet_id=p.id AND e.resolved=FALSE)
        ORDER BY CASE WHEN p.active THEN 0 WHEN t.slot IS NOT NULL THEN 1 ELSE 2 END,
                 t.slot ASC NULLS LAST,p.id ASC FOR UPDATE OF p`,[jid,PECADOS_HERO_IDS])
      const currentIds=oldTeam.filter(t=>!PECADOS_HERO_IDS.includes(String(t.species||'')))
        .map(t=>Number(t.pet_id))
      const validIds=new Set(eligible.map(p=>Number(p.id)))
      const ids=currentIds.filter(id=>validIds.has(id))
      const preferred=eligible.find(p=>p.active&&!PECADOS_HERO_IDS.includes(String(p.species||'')))
      if(preferred&&!ids.includes(Number(preferred.id)))ids.unshift(Number(preferred.id))
      if(!ids.length&&eligible.length)ids.push(Number(eligible[0].id))
      const teamIds=ids.slice(0,3)
      const primary=eligible.find(p=>Number(p.id)===teamIds[0])||null

      await c.query(`CREATE TABLE IF NOT EXISTS hero_legacy_pet_audit(
        jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
        previous_team JSONB NOT NULL,previous_primary JSONB,
        replacement_pet_id BIGINT,created_at BIGINT NOT NULL
          DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      )`)
      await c.query(`INSERT INTO hero_legacy_pet_audit(jid,previous_team,previous_primary,replacement_pet_id)
        VALUES($1,$2::jsonb,$3::jsonb,$4) ON CONFLICT(jid) DO NOTHING`,
        [jid,JSON.stringify(oldTeam),JSON.stringify(legacy),primary?.id||null])

      // Changes only pointers/legacy active snapshot, never removes ownership.
      await c.query('UPDATE pet_collection SET active=FALSE WHERE jid=$1 AND active=TRUE',[jid])
      await c.query('DELETE FROM pet_team WHERE jid=$1',[jid])
      if(primary){
        await c.query('UPDATE pet_collection SET active=TRUE WHERE jid=$1 AND id=$2',[jid,primary.id])
        await c.query(`INSERT INTO pets(jid,species,name,level,xp,hunger,hygiene,energy,power,wins,losses,
          last_action,last_rest,created_at,hp,max_hp)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
          ON CONFLICT(jid) DO UPDATE SET
          species=EXCLUDED.species,name=EXCLUDED.name,level=EXCLUDED.level,
          xp=EXCLUDED.xp,hunger=EXCLUDED.hunger,hygiene=EXCLUDED.hygiene,
          energy=EXCLUDED.energy,power=EXCLUDED.power,wins=EXCLUDED.wins,
          losses=EXCLUDED.losses,last_action=EXCLUDED.last_action,
          last_rest=EXCLUDED.last_rest,created_at=EXCLUDED.created_at,
          hp=EXCLUDED.hp,max_hp=EXCLUDED.max_hp`,[
          jid,primary.species,primary.name,primary.level,primary.xp,
          primary.hunger,primary.hygiene,primary.energy,primary.power,
          primary.wins,primary.losses,primary.last_action,primary.last_rest,
          primary.created_at,primary.hp,primary.max_hp])
      }else{
        // No eligible pet: preserve the legacy Sins snapshot as an archived
        // duplicate, but do not make it playable. All consumers deny Sins.
        noPet++
      }
      for(let i=0;i<teamIds.length;i++){
        await c.query('INSERT INTO pet_team(jid,slot,pet_id) VALUES($1,$2,$3)',
          [jid,i+1,teamIds[i]])
      }
      await c.query('COMMIT')
      migrated++
    }catch(e){await c.query('ROLLBACK');throw e}
    finally{c.release()}
  }
  return {migrated,noEligiblePet:noPet}
}
