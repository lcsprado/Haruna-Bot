import {readFileSync} from 'node:fs'

const startedAt=Date.now()
const streams=new Set(),tracked=new WeakSet()
const bytes={postgres:{sent:0,received:0},whatsapp:{sent:0,received:0},http:{sent:0,received:0}}
const counters={dbQueries:0,authWrites:0,authSkipped:0,mediaDownloaded:0,mediaUploadPayloadSubmitted:0,reconnections:0}

function collect(entry){
  for(const [field,property] of [['sent','bytesWritten'],['received','bytesRead']]){
    const next=Number(entry.stream[property]||0)
    bytes[entry.category][field]+=Math.max(0,next-entry[field])
    entry[field]=next
  }
}

export function trackBandwidthStream(category,stream){
  if(!bytes[category]||!stream||tracked.has(stream))return
  tracked.add(stream)
  const entry={category,stream,sent:0,received:0}
  streams.add(entry)
  stream.once('close',()=>{collect(entry);streams.delete(entry)})
}

export function countBandwidth(name,amount=1){
  if(Object.hasOwn(counters,name))counters[name]+=Math.max(0,Number(amount)||0)
}

function interfaceBytes(){
  try{
    return readFileSync('/proc/net/dev','utf8').split('\n').slice(2).reduce((sum,line)=>{
      const [name,raw]=line.split(':')
      if(!raw||name.trim()==='lo')return sum
      const fields=raw.trim().split(/\s+/)
      sum.received+=Number(fields[0]||0);sum.sent+=Number(fields[8]||0)
      return sum
    },{sent:0,received:0})
  }catch{return null}
}
const baselineInterface=interfaceBytes()

export function bandwidthSnapshot(){
  for(const entry of streams)collect(entry)
  const network=interfaceBytes()
  return {
    startedAt,elapsedSeconds:Math.max(1,Math.floor((Date.now()-startedAt)/1000)),
    socketBytes:structuredClone(bytes),counters:{...counters},
    interfaceBytes:network&&baselineInterface?{
      sent:Math.max(0,network.sent-baselineInterface.sent),
      received:Math.max(0,network.received-baselineInterface.received)
    }:null,
    // TLS socket counters exclude encryption/TCP overhead. Media counters are payload bytes.
    measurement:'process_socket_bytes_and_container_interface; Render billing remains authoritative'
  }
}

let reportTimer
export function startBandwidthReporting(){
  if(reportTimer)return
  reportTimer=setInterval(()=>console.log('[Bandwidth]',JSON.stringify(bandwidthSnapshot())),15*60*1000)
  reportTimer.unref?.()
}

// A single read-only, aggregate audit. No credentials, player rows or SQL text are logged.
export async function auditDatabaseBandwidth(db){
  const games=await db.query(`SELECT game_type,COUNT(*)::int AS rows,
    COALESCE(SUM(pg_column_size(state)),0)::bigint AS stored_bytes,
    COALESCE(MAX(pg_column_size(state)),0)::bigint AS max_state_bytes
    FROM trevo_games GROUP BY game_type ORDER BY stored_bytes DESC LIMIT 12`)
  const auth=await db.query(`SELECT COUNT(*)::int AS keys,
    COALESCE(SUM(pg_column_size(value)),0)::bigint AS stored_bytes,
    COALESCE(MAX(pg_column_size(value)),0)::bigint AS max_key_bytes FROM auth_keys`)
  const media=await db.query(`SELECT COUNT(*)::int AS rows,
    COALESCE(SUM(octet_length(media_data)),0)::bigint AS encoded_bytes,
    COALESCE(MAX(octet_length(media_data)),0)::bigint AS max_encoded_bytes FROM snipe_messages`)
  console.log('[Bandwidth DB audit]',JSON.stringify({games:games.rows,auth:auth.rows[0],snipe:media.rows[0]}))
  try{
    const extension=await db.query("SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements'")
    if(!extension.rowCount){console.log('[Bandwidth SQL audit] pg_stat_statements indisponível');return}
    const stats=await db.query(`SELECT
      CASE WHEN query ILIKE '%auth_keys%' THEN 'auth_keys'
        WHEN query ILIKE '%auth_creds%' THEN 'auth_creds'
        WHEN query ILIKE '%trevo_games%' THEN 'trevo_games'
        WHEN query ILIKE '%trevo_settings%' THEN 'trevo_settings' ELSE 'other' END AS category,
      SUM(calls)::bigint AS calls,SUM(rows)::bigint AS rows
      FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())
      GROUP BY 1 ORDER BY calls DESC LIMIT 5`)
    console.log('[Bandwidth SQL audit]',JSON.stringify(stats.rows))
  }catch{console.log('[Bandwidth SQL audit] estatísticas indisponíveis; sem criar extensão ou resetar contadores')}
}
