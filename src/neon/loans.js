import { db, ensureUser } from './db.js'
import { getPatrimony } from './progression.js'

const TERM_SECONDS=2*60*60
const OFFER_TTL_SECONDS=10*60
const INTEREST_RATE_PER_HOUR=0.02
const MAX_INTEREST_HOURS=50
const MIN_CREDIT=5_000
const MAX_CREDIT=250_000
const CREDIT_PATRIMONY_RATE=0.25
const MAX_LENDER_ACTIVE=3

const nowEpoch=()=>Math.floor(Date.now()/1000)

async function tx(fn){
  const client=await db.connect()
  try{
    await client.query('BEGIN')
    const out=await fn(client)
    await client.query('COMMIT')
    return out
  }catch(err){
    await client.query('ROLLBACK')
    throw err
  }finally{
    client.release()
  }
}

function asMoney(value){
  const n=Number(value)
  if(!Number.isSafeInteger(n)||n<1) throw new Error('Valor inválido.')
  return n
}

function totalDue(loan){
  return Math.max(0,Number(loan?.principal_remaining||0))+Math.max(0,Number(loan?.interest_due||0))
}

async function expirePending(client=null){
  const q=client||db
  await q.query("UPDATE player_loans SET status='expired',updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE status='pending' AND offer_expires_at<=EXTRACT(EPOCH FROM NOW())::BIGINT")
}

async function accrueInterest(client,loan){
  if(!loan||loan.status!=='active'||!loan.due_at) return loan
  const now=nowEpoch()
  const dueAt=Number(loan.due_at||0)
  if(now<=dueAt||Number(loan.principal_remaining||0)<=0) return loan

  const targetHours=Math.min(MAX_INTEREST_HOURS,Math.max(0,Math.ceil((now-dueAt)/3600)))
  const applied=Math.max(0,Number(loan.interest_hours||0))
  const delta=targetHours-applied
  if(delta<=0) return loan

  const principalRemaining=Math.max(0,Number(loan.principal_remaining||0))
  const alreadyAccrued=Math.max(0,Number(loan.interest_accrued||0))
  const interestCap=Math.max(0,Number(loan.principal||0))
  const perHour=Math.max(1,Math.floor(principalRemaining*INTEREST_RATE_PER_HOUR))
  const add=Math.max(0,Math.min(perHour*delta,interestCap-alreadyAccrued))

  const {rows}=await client.query(
    'UPDATE player_loans SET interest_due=interest_due+$1,interest_accrued=interest_accrued+$1,interest_hours=$2,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id=$3 RETURNING *',
    [add,targetHours,loan.id]
  )
  return rows[0]||loan
}

async function applyPayment(client,loan,amount,mode='manual'){
  amount=Math.max(0,Math.floor(Number(amount||0)))
  if(amount<1) return {paid:0,loan}

  const walletRows=await client.query(
    'SELECT jid,cash,bank FROM wallets WHERE jid=ANY($1::text[]) ORDER BY jid FOR UPDATE',
    [[loan.borrower_jid,loan.lender_jid]]
  )
  const borrower=walletRows.rows.find(r=>r.jid===loan.borrower_jid)
  const available=Math.max(0,Number(borrower?.cash||0))+Math.max(0,Number(borrower?.bank||0))
  const due=totalDue(loan)
  const forceDebit=mode==='automatic'
  const paid=Math.min(amount,due,forceDebit?Number.MAX_SAFE_INTEGER:available)
  if(paid<1) return {paid:0,loan}

  const fromCash=Math.min(Math.max(0,Number(borrower.cash||0)),paid)
  const fromBank=paid-fromCash
  await client.query(
    'UPDATE wallets SET cash=cash-$1,bank=bank-$2,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$3',
    [fromCash,fromBank,loan.borrower_jid]
  )
  await client.query(
    'UPDATE wallets SET cash=cash+$1,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$2',
    [paid,loan.lender_jid]
  )

  const interestPaid=Math.min(Number(loan.interest_due||0),paid)
  const principalPaid=paid-interestPaid
  const nextInterest=Math.max(0,Number(loan.interest_due||0)-interestPaid)
  const nextPrincipal=Math.max(0,Number(loan.principal_remaining||0)-principalPaid)
  const settled=nextInterest===0&&nextPrincipal===0

  const {rows}=await client.query(
    "UPDATE player_loans SET interest_due=$1,principal_remaining=$2,status=CASE WHEN $3 THEN 'paid' ELSE status END,settled_at=CASE WHEN $3 THEN EXTRACT(EPOCH FROM NOW())::BIGINT ELSE settled_at END,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id=$4 RETURNING *",
    [nextInterest,nextPrincipal,settled,loan.id]
  )
  await client.query(
    'INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,$2,$3,$4,$5)',
    [loan.borrower_jid,loan.lender_jid,paid,'loan_payment','loan#'+loan.id+'|'+mode+'|interest:'+interestPaid+'|principal:'+principalPaid]
  )
  return {paid,interestPaid,principalPaid,loan:rows[0]||loan,settled}
}

