// Boletins globais informam progresso real. Boss parado continua consultável via !boss.
export const BOSS_PROGRESS_LAST_REPORT_PREFIX='boss_progress_last_report:';

export function bossProgressIdentity(current){
  if(current?.mode==='weekly'){
    return 'semanal-'+String(current.weekendKey||current.startedAt||current.endsAt);
  }
  return 'evento-'+String(current?.scheduleKey||current?.eventId||current?.startedAt);
}

export function bossProgressSnapshot(current){
  const maxHp=Number(current?.maxHp);
  const hp=Number(current?.hp);
  if(!Number.isFinite(maxHp)||maxHp<=0||!Number.isFinite(hp)||hp<0||hp>=maxHp)return null;
  const registeredDamage=Object.values(current?.participants||{}).reduce((sum,p)=>{
    const damage=Number(p?.damage||0);
    return sum+(Number.isFinite(damage)?Math.max(0,damage):0);
  },0);
  // Não gerar relatório quando não houve golpes com dano registrado.
  if(registeredDamage<=0)return null;
  return {hp,registeredDamage};
}

export function chooseBossProgressBulletin(candidates,previousSnapshots={}){
  for(const current of candidates||[]){
    const snapshot=bossProgressSnapshot(current);
    if(!snapshot)continue;
    const identity=bossProgressIdentity(current);
    const previous=previousSnapshots?.[identity];
    if(previous&&Number(previous.hp)===snapshot.hp &&
       Number(previous.registeredDamage)===snapshot.registeredDamage)continue;
    return {current,identity,snapshot};
  }
  return null;
}
