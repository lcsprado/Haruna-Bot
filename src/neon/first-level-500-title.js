// Marco cosmético global do primeiro jogador a alcançar Nv. 500 pelo ganho de EXP.
// Trevo settings possui PRIMARY KEY(key), garantindo um único vencedor mesmo
// com transações concorrentes; nenhum item ou atributo de combate é alterado.
export const FIRST_500_KEY='rpg:first-level-500'
export const FIRST_500_TITLE='👑 O Primeiro dos 500'
export const FIRST_500_LEVEL=500

export function crossedFirst500(previousLevel,newLevel){
  const before=Number(previousLevel),after=Number(newLevel)
  return Number.isInteger(before)&&Number.isInteger(after)&&before>=1&&before<FIRST_500_LEVEL&&after>=FIRST_500_LEVEL
}

export async function claimFirst500Title(client,jid,previousLevel,newLevel){
  if(!crossedFirst500(previousLevel,newLevel))return false
  const winner=String(jid||'').trim()
  if(!winner)return false
  const result=await client.query(`
    INSERT INTO trevo_settings(key,value)
    VALUES($1,jsonb_build_object(
      'winner_jid',$2::text,
      'milestone_level',500,
      'achieved_at',EXTRACT(EPOCH FROM NOW())::BIGINT
    ))
    ON CONFLICT(key) DO NOTHING
    RETURNING key
  `,[FIRST_500_KEY,winner])
  return Number(result.rowCount||result.rows?.length||0)===1
}

export async function isFirst500TitleHolder(queryable,jid){
  const winner=String(jid||'').trim()
  if(!winner)return false
  const result=await queryable.query(`
    SELECT 1 FROM trevo_settings
    WHERE key=$1 AND value->>'winner_jid'=$2
    LIMIT 1
  `,[FIRST_500_KEY,winner])
  return Boolean(result.rows?.length)
}

// Preserva o mesmo campeão ao consolidar identidades LID e número WhatsApp.
export async function transferFirst500Title(client,targetJid,sourceJid){
  if(!targetJid||!sourceJid||targetJid===sourceJid)return
  await client.query(`
    UPDATE trevo_settings
    SET value=jsonb_set(value,'{winner_jid}',to_jsonb($1::text),TRUE),
        updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE key=$3 AND value->>'winner_jid'=$2
  `,[targetJid,sourceJid,FIRST_500_KEY])
}
