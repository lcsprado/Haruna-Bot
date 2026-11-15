// Patrocinadores GT: um contrato por temporada, prêmios limitados e idempotentes.
// Sem XP infinito, sem bônus de dano/velocidade e sem compras automáticas.
import {db,ensureUser} from './db.js'
import {gtBrazilDay,gtWeekStart,gtWeekEnd,gtCleanName,gtFormatCash} from './gt-alpha-rules.js'
import {GT_SPONSORS,gtSponsorIncrement,gtSponsorDiscount,gtSponsorOption} from './gt-alpha-sponsor-rules.js'

const contract=id=>GT_SPONSORS.find(x=>x.id===String(id||'').toLowerCase())
const dayPlus=(day,delta)=>{
 const d=new Date(String(day)+'T12:00:00Z')
 d.setUTCDate(d.getUTCDate()+delta)
 return d.toISOString().slice(0,10)
}
let initPromise=null
export function initGtSponsors(){
 if(initPromise)return initPromise
 initPromise=db.query("CREATE TABLE IF NOT EXISTS gt_sponsor_contracts_alpha(jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,week_start TEXT NOT NULL,contract_id TEXT NOT NULL CHECK(contract_id IN ('oficina','pitstop','turbo')),progress INTEGER NOT NULL DEFAULT 0 CHECK(progress>=0),last_day TEXT,completed_at BIGINT NOT NULL DEFAULT 0,reward_used_at BIGINT NOT NULL DEFAULT 0,created_at BIGINT NOT NULL DEFAULT 0,PRIMARY KEY(jid,week_start))")
  .catch(e=>{initPromise=null;throw e})
 return initPromise
}
export async function gtSponsorChoose(jid,id){
 const target=contract(gtSponsorOption(id))
 if(!target)throw Error('Patrocinador inválido. Escolha 1, 2 ou 3, ou use oficina, pitstop ou turbo.')
 await ensureUser(jid)
 await initGtSponsors()
 const week=gtWeekStart(gtBrazilDay())
 const result=await db.query("INSERT INTO gt_sponsor_contracts_alpha(jid,week_start,contract_id,created_at) VALUES($1,$2,$3,EXTRACT(EPOCH FROM NOW())::bigint) ON CONFLICT(jid,week_start) DO NOTHING RETURNING contract_id",
  [jid,week,target.id])
 if(result.rowCount!==1){
  const existing=(await db.query('SELECT contract_id FROM gt_sponsor_contracts_alpha WHERE jid=$1 AND week_start=$2',[jid,week])).rows[0]
  throw Error('Você já assinou o patrocínio '+(contract(existing?.contract_id)?.name||'desta semana')+'. Não é possível trocar.')
 }
 return target
}
export async function gtSponsorProgressInTx(c,{day,heats,participants,startedAt}){
 const week=gtWeekStart(day)
 if(!heats?.length||!participants?.length)return []
 const jids=[...new Set(participants.map(p=>p.jid))]
 const rows=(await c.query('SELECT * FROM gt_sponsor_contracts_alpha WHERE week_start=$1 AND jid=ANY($2::text[]) ORDER BY jid FOR UPDATE',[week,jids])).rows
 const notices=[]
 const now=Math.floor(Date.now()/1000)
 for(const row of rows){
  // Um contrato aceito após a largada só pontua a partir do dia seguinte.
  if(Number(row.created_at)>Math.floor(Number(startedAt||0)/1000))continue
  if(row.last_day===day)continue
  const sponsor=contract(row.contract_id)
  if(!sponsor)continue
  const increase=gtSponsorIncrement(sponsor.id,heats,row.jid)
  const before=Number(row.progress)
  const next=Math.min(sponsor.goal,before+increase)
  const unlock=Number(row.completed_at)===0&&next>=sponsor.goal
  const paid=unlock&&sponsor.kind==='cash'
  const r=await c.query(
   'UPDATE gt_sponsor_contracts_alpha SET progress=$1,last_day=$2,completed_at=CASE WHEN $3 THEN $4 ELSE completed_at END,reward_used_at=CASE WHEN $5 THEN $4 ELSE reward_used_at END WHERE jid=$6 AND week_start=$7',
   [next,day,unlock,now,paid,row.jid,week])
  if(r.rowCount!==1)throw Error('Patrocinador desapareceu durante GT')
  if(paid){
   const wallet=await c.query('UPDATE wallets SET cash=cash+$1,updated_at=$2 WHERE jid=$3',[sponsor.cap,now,row.jid])
   if(wallet.rowCount!==1)throw Error('Carteira ausente para bônus do patrocinador')
   await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'gt_sponsor_reward',$3)",
    [row.jid,sponsor.cap,'gt:'+week+':'+sponsor.id])
  }
  if(unlock){
   const p=participants.find(x=>x.jid===row.jid)
   notices.push({jid:row.jid,name:gtCleanName(p?.name),text:sponsor.name+' — '+sponsor.reward})
  }
 }
 return notices
}
// Chamada somente dentro da mesma transação do reparo/upgrade; cupom é consumido
// junto com o débito real, nunca antes. Válido até 7 dias após fim da temporada.
export async function gtSponsorCouponInTx(c,jid,kind,price){
 if(!['repair','upgrade'].includes(kind))return {discount:0,label:null}
 const rows=(await c.query("SELECT * FROM gt_sponsor_contracts_alpha WHERE jid=$1 AND completed_at>0 AND reward_used_at=0 AND contract_id=$2 ORDER BY week_start FOR UPDATE",
  [jid,kind==='repair'?'oficina':'pitstop'])).rows
 const today=gtBrazilDay()
 const row=rows.find(r=>today<=dayPlus(gtWeekEnd(r.week_start),7))
 if(!row)return {discount:0,label:null}
 const discount=gtSponsorDiscount(row.contract_id,price)
 if(!discount)return {discount:0,label:null}
 const result=await c.query('UPDATE gt_sponsor_contracts_alpha SET reward_used_at=EXTRACT(EPOCH FROM NOW())::bigint WHERE jid=$1 AND week_start=$2 AND reward_used_at=0 RETURNING contract_id',[jid,row.week_start])
 if(result.rowCount!==1)throw Error('Cupom de patrocinador já utilizado')
 return {discount,label:contract(row.contract_id)?.name}
}
export async function gtSponsorText(jid,{withStatus=false}={}){
 await ensureUser(jid)
 await initGtSponsors()
 const day=gtBrazilDay(),week=gtWeekStart(day)
 const r=(await db.query('SELECT * FROM gt_sponsor_contracts_alpha WHERE jid=$1 AND week_start=$2',[jid,week])).rows[0]
 const header='🤝 *GT ALPHA BOT — PATROCINADORES*\n📅 Temporada: '+week+' a '+gtWeekEnd(week)+'\n'
 if(!r){
  const text=header+'\nEscolha *um contrato por temporada*:\n\n'+GT_SPONSORS.map((s,i)=>
   '*'+(i+1)+'️⃣ '+s.name+'* — '+s.goal+' '+s.measure+'\n🎁 '+s.reward).join('\n\n')+
   '\n\n📲 *Responda só 1, 2 ou 3* nos próximos 5 minutos.'+
   '\nOu envie *!gtpatrocinio 1*, *2* ou *3* a qualquer momento.'+
   '\n⚠️ Após escolher, não é possível trocar. As corridas continuam automáticas.'
  return withStatus?{text,canChoose:true}:text
 }
 const sponsor=contract(r.contract_id)
 const done=Number(r.completed_at)>0,used=Number(r.reward_used_at)>0
 const text=header+'\n'+sponsor.name+
  '\n📊 Progresso: *'+Math.min(sponsor.goal,r.progress)+'/'+sponsor.goal+'* '+sponsor.measure+
  '\n🎁 '+sponsor.reward+'\n'+
  (done?(used?'✅ Prêmio já utilizado/creditado.':'🎟️ Cupom liberado! Use '+(sponsor.kind==='repair'?'!repararcarro':'!melhorarcarro PEÇA')+' para receber o desconto.'):
   '⏳ Progresso automático nas corridas das 20h30.')+
  '\n🔒 Um patrocinador por semana. Sem recompensas repetidas.'
 return withStatus?{text,canChoose:false}:text
}

// Mensagem única, reutilizada pelo comando completo e pelo menu com 1/2/3.
export function gtSponsorConfirmedText(picked){
 return '🤝 *CONTRATO CONFIRMADO!*\n'+picked.name+
  '\n🎯 Meta: '+picked.goal+' '+picked.measure+
  '\n🎁 '+picked.reward+
  '\n✅ O progresso será automático nas corridas futuras das 20h30.'
}
