// Entrega de resultados do Boss: pagamento e aviso sao independentes.
// Um grupo inacessivel nao pode gerar retentativas ilimitadas.
export const BOSS_FINAL_NOTICE_MAX_AGE_MS=24*60*60*1000;
export const BOSS_FINAL_NOTICE_MAX_ATTEMPTS=3;
export const BOSS_FINAL_NOTICE_RETRY_BASE_MS=5*60*1000;

export function bossFinalNoticeIsRecent(completedAt,now=Date.now()){
  const completed=Number(completedAt);
  return Number.isFinite(completed)&&completed>0&&now>=completed
    &&now-completed<=BOSS_FINAL_NOTICE_MAX_AGE_MS;
}

export function bossFinalNoticePermanentError(err){
  const status=Number(err?.output?.statusCode??err?.statusCode??err?.status??0);
  if([403,404,410].includes(status))return true;
  const message=String(err?.message??err??'').toLowerCase();
  return /\bforbidden\b|not.authori[sz]ed|not.in.(?:the.)?group|not.a.participant|group.not.found|group.does.not.exist|item.not.found|group.no.longer.exists/.test(message);
}

export function bossFinalNoticeFailureState(err,attempts,now=Date.now()){
  const count=Math.max(1,Math.floor(Number(attempts)||1));
  if(bossFinalNoticePermanentError(err))
    return {status:'undeliverable',attempts:count,failedAt:now,reason:'group_unavailable'};
  if(count>=BOSS_FINAL_NOTICE_MAX_ATTEMPTS)
    return {status:'abandoned',attempts:count,failedAt:now,reason:'attempt_limit'};
  return {status:'retry',attempts:count,failedAt:now,
    nextRetryAt:now+BOSS_FINAL_NOTICE_RETRY_BASE_MS*Math.pow(2,count-1)};
}
