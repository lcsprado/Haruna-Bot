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
  const mode=String(env?.ALPHA_REBOOT_DB_CONFIRMED||'');
  let target;
  try{target=new URL(String(env?.DATABASE_URL||''))}
  catch{throw new Error('Reboot bloqueado: endereço do banco inválido.');}
  const name=decodeURIComponent(target.pathname.slice(1));
  if(mode==='isolated-v2'){
    if(!/^alpha_reboot_[a-z0-9_]{2,48}$/.test(name))
      throw new Error('Reboot bloqueado: banco alvo não identificado como alpha_reboot_*.');
    return {reboot:true,databaseName:name};
  }
  // Virada excepcional: o banco Aiven da V1 será reutilizado APENAS DEPOIS
  // de parada comprovada, backup restaurado em teste e reset pelo dono.
  // Flags indicam aprovação humana; NÃO verificam backup ou parada sozinhas.
  if(mode==='existing-aiven-cutover'){
    if(name!=='alpha_prod_v2'||!target.hostname.endsWith('.aivencloud.com')||
       target.protocol!=='postgres:'&&target.protocol!=='postgresql:')
      throw new Error('Reboot bloqueado: cutover exige exatamente alpha_prod_v2 no Aiven.');
    if(env?.ALPHA_REBOOT_V1_STOPPED!=='confirmed'||
       env?.ALPHA_REBOOT_BACKUP_VERIFIED!=='restore-verified'||
       !/^[a-f0-9]{64}$/.test(String(env?.ALPHA_REBOOT_BACKUP_SHA256||''))||
       env?.ALPHA_REBOOT_RESET_VERIFIED!=='manual-confirmed'||
       env?.ALPHA_REBOOT_CUTOVER_APPROVED!=='yes-2.0')
      throw new Error('Reboot bloqueado: cutover exige backup restaurado, V1 parada, reset verificado e aprovação explícita.');
    return {reboot:true,databaseName:name,cutover:true};
  }
  throw new Error('Reboot bloqueado: falta confirmação do banco isolado ou cutover.');
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
// Exceções de leilão legado que fazem forja máxima e furam a progressão Lv1.
export const REBOOT_LEGACY_AUCTION_VOUCHERS=Object.freeze([
 'voucher_arsenal_supremo_20261115',
 'voucher_essencia_perfeicao_20261115',
 'voucher_passe_raidlote_triplo_20261115'
]);
export function isRebootLegacyAuctionVoucher(id){
 return REBOOT_LEGACY_AUCTION_VOUCHERS.includes(String(id||'').trim().toLowerCase());
}
export function isRebootCollabItemId(itemId){
  const id=String(itemId||'').trim().toLowerCase();
  return LEGACY_COLLAB_IDS.has(id)||id.startsWith('pecados_')||
    id.startsWith('pecado_')||id.startsWith('essencia_pecado_')||
    id.startsWith('fragmento_ascensao_pecados_');
}
export function filterRebootStarterItems(items,{enabled=classesOnlyRebootEnabled()}={}){
  const rows=Array.isArray(items)?items:[];
  return enabled?rows.filter(row=>!isRebootCollabItemId(row?.[0])&&!isRebootLegacyAuctionVoucher(row?.[0])):rows;
}

// Uso obrigatório nos pontos de aquisição/uso: o seed filtrado, sozinho,
// não impede uma operação administrativa ou rota legada de recriar itens.
export function assertRebootItemAllowed(itemId,{enabled=classesOnlyRebootEnabled()}={}){
  if(enabled&&(isRebootCollabItemId(itemId)||isRebootLegacyAuctionVoucher(itemId)))
    throw new Error('Item da colaboração indisponível na temporada Alpha Bot 2.0.');
  return true;
}

export function assertRebootHeroSelection(heroId,{enabled=classesOnlyRebootEnabled()}={}){
  if(enabled&&heroId!=null&&String(heroId).trim()!==''&&String(heroId).trim()!=='class'){
    throw new Error(REBOOT_HERO_MESSAGE);
  }
  return true;
}
