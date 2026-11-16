// Respostas numéricas do Poço: não capturar opções de inventário/quiz de
// jogadores sem decisão ativa no MESMO chat. Somente leitura do PostgreSQL.
import {POCO_SEASON} from './poco-abismo-rules.js'
import {POCO_LIVE_PLAYER_PREFIX} from './poco-abismo-settlement.js'

const PREVIEW_PREFIX='poco_abismo_preview_20261116:player:'

export function pocoNumericMode(env=process.env){
 if(env.POCO_BETA_GROUP_PREVIEW==='true')return 'beta'
 if(env.POCO_ABISMO_LIVE==='true'&&env.POCO_ABISMO_PREVIEW!=='true')return 'live'
 if(env.POCO_ABISMO_PREVIEW==='true')return 'preview'
 return null
}

export function pocoNumericMatchesPlayer(state,chat){
 return Boolean(state&&state.season===POCO_SEASON.id&&
  typeof chat==='string'&&state.chat===chat&&
  state.active?.status==='active'&&state.active?.boss)
}

export async function pocoNumericRoute({db,sender,chat,body,env=process.env}){
 if(!/^[1-4]$/.test(String(body||''))||!sender||!chat)return null
 const mode=pocoNumericMode(env)
 if(!mode)return null
 const prefix=mode==='live'?POCO_LIVE_PLAYER_PREFIX:PREVIEW_PREFIX
 const {rows}=await db.query('SELECT value FROM trevo_settings WHERE key=$1',[prefix+sender])
 return pocoNumericMatchesPlayer(rows?.[0]?.value,chat)?mode:null
}
