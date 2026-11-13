// Envio piloto de privados por LID verificado.
// O WhatsApp usa sessões Signal distintas para conversa 1:1 e para grupos.
// Este piloto nunca altera o JID de jogo, carteira, recibo ou destinatário
// canônico: apenas o ENDEREÇO DE TRANSPORTE, por configuração explícita.
const phone=/^\d{10,15}@s\.whatsapp\.net$/
const lid=/^\d{10,20}@lid$/
const key='whatsapp_private_lid_pilot_v1'

export function createVerifiedPrivateLidRouter({db,now=Date.now,ttlMs=15000,log=()=>{}}={}){
  if(!db?.query)throw new Error('Banco é obrigatório')
  let until=0,config=null
  const readConfig=async()=>{
    if(now()<until)return config
    try{
      const result=await db.query('SELECT value FROM trevo_settings WHERE key=$1',[key])
      const value=result.rows?.[0]?.value||null
      config=value?.enabled===true && phone.test(value.phone_jid||'') &&
        lid.test(value.lid_jid||'')?value:null
    }catch(err){
      config=null
      log('config_unavailable',String(err?.code||'query_failed').slice(0,40))
    }
    until=now()+ttlMs
    return config
  }
  const resolve=async(original)=>{
    const chat=String(original||'')
    if(!phone.test(chat))return {chat,mode:'unchanged'}
    const pilot=await readConfig()
    if(!pilot||pilot.phone_jid!==chat)return {chat,mode:'unchanged'}
    try{
      const result=await db.query(`
        SELECT 1 FROM verified_whatsapp_lid_links
        WHERE phone_jid=$1 AND lid_jid=$2 LIMIT 1
      `,[chat,pilot.lid_jid])
      if(result.rows?.length!==1){
        log('unverified_lid','')
        return {chat,mode:'unverified'}
      }
      return {chat:pilot.lid_jid,mode:'verified-lid'}
    }catch(err){
      log('mapping_unavailable',String(err?.code||'query_failed').slice(0,40))
      return {chat,mode:'mapping-unavailable'}
    }
  }
  return Object.freeze({resolve})
}