export async function initLoans(){
  await db.query([
    'CREATE TABLE IF NOT EXISTS player_loans(',
    'id BIGSERIAL PRIMARY KEY,',
    'lender_jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,',
    'borrower_jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,',
    'principal BIGINT NOT NULL CHECK(principal>0),',
    'principal_remaining BIGINT NOT NULL CHECK(principal_remaining>=0),',
    'interest_due BIGINT NOT NULL DEFAULT 0 CHECK(interest_due>=0),',
    'interest_accrued BIGINT NOT NULL DEFAULT 0 CHECK(interest_accrued>=0),',
    'interest_hours INTEGER NOT NULL DEFAULT 0 CHECK(interest_hours>=0),',
    "status TEXT NOT NULL DEFAULT 'pending',",
    'created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT),',
    'offer_expires_at BIGINT NOT NULL,',
    'accepted_at BIGINT,',
    'due_at BIGINT,',
    'settled_at BIGINT,',
    'updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)',
    ');',
    'CREATE INDEX IF NOT EXISTS player_loans_borrower_idx ON player_loans(borrower_jid,status,due_at);',
    'CREATE INDEX IF NOT EXISTS player_loans_lender_idx ON player_loans(lender_jid,status);'
  ].join('\n'))
  await expirePending()
}

export async function getLoanCredit(jid){
  await ensureUser(jid)
  await expirePending()
  const patrimony=await getPatrimony(jid)
  const base=Math.floor(Math.max(0,Number(patrimony?.total||0))*CREDIT_PATRIMONY_RATE)
  const limit=Math.min(MAX_CREDIT,Math.max(MIN_CREDIT,base))
  const {rows}=await db.query(
    "SELECT COALESCE(SUM(principal_remaining+interest_due),0)::bigint AS debt FROM player_loans WHERE borrower_jid=$1 AND status='active'",
    [jid]
  )
  const debt=Number(rows[0]?.debt||0)
  return {limit,debt,available:Math.max(0,limit-debt),patrimony:Number(patrimony?.total||0)}
}

export async function createLoanOffer(lenderJid,borrowerJid,amount){
  amount=asMoney(amount)
  if(lenderJid===borrowerJid) throw new Error('Você não pode emprestar para si mesmo.')
  await Promise.all([ensureUser(lenderJid),ensureUser(borrowerJid)])
  await expirePending()

  const credit=await getLoanCredit(borrowerJid)
  if(amount>credit.available) throw new Error('O limite disponível dessa pessoa é R$ '+credit.available.toLocaleString('pt-BR')+'.')

  return tx(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['loan-borrower:'+borrowerJid])
    await expirePending(client)

    const activeBorrower=await client.query(
      "SELECT id FROM player_loans WHERE borrower_jid=$1 AND status IN ('pending','active') LIMIT 1",
      [borrowerJid]
    )
    if(activeBorrower.rowCount) throw new Error('Essa pessoa já possui um empréstimo ou proposta em aberto.')

    const activeLender=await client.query(
      "SELECT COUNT(*)::int AS total FROM player_loans WHERE lender_jid=$1 AND status='active'",
      [lenderJid]
    )
    if(Number(activeLender.rows[0]?.total||0)>=MAX_LENDER_ACTIVE) throw new Error('Você já atingiu o limite de '+MAX_LENDER_ACTIVE+' empréstimos ativos.')

    const wallet=await client.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[lenderJid])
    const liquid=Number(wallet.rows[0]?.cash||0)+Number(wallet.rows[0]?.bank||0)
    if(liquid<amount) throw new Error('Você não possui esse valor entre carteira e banco.')

    const now=nowEpoch()
    const {rows}=await client.query(
      'INSERT INTO player_loans(lender_jid,borrower_jid,principal,principal_remaining,offer_expires_at) VALUES($1,$2,$3,$3,$4) RETURNING *',
      [lenderJid,borrowerJid,amount,now+OFFER_TTL_SECONDS]
    )
    return {...rows[0],credit}
  })
}

