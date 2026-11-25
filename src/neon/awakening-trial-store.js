// Registros transacionais de provas do Despertar IV/V: eventos idempotentes e auditaveis.
// Nao contabiliza historicos anteriores; os resultados V1 e de Raidlote ficam intactos.
import {classesOnlyRebootEnabled} from './reboot-classes-policy.js';
import {challengeQuests} from './awakening-v1-challenges.js';

export async function initAwakeningTrialStore(db){
 await db.query(`CREATE TABLE IF NOT EXISTS awakening_trial_events(
  id BIGSERIAL PRIMARY KEY,
  jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
  stage SMALLINT NOT NULL CHECK(stage IN (3,4)),
  class_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('raid','pvp','boss')),
  source_id TEXT NOT NULL,
  opponent_jid TEXT,
  opponent_level INTEGER,
  raid_level INTEGER,
  manual BOOLEAN NOT NULL DEFAULT FALSE,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  happened_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::bigint),
  UNIQUE(jid,source,source_id)
 )`);
 await db.query('CREATE INDEX IF NOT EXISTS awakening_trial_events_progress ON awakening_trial_events(jid,stage,class_id,happened_at,id)');
}

export async function recordAwakeningTrial(client,{
 jid,source,sourceId,opponentJid=null,opponentLevel=null,raidLevel=null,
 manual=false,metrics={},heroId=null,classId=null
}={}){
 if(!classesOnlyRebootEnabled()||!jid||heroId||!['raid','pvp','boss'].includes(source)||!String(sourceId||'').trim())return false;
 const status=(await client.query(`SELECT a.stage,s.class_id,s.class_applied
  FROM player_awakenings a JOIN stats s ON s.jid=a.jid
  WHERE a.jid=$1 AND a.stage IN (3,4)`,[jid])).rows[0];
 if(!status||!status.class_applied||(classId&&status.class_id!==classId))return false;
 // A classe ativa deve ser a classe que realmente participou da batalha.
 // O historico da etapa anterior nunca e reutilizado para a proxima.
 const result=await client.query(`INSERT INTO awakening_trial_events
 (jid,stage,class_id,source,source_id,opponent_jid,opponent_level,raid_level,manual,metrics)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
 ON CONFLICT(jid,source,source_id) DO NOTHING
 RETURNING id`,[
 jid,status.stage,status.class_id,source,String(sourceId),
 opponentJid,opponentLevel,raidLevel,Boolean(manual),JSON.stringify(metrics||{})
 ]);
 return result.rowCount===1;
}

export async function awakeningTrialQuests(client,{jid,stage,classId,baseline}={}){
 const after=Math.max(0,Math.floor(Number(baseline?.__challenge_since)||0));
 const {rows}=await client.query(`SELECT id,source,source_id,opponent_jid,opponent_level,
 raid_level,manual,metrics,happened_at FROM awakening_trial_events
 WHERE jid=$1 AND stage=$2 AND class_id=$3 AND happened_at >= $4
 ORDER BY happened_at,id`,[jid,stage-1,classId,after]);
 return challengeQuests({classId,stage,events:rows});
}
