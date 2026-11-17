// Manifesto NÃO EXECUTÁVEL de classificação de tabelas para o reboot Alpha 2.0.
// Este módulo é deliberadamente puro: sem db, sem SQL de escrita, sem env, sem JIDs.
// As classes de decisão indicam o tratamento FUTURO — não realizam qualquer ação.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {auditRebootSources} from './reboot-audit.mjs';

export const REBOOT_CLASS_IDS=Object.freeze(['paladin','necromancer','samurai','berserker']);

// NÃO copiar linhas inteiras de users: level/exp são dados de jogo.
// Esses registros exigem migração campo a campo, validada no clone.
const SELECTIVE=new Set([
  'users','group_licenses','group_settings','subscription_orders',
  'support_tickets','group_warnings','web_sessions','web_link_codes',
  'web_pending_group_links','profile_avatars'
]);
// Autenticação do WhatsApp deve ser transferida somente na janela de corte,
// após parar o serviço anterior. Nunca copiar sessão ativa para homologação.
const CUTOVER_ONLY=new Set(['auth_creds','auth_keys']);
// O novo banco inicia sem dados da temporada passada. O histórico permanece
// somente no backup anterior; NÃO usar ownerResetTotal como atalho.
const FRESH_GAMEPLAY=new Set([
  'careers','wallets','stats','player_class_levels','inventories',
  'bound_inventory_items','item_trade_offers','equipment_fusions',
  'equipment_upgrades','equipment_upgrade_copies','equipment_star_forges',
  'alpha_xp_boosts','alpha_xp_scroll_uses','cooldowns','daily_streaks',
  'level_reward_claims','level_reward_audit','pets','pet_collection',
  'pet_team','pet_expeditions','player_sleep','player_carpinar',
  'relationship_proposals','relationships','market_listings',
  'group_activity','alpha_reputation','alpha_reputation_events',
  'alpha_contracts','daily_missions','clans','clan_members','clan_invites',
  'clan_donations','user_homes','user_cars','user_motorcycles',
  'user_businesses','group_missions','group_mission_members',
  'group_events','clt_uber_drivers','clt_ifood_drivers',
  'player_hero_mode','player_hero_mastery','player_hero_mastery_unlocks',
  'hero_mastery_awards','hero_level_awards','player_damage_stats',
  'player_damage_hits','player_loans'
]);
// Essas tabelas misturam temporadas, sessões globais, mensagens ou trilhas
// contábeis; exige inspeção específica — nunca copiar a tabela inteira.
const MANUAL=new Set([
  'transactions','trevo_settings','trevo_games','boss_auto_sessions',
  'snipe_messages','quick_flows'
]);
const RESEED=new Set(['items']);

const GROUPS=Object.freeze({
  selective_migration:SELECTIVE,
  auth_cutover_only:CUTOVER_ONLY,
  fresh_gameplay:FRESH_GAMEPLAY,
  manual_review:MANUAL,
  reseed_catalog:RESEED
});
const NAMES=Object.entries(GROUPS);
export function rebootTableDecision(table){
  const name=String(table||'').trim().toLowerCase();
  if(!/^[a-z][a-z0-9_]*$/.test(name))throw new TypeError('Identificador de tabela inválido.');
  const matching=NAMES.filter(([,tables])=>tables.has(name)).map(([group])=>group);
  if(matching.length>1)throw new Error('Tabela em categorias conflitantes: '+name);
  return matching[0]||'unclassified_blocker';
}

export function classifyRebootTables(names){
  const unique=[...new Set((Array.isArray(names)?names:[]).map(String))].sort();
  const groups={selective_migration:[],auth_cutover_only:[],fresh_gameplay:[],
    manual_review:[],reseed_catalog:[],unclassified_blocker:[]};
  for(const table of unique)groups[rebootTableDecision(table)].push(table);
  return {total:unique.length,counts:Object.fromEntries(Object.entries(groups)
    .map(([k,v])=>[k,v.length])),groups,
    blocked:groups.unclassified_blocker.length>0||groups.manual_review.length>0};
}

// Lê apenas o catálogo atual. Não importa o bot nem abre DATABASE_URL.
export function readSelectableClassIds(source){
  const match=String(source||'').match(/export const SELECTABLE_PLAYER_CLASS_IDS\s*=\s*Object\.freeze\(\[([^\]]+)\]\)/);
  if(!match)throw new Error('Catálogo de classes selecionáveis não encontrado.');
  return [...match[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);
}
export function verifyFourClasses(source){
  const actual=readSelectableClassIds(source);
  return {expected:[...REBOOT_CLASS_IDS],actual,
    valid:actual.length===4&&REBOOT_CLASS_IDS.every((id,i)=>actual[i]===id)};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===new URL('file://'+process.argv[1]).pathname){
  const tables=auditRebootSources().tablesFound;
  const status=classifyRebootTables(tables);
  const catalog=readFileSync(new URL('../src/neon/game-catalog.js',import.meta.url),'utf8');
  const classes=verifyFourClasses(catalog);
  const report={source:'static_repo_only',readOnly:true,classes,...status};
  if(process.argv.includes('--json'))process.stdout.write(JSON.stringify(report,null,2)+'\n');
  else{
    process.stdout.write('REBOOT — PLANO NÃO EXECUTÁVEL\n');
    process.stdout.write('Quatro classes corretas: '+classes.valid+' — '+classes.actual.join(', ')+'\n');
    for(const [key,rows] of Object.entries(status.groups))
      process.stdout.write(key+' ('+rows.length+'): '+rows.join(', ')+'\n');
    process.stdout.write(status.blocked?'PENDENTE: revisão manual antes de migrar.\n':
      'Classificação coberta — ainda exige validação no schema de homologação.\n');
  }
}