export async function acceptLoan(borrowerJid,id=null){
  await ensureUser(borrowerJid)
  await expirePending()
  const lookup=id
    ? await db.query("SELECT * FROM player_loans WHERE id=$1 AND borrower_jid=$2 AND status='pending'",[Number(id),borrowerJid])
    : await db.query("SELECT * FROM player_loans WHERE borrower_jid=$1 AND status='pending' ORDER BY created_at DESC LIMIT 1",[borrowerJid])
  const preview=lookup.rows[0]
  if(!preview) throw new Error('Você não possui proposta de empréstimo pendente.')

  const credit=await getLoanCredit(borrowerJid)
  if(Number(preview.principal)>credit.available) throw new Error('Seu limite de crédito atual não cobre mais essa proposta.')

  return tx(async client=>{
    const {rows}=await client.query('SELECT * FROM player_loans WHERE id=$1 FOR UPDATE',[preview.id])
    let loan=rows[0]
    if(!loan||loan.status!=='pending'||Number(loan.offer_expires_at)<=nowEpoch()) throw new Error('Essa proposta expirou ou não está mais disponível.')

    const wallets=await client.query(
      'SELECT jid,cash,bank FROM wallets WHERE jid=ANY($1::text[]) ORDER BY jid FOR UPDATE',
      [[loan.lender_jid,loan.borrower_jid]]
    )
    const lender=wallets.rows.find(r=>r.jid===loan.lender_jid)
    const amount=Number(loan.principal)
    const liquid=Number(lender?.cash||0)+Number(lender?.bank||0)
    if(liquid<amount) throw new Error('Quem ofereceu o empréstimo não possui mais saldo suficiente.')

    const fromCash=Math.min(Number(lender.cash||0),amount)
    const fromBank=amount-fromCash
    await client.query(
      'UPDATE wallets SET cash=cash-$1,bank=bank-$2,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$3',
      [fromCash,fromBank,loan.lender_jid]
    )
    await client.query(
      'UPDATE wallets SET cash=cash+$1,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$2',
      [amount,loan.borrower_jid]
    )

    const now=nowEpoch()
    const accepted=await client.query(
      "UPDATE player_loans SET status='active',accepted_at=$1,due_at=$2,updated_at=$1 WHERE id=$3 RETURNING *",
      [now,now+TERM_SECONDS,loan.id]
    )
    loan=accepted.rows[0]
    await client.query(
      'INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,$2,$3,$4,$5)',
      [loan.lender_jid,loan.borrower_jid,amount,'loan_disbursement','loan#'+loan.id+'|2h-sem-juros|mora-2pct-h']
    )
    return loan
  })
}

export async function rejectLoan(borrowerJid,id=null){
  await expirePending()
  const result=id
    ? await db.query("UPDATE player_loans SET status='rejected',updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id=$1 AND borrower_jid=$2 AND status='pending' RETURNING *",[Number(id),borrowerJid])
    : await db.query("UPDATE player_loans SET status='rejected',updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE id=(SELECT id FROM player_loans WHERE borrower_jid=$1 AND status='pending' ORDER BY created_at DESC LIMIT 1) RETURNING *",[borrowerJid])
  if(!result.rows[0]) throw new Error('Você não possui proposta pendente.')
  return result.rows[0]
}

