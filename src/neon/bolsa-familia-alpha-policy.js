// Auxílio emergencial V2: valores pequenos, elegibilidade conservadora e custo previsível.
export const BOLSA_FAMILIA_ALPHA=Object.freeze({
  maxBalance:500,
  cash:600,
  potionId:'pocao_m_bolsa_alpha',
  potionCount:2,
  cooldownMs:72*60*60*1000,
  windowMs:7*24*60*60*1000,
  maxClaims:2,
  recentPixLimit:500
})

export function assessBolsaFamiliaAlpha({cash,bank,claims=[],pixSent=0,now=Date.now()}={}){
  const policy=BOLSA_FAMILIA_ALPHA
  if(!Number.isFinite(cash)||!Number.isFinite(bank)||!Number.isFinite(now)||!Number.isFinite(pixSent)||!Array.isArray(claims)){
    return {ok:false,status:'invalid'}
  }
  // Saldos negativos por empréstimos não podem mascarar dinheiro disponível.
  const balance=Math.max(0,cash)+Math.max(0,bank)
  if(balance>policy.maxBalance)return {ok:false,status:'balance',balance,maxBalance:policy.maxBalance}
  const recent=claims.map(Number).filter(t=>Number.isSafeInteger(t)&&t>0&&t<=now&&now-t<policy.windowMs).sort((a,b)=>a-b)
  const last=recent.at(-1)||0
  if(last&&now-last<policy.cooldownMs)return {ok:false,status:'cooldown',remainingMs:policy.cooldownMs-(now-last)}
  if(recent.length>=policy.maxClaims)return {ok:false,status:'weekly',remainingMs:recent[0]+policy.windowMs-now}
  if(pixSent>=policy.recentPixLimit)return {ok:false,status:'pix',pixSent,limit:policy.recentPixLimit}
  return {ok:true,status:'eligible',balance,claims:[...recent,now]}
}
