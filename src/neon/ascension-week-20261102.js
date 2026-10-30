// Semana da Ascensão Alpha: 02/11 a 08/11/2026, São Paulo.
// Ativação por horário: nenhum cron, polling, reset ou alteração permanente de atributos.
export const ASCENSION_WEEK = Object.freeze({
  startsAt: Date.parse('2026-11-02T00:00:00-03:00'),
  endsAt: Date.parse('2026-11-09T00:00:00-03:00'),
  territoryStartsAt: Date.parse('2026-11-08T21:00:00-03:00'),
  territoryEndsAt: Date.parse('2026-11-08T21:30:00-03:00'),
  territoryPhaseMs: 10 * 60 * 1000
});

const VETERAN_GOALS = Object.freeze({ boss: 1, raid: 1, dungeon: 2 });
const VETERAN_LABELS = Object.freeze({
  boss: 'Derrotar 1 Boss com contribuicao valida',
  raid: 'Vencer 1 Raid Lv.40+ com contribuicao valida',
  dungeon: 'Vencer 2 Dungeons'
});
const VETERAN_PREFIX = 'ascension_20261102:veteran:';
const TERRITORY_PREFIX = 'ascension_20261102:district:';

export function ascensionWeekActive(nowMs = Date.now()) {
  return Number(nowMs) >= ASCENSION_WEEK.startsAt && Number(nowMs) < ASCENSION_WEEK.endsAt;
}
export function ascensionPlayerMultiplier(level, nowMs = Date.now()) {
  if (!ascensionWeekActive(nowMs)) return 1;
  const lv = Number(level);
  if (!Number.isFinite(lv) || lv < 1 || lv >= 300) return 1;
  if (lv < 100) return 4;
  if (lv < 200) return 3;
  return 2;
}
export function ascensionHeroLevelDailyCap({playerLevel, heroLevel, nowMs = Date.now()} = {}) {
  return ascensionWeekActive(nowMs) && Number(playerLevel) >= 1 &&
    Number(playerLevel) < 300 && Number(heroLevel) >= 1 && Number(heroLevel) < 70
    ? 1000 : 550;
}
export function ascensionVeteranTrial(task, metadata = {}) {
  const kind = String(task || '');
  if (!(kind in VETERAN_GOALS)) return null;
  if (kind === 'raid' && Number(metadata.raidLevel || 0) < 40) return null;
  return {kind, goal: VETERAN_GOALS[kind]};
}
export function ascensionTerritoryOpen(nowMs = Date.now()) {
  return Number(nowMs) >= ASCENSION_WEEK.territoryStartsAt &&
    Number(nowMs) < ASCENSION_WEEK.territoryEndsAt;
}
export function ascensionTerritoryPhase(nowMs = Date.now()) {
  if (!ascensionTerritoryOpen(nowMs)) return -1;
  return Math.floor((Number(nowMs) - ASCENSION_WEEK.territoryStartsAt) /
    ASCENSION_WEEK.territoryPhaseMs);
}
export function ascensionTerritoryPoints(phase, action) {
  const table = [[2, 3, 1], [3, 1, 2], [2, 1, 3]];
  if (!Number.isInteger(phase) || phase < 0 || phase >= table.length) return 0;
  if (![1, 2, 3].includes(Number(action))) return 0;
  return table[phase][Number(action) - 1] + 1;
}
export function ascensionTerritoryTally(rows = []) {
  const result = {
    ascendentes: {players: new Set(), points: 0, actions: 0},
    veteranos: {players: new Set(), points: 0, actions: 0}
  };
  for (const row of rows) {
    const v = row?.value || row || {};
    const team = result[v.team];
    if (!team || !['1', '2', '3'].includes(String(v.action)) ||
      !Number.isInteger(Number(v.phase)) || Number(v.phase) < 0 ||
      Number(v.phase) > 2 || !v.jid) continue;
    const pts = ascensionTerritoryPoints(Number(v.phase), Number(v.action));
    team.players.add(String(v.jid));
    team.points += pts;
    team.actions += 1;
  }
  const normalized = {};
  for (const name of ['ascendentes', 'veteranos']) {
    const t = result[name];
    normalized[name] = {
      players: t.players.size, actions: t.actions, points: t.points,
      score: t.players.size ? Math.round((t.points / t.players.size) * 100) / 100 : 0
    };
  }
  const a = normalized.ascendentes.score, v = normalized.veteranos.score;
  const winner = a === v ? null : a > v ? 'ascendentes' : 'veteranos';
  return {...normalized, winner};
}

