// Alpha Bot 2.0 — isolamento gradual da colaboração.
// Apenas o ambiente NOVO de homologação pode ativar ALPHA_REBOOT_MODE=classes_only.
// Por padrão, não altera o comportamento do Alpha Bot 1.x.
export const REBOOT_MODE='classes_only';
export const REBOOT_CLASS_IDS=Object.freeze(['paladin','necromancer','samurai','berserker']);
export const REBOOT_HERO_MESSAGE=
  '⚔️ Na nova temporada, o combate utiliza somente as classes: Paladino, Necromante, Samurai e Berserker. Consulte *!personagem status*.';

export function classesOnlyRebootEnabled(env=process.env){
  return String(env?.ALPHA_REBOOT_MODE||'').trim()===REBOOT_MODE;
}

// Barrar TODOS os heróis de collab, incluindo registros antigos vindos da DB.
// Não cria/atualiza registros, apenas escolhe a modalidade de combate.
// Fail-closed: a V2 NÃO pode iniciar apontando ao banco da temporada antiga.
// As credenciais/URLs nunca são retornadas, logadas ou gravadas no repositório.
export function assertRebootDatabaseTarget(env=process.env){
  if(!classesOnlyRebootEnabled(env))return {reboot:false};
  if(String(env?.ALPHA_REBOOT_DB_CONFIRMED||'')!=='isolated-v2'){
    throw new Error('Reboot bloqueado: falta confirmação do banco isolado.');
  }
  let name='';
  try { name=decodeURIComponent(new URL(String(env?.DATABASE_URL||'')).pathname.slice(1)); }
  catch{throw new Error('Reboot bloqueado: endereço do banco inválido.');}
  if(!/^alpha_reboot_[a-z0-9_]{2,48}$/.test(name)){
    throw new Error('Reboot bloqueado: banco alvo não identificado como alpha_reboot_*.');
  }
  return {reboot:true,databaseName:name};
}

// Por padrão, nunca criar uma segunda conexão com o WhatsApp real em homologação.
// Somente após a virada aprovada e o consumidor anterior comprovadamente parado.
export function assertRebootWhatsappPermission(env=process.env){
  if(classesOnlyRebootEnabled(env)&&String(env?.ALPHA_REBOOT_ALLOW_WHATSAPP||'')!=='cutover-approved'){
    throw new Error('Reboot bloqueado: WhatsApp real proibido antes da virada controlada.');
  }
  return true;
}

export function eligiblePlayableHero(heroId,{enabled=classesOnlyRebootEnabled()}={}){
  return enabled?null:(heroId||null);
}
export function raidEnabledInReboot(raid,{enabled=classesOnlyRebootEnabled()}={}){
  return Boolean(raid)&&(!enabled||(!raid.collab&&Number(raid.level)!==75));
}
export function filterRebootRaidCatalog(raids,{enabled=classesOnlyRebootEnabled()}={}){
  return (Array.isArray(raids)?raids:[]).filter(r=>raidEnabledInReboot(r,{enabled}));
}
// O catálogo inicial da V2 não pode semear itens exclusivos dos 7 Pecados.
// Lista por identificador e não por nome para preservar itens originais com
// palavras parecidas (e.g. armadura do eclipse, raids 60/65/70).
const LEGACY_COLLAB_IDS=new Set([
  'chave_raid_75','insignia_sete_pecados','titulo_conquistador_pecados'
]);
export function isRebootCollabItemId(itemId){
  const id=String(itemId||'').trim().toLowerCase();
  return LEGACY_COLLAB_IDS.has(id)||id.startsWith('pecados_')||
    id.startsWith('pecado_')||id.startsWith('essencia_pecado_')||
    id.startsWith('fragmento_ascensao_pecados_');
}
export function filterRebootStarterItems(items,{enabled=classesOnlyRebootEnabled()}={}){
  const rows=Array.isArray(items)?items:[];
  return enabled?rows.filter(row=>!isRebootCollabItemId(row?.[0])):rows;
}

export function assertRebootHeroSelection(heroId,{enabled=classesOnlyRebootEnabled()}={}){
  if(enabled&&heroId!=null&&String(heroId).trim()!==''&&String(heroId).trim()!=='class'){
    throw new Error(REBOOT_HERO_MESSAGE);
  }
  return true;
}
