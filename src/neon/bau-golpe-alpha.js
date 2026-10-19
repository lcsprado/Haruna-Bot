import {randomInt} from 'node:crypto'
import {db,ensureUser} from './db.js'

const DURATION=30*60*1000
const COOLDOWN=2*60*1000
const KEY_PREFIX='bau_golpe_alpha_v1:'
const money=n=>'R$ '+Number(n).toLocaleString('pt-BR')
const choose=()=>randomInt(100)
const fmtTime=ms=>Math.max(1,Math.ceil(ms/1000))+'s'

export async function handleBauGolpeCommand({cmd,sender,chat,reply}){
  if(!['abrirbau','baugolpe','baualpha'].includes(cmd))return false
  await ensureUser(sender)
  const key=KEY_PREFIX+chat
  const c=await db.connect()
  let message=''
  try{
    await c.query('BEGIN')
    await c.query("SET LOCAL statement_timeout='12000ms'")
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key])
    const result=await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[key])
    const now=Date.now()
    const state=result.rows[0]?.value||{startedAt:now,endsAt:now+DURATION,players:{}}
    if(now>=state.endsAt){
      message='🏁 *O BAÚ DO GOLPE ALPHA ENCERROU!*\\nAs pegadinhas acabaram. Nenhum item ou dinheiro foi retirado.'
    }else{
      const last=Number(state.players[sender]||0)
      if(last&&now-last<COOLDOWN){
        message='⏳ O baú está se preparando para outra pegadinha! Volte em *'+fmtTime(COOLDOWN-(now-last))+'*.'
      }else{
        const roll=choose()
        let reward=0,item=null,description=''
        if(roll<25)description='💸 *VOCÊ GANHOU R$ 5 MILHÕES!*\\n...em dinheiro de Monopoly! 😂'
        else if(roll<45)description='🐔 *VOCÊ VIROU UMA GALINHA!*\\nSeu título troll dura 5 minutos (apenas nesta mensagem). COCORICÓ! 🐓'
        else if(roll<60)description='💀 *TODOS OS SEUS EQUIPAMENTOS SUMIRAM!*\\nPegadinha! Nada foi removido do seu inventário. 😈'
        else if(roll<75){reward=50000;description='🤑 *PRÊMIO REAL!* +'+money(reward)}
        else if(roll<85)description='🐸 *INSÍGNIA TROLL: TROUXA DO ALPHA!*\\nTítulo de brincadeira, sem alterar atributos.'
        else if(roll<95){item='caixa_epica';description='🎁 *PRÊMIO REAL!* Você ganhou *1 Caixa Épica*!'}
        else{reward=1000000;description='👑 *JACKPOT REAL!* +'+money(reward)+'!'}
        if(reward){
          const updated=await c.query('UPDATE wallets SET cash=cash+$1,updated_at=EXTRACT(EPOCH FROM NOW())::bigint WHERE jid=$2',[reward,sender])
          if(updated.rowCount!==1)throw Error('Carteira não encontrada')
          await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'bau_golpe_reward',$3)",[sender,reward,key])
        }
        if(item)await c.query('INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1',[sender,item])
        state.players[sender]=now
        message='🎭 *BAÚ DO GOLPE ALPHA*\\n\\n'+description+'\\n\\n⏱️ Próxima abertura em 2 minutos.\\n🏁 Evento termina em '+Math.ceil((state.endsAt-now)/60000)+' min.'
      }
    }
    await c.query('INSERT INTO trevo_settings(key,value,updated_at) VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at',[key,JSON.stringify(state)])
    await c.query('COMMIT')
  }catch(e){
    await c.query('ROLLBACK').catch(()=>{})
    console.error('[BAU GOLPE]',e)
    message='⚠️ O baú está emperrado. Tente novamente mais tarde.'
  }finally{c.release()}
  await reply(message.replace(/\\\\n/g,'\\n'))
  return true
}