// Somente 3 tipos de atividade já contabilizados nos contratos Alpha.
// Um UPSERT por prova elegível, apenas durante a semana e apenas para veteranos.
export async function recordAscensionVeteranActivity(queryable, jid, task, metadata = {}, nowMs = Date.now()) {
  if (!ascensionWeekActive(nowMs)) return false;
  const trial = ascensionVeteranTrial(task, metadata);
  if (!trial || !jid) return false;
  const user = (await queryable.query('SELECT level FROM users WHERE jid=$1', [jid])).rows[0];
  if (Number(user?.level || 0) < 300) return false;
  const key = VETERAN_PREFIX + trial.kind + ':' + jid;
  const sql = [
    "INSERT INTO trevo_settings(key,value,updated_at)",
    "VALUES($1,jsonb_build_object('count',1),EXTRACT(EPOCH FROM NOW())::BIGINT)",
    "ON CONFLICT(key) DO UPDATE SET",
    "value=jsonb_build_object('count',LEAST($2::integer,COALESCE((trevo_settings.value->>'count')::integer,0)+1)),",
    "updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT",
    "WHERE COALESCE((trevo_settings.value->>'count')::integer,0)<$2::integer"
  ].join(' ');
  const saved = await queryable.query(sql, [key, trial.goal]);
  return saved.rowCount > 0;
}
export async function getAscensionVeteranProgress(queryable, jid) {
  const keys = Object.keys(VETERAN_GOALS).map(t => VETERAN_PREFIX + t + ':' + jid);
  const rows = (await queryable.query('SELECT key,value FROM trevo_settings WHERE key=ANY($1::text[])', [keys])).rows;
  const progress = {};
  for (const type of Object.keys(VETERAN_GOALS)) {
    const count = Number(rows.find(r => r.key === VETERAN_PREFIX + type + ':' + jid)?.value?.count || 0);
    progress[type] = {count: Math.min(VETERAN_GOALS[type], Math.max(0, count)), goal: VETERAN_GOALS[type]};
  }
  progress.complete = Object.keys(VETERAN_GOALS).every(t => progress[t].count >= VETERAN_GOALS[t]);
  return progress;
}
export async function chooseAscensionTerritoryAction(queryable, jid, action, nowMs = Date.now()) {
  if (!ascensionTerritoryOpen(nowMs)) throw new Error('A disputa do distrito acontece em 08/11, das 21h às 21h30.');
  const phase = ascensionTerritoryPhase(nowMs);
  if (![1, 2, 3].includes(Number(action))) throw new Error('Escolha 1, 2 ou 3.');
  const level = Number((await queryable.query('SELECT level FROM users WHERE jid=$1', [jid])).rows[0]?.level || 0);
  if (level < 1) throw new Error('Perfil não encontrado.');
  const team = level >= 300 ? 'veteranos' : 'ascendentes';
  const value = {jid, team, phase, action: Number(action)};
  const key = TERRITORY_PREFIX + phase + ':' + jid;
  const sql = [
    'INSERT INTO trevo_settings(key,value,updated_at)',
    'VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT)',
    'ON CONFLICT(key) DO NOTHING'
  ].join(' ');
  const r = await queryable.query(sql, [key, JSON.stringify(value)]);
  if (!r.rowCount) throw new Error('Você já participou desta fase. Volte na próxima!');
  return {...value, points: ascensionTerritoryPoints(phase, action)};
}
export async function getAscensionTerritoryTally(queryable) {
  const rows = (await queryable.query('SELECT value FROM trevo_settings WHERE key LIKE $1',
    [TERRITORY_PREFIX + '%'])).rows;
  return ascensionTerritoryTally(rows);
}
export async function ascensionStatusText(queryable, jid, nowMs = Date.now()) {
  const level = Number((await queryable.query('SELECT level FROM users WHERE jid=$1', [jid])).rows[0]?.level || 1);
  const before = Number(nowMs) < ASCENSION_WEEK.startsAt;
  const after = Number(nowMs) >= ASCENSION_WEEK.endsAt;
  const lines = ['🚀 *SEMANA DA ASCENSÃO ALPHA*', '', '📅 02/11 a 08/11/2026 • horário de Brasília'];
  if (before) lines.push('⏳ Inicia segunda-feira, 02/11, às 00h. Nenhum bônus ativo ainda.');
  else if (after) lines.push('🏁 Semana encerrada. Nenhum bônus de XP permanece ativo.');
  else lines.push('✅ *EVENTO ATIVO*');
  lines.push('', '⭐ Seu nível: *' + level + '*');
  if (level < 300) {
    const multiplier = ascensionPlayerMultiplier(level, nowMs);
    lines.push('🌱 Bônus de XP do jogador: *' + multiplier + '×*');
    lines.push('🌈 Heróis abaixo do Lv.70: até *1.000 XP/dia* durante a semana.');
    lines.push('🎯 Ao chegar ao Lv.300, termina a alavancagem.');
  } else {
    lines.push('👑 *TRILHA DOS VETERANOS* — XP normal.');
    const progress = await getAscensionVeteranProgress(queryable, jid);
    for (const type of ['boss', 'raid', 'dungeon'])
      lines.push((progress[type].count >= progress[type].goal ? '✅ ' : '⬜ ') +
        VETERAN_LABELS[type] + ': *' + progress[type].count + '/' + progress[type].goal + '*');
    if (progress.complete) lines.push('🏆 *GUARDIÃO DA ASCENSÃO!* Três provas concluídas.');
    else lines.push('⚔️ Conclua as provas jogando normalmente. Sem comandos extras.');
  }
  lines.push('', '🏙️ *GRANDE FINAL — DISTRITO CENTRAL*');
  lines.push('📅 Domingo, 08/11 • 21h–21h30.');
  if (Number(nowMs) >= ASCENSION_WEEK.territoryStartsAt) {
    const scores = await getAscensionTerritoryTally(queryable);
    lines.push('🌱 Ascendentes: *' + scores.ascendentes.score + '* pontos médios (' + scores.ascendentes.players + ' jogadores)');
    lines.push('👑 Veteranos: *' + scores.veteranos.score + '* pontos médios (' + scores.veteranos.players + ' jogadores)');
    if (ascensionTerritoryOpen(nowMs)) {
      lines.push('🔥 Fase *' + (ascensionTerritoryPhase(nowMs) + 1) + '/3* ativa!');
      lines.push('1️⃣ ⚔️ Atacar a posição rival');
      lines.push('2️⃣ 🥷 Infiltrar e obter informações');
      lines.push('3️⃣ 🛡️ Defender e consolidar o território');
      lines.push('👉 Uma ação por fase. Responda com o número.');
    } else {
      lines.push('🏆 *RESULTADO:* ' + (!scores.ascendentes.players && !scores.veteranos.players ?
        'Sem participantes' : scores.winner === 'ascendentes' ? 'Ascendentes conquistaram o distrito!' :
        scores.winner === 'veteranos' ? 'Veteranos defenderam o distrito!' : 'Empate — território neutro.'));
    }
  } else lines.push('🔒 A disputa abrirá automaticamente no domingo.');
  lines.push('', 'ℹ️ As regras não alteram equipamentos, pets, ganhos de dinheiro ou maestrias.');
  return lines.join('\n');
}