export async function payLoan(borrowerJid,amount='total'){
  await ensureUser(borrowerJid)
  return tx(async client=>{
    const found=await client.query(
      "SELECT * FROM player_loans WHERE borrower_jid=$1 AND status='active' ORDER BY accepted_at ASC LIMIT 1 FOR UPDATE",
      [borrowerJid]
    )
    let loan=found.rows[0]
    if(!loan) throw new Error('Você não possui empréstimo ativo.')
    loan=await accrueInterest(client,loan)
    const due=totalDue(loan)
    const lateHours=loan?.due_at && nowEpoch()>Number(loan.due_at)
      ? Math.min(MAX_INTEREST_HOURS,Math.ceil((nowEpoch()-Number(loan.due_at))/3600))
      : 0
    let wanted=String(amount||'').toLowerCase()
    if(['total','tudo'].includes(wanted)) wanted=due
    else wanted=asMoney(amount)

    const wallet=await client.query('SELECT cash,bank FROM wallets WHERE jid=$1',[borrowerJid])
    const available=Number(wallet.rows[0]?.cash||0)+Number(wallet.rows[0]?.bank||0)
    if(available<Number(wanted)) throw new Error('Saldo insuficiente. Disponível: R$ '+available.toLocaleString('pt-BR')+'.')
    const result=await applyPayment(client,loan,Math.min(Number(wanted),due),'manual')
    return {...result,dueBefore:due,lateHours,interestRatePerHour:INTEREST_RATE_PER_HOUR}
  })
}

export async function collectOverdueLoansForBorrower(borrowerJid){
  return tx(async client=>{
    const found=await client.query(
      "SELECT * FROM player_loans WHERE borrower_jid=$1 AND status='active' AND due_at<EXTRACT(EPOCH FROM NOW())::BIGINT ORDER BY due_at ASC LIMIT 1 FOR UPDATE",
      [borrowerJid]
    )
    let loan=found.rows[0]
    if(!loan) return {paid:0,loan:null}
    loan=await accrueInterest(client,loan)
    return applyPayment(client,loan,totalDue(loan),'automatic')
  })
}

export async function collectOverdueLoans(){
  await expirePending()
  const {rows}=await db.query(
    "SELECT DISTINCT borrower_jid FROM player_loans WHERE status='active' AND due_at<EXTRACT(EPOCH FROM NOW())::BIGINT LIMIT 200"
  )
  let collected=0
  for(const row of rows){
    try{
      const r=await collectOverdueLoansForBorrower(row.borrower_jid)
      collected+=Number(r?.paid||0)
    }catch(err){
      console.error('[Empréstimos] cobrança automática falhou',row.borrower_jid,err?.message||err)
    }
  }
  return collected
}

export function startLoanCollector(){
  if(globalThis.__alphaLoanCollector) return globalThis.__alphaLoanCollector
  const tick=()=>collectOverdueLoans().catch(err=>console.error('[Empréstimos] varredura falhou',err?.message||err))
  const timer=setInterval(tick,60*1000)
  timer.unref?.()
  globalThis.__alphaLoanCollector=timer
  tick()
  return timer
}

export async function getLoanOverview(jid){
  await ensureUser(jid)
  await expirePending()
  await collectOverdueLoansForBorrower(jid).catch(()=>null)

  const {rows:borrowed}=await db.query(
    "SELECT l.*,u.push_name AS lender_name FROM player_loans l LEFT JOIN users u ON u.jid=l.lender_jid WHERE l.borrower_jid=$1 AND l.status IN ('pending','active') ORDER BY l.created_at DESC",
    [jid]
  )
  const {rows:lent}=await db.query(
    "SELECT l.*,u.push_name AS borrower_name FROM player_loans l LEFT JOIN users u ON u.jid=l.borrower_jid WHERE l.lender_jid=$1 AND l.status IN ('pending','active') ORDER BY l.created_at DESC LIMIT 10",
    [jid]
  )
  const credit=await getLoanCredit(jid)
  return {borrowed,lent,credit}
}

export const LOAN_RULES={
  termSeconds:TERM_SECONDS,
  offerTtlSeconds:OFFER_TTL_SECONDS,
  interestRatePerHour:INTEREST_RATE_PER_HOUR,
  maxInterestHours:MAX_INTEREST_HOURS,
  minCredit:MIN_CREDIT,
  maxCredit:MAX_CREDIT,
  creditPatrimonyRate:CREDIT_PATRIMONY_RATE
}
