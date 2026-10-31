// Limitador de comandos da entrada Neon: nao interfere nas conversas do grupo.
// Sem acesso a banco: filtra repetições antes de ensureUser e das consultas pesadas.
const WINDOW_MS = 15_000
const MAX_COMMANDS = 8
const BLOCK_MS = 30_000
const NOTICE_MS = 20_000
const CLEANUP_MS = 60_000
const RETAIN_MS = 120_000
const MAX_PLAYERS = 5_000

const ALIASES = new Map([
  ['profile', 'perfil'],
  ['inventory', 'inventario'], ['inv', 'inventario'],
  ['rank', 'ranking'], ['top', 'ranking'],
  ['commands', 'comandos'], ['comando', 'comandos'], ['cmds', 'comandos'],
  ['balance', 'saldo'], ['bal', 'saldo'],
  ['respostapokemon', 'pk']
])

const HEAVY = new Set([
  'perfil', 'inventario', 'ranking', 'rankingrpg', 'rankrpg',
  'patrimonio', 'menu', 'comandos', 'meupet', 'statuspet', 'status',
  'loja', 'shop', 'pets', 'personagens', 'meuscarros', 'minhacasa'
])
const FAST_EVENTS = new Set(['pk', 'resposta', 'chute', 'pegar'])

function normalizeCommand(raw) {
  const key = String(raw || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return ALIASES.get(key) || key
}

function commandCooldown(command) {
  if (command === 'pk') return 0 // Duas tentativas do Quiz sao validadas na transacao do evento.
  if (command === 'perfil') return 10_000
  if (HEAVY.has(command)) return 7_000
  if (FAST_EVENTS.has(command)) return 700
  return 3_000
}

export function createGlobalCommandAntispam({clock = () => Date.now()} = {}) {
  const players = new Map()
  let lastSweep = 0

  function inspect({sender, body, prefix = '!', receivedAt} = {}) {
    const message = String(body || '').trim()
    if (!sender || !prefix || !message.startsWith(prefix)) return {allowed: true}
    const word = message.slice(prefix.length).trim().split(/\s+/)[0]
    if (!word) return {allowed: true}
    const command = normalizeCommand(word)
    const suppliedTime = Number(receivedAt)
    const now = Number.isFinite(suppliedTime) && suppliedTime > 0 ? suppliedTime : clock()

    if (now - lastSweep >= CLEANUP_MS) {
      for (const [id, row] of players) {
        if (now - row.lastSeen > RETAIN_MS && now >= row.blockedUntil) players.delete(id)
      }
      lastSweep = now
    }

    let row = players.get(sender)
    if (!row) {
      if (players.size >= MAX_PLAYERS) players.delete(players.keys().next().value)
      row = {recent: [], lastCommand: new Map(), blockedUntil: 0, lastNotifiedAt: -Infinity, lastSeen: now}
      players.set(sender, row)
    }
    row.lastSeen = now

    function denied(reason, delayMs) {
      const notify = now - row.lastNotifiedAt >= NOTICE_MS
      if (notify) row.lastNotifiedAt = now
      return {allowed: false, notify, reason, command, retrySeconds: Math.ceil(Math.max(0, delayMs) / 1000)}
    }

    if (now < row.blockedUntil) return denied('blocked', row.blockedUntil - now)
    row.recent = row.recent.filter(t => now - t < WINDOW_MS)
    row.recent.push(now)

    if (row.recent.length > MAX_COMMANDS) {
      row.blockedUntil = now + BLOCK_MS
      return denied('flood', BLOCK_MS)
    }

    for (const [name, t] of row.lastCommand) {
      if (now - t > RETAIN_MS) row.lastCommand.delete(name)
    }
    const cooldownMs = commandCooldown(command)
    const previous = row.lastCommand.get(command)
    if (previous !== undefined && now - previous < cooldownMs) {
      return denied('cooldown', cooldownMs - (now - previous))
    }
    row.lastCommand.set(command, now)
    return {allowed: true, command}
  }

  return {inspect}
}

export function commandAntispamNotice(result) {
  if (!result || result.allowed || !result.notify) return null
  if (result.reason === 'cooldown') {
    return '🚦 *ANTISPAM:* espere *' + result.retrySeconds + 's* para repetir *!' +
      String(result.command).slice(0, 32) + '*. Comandos extras foram ignorados.'
  }
  return '🚦 *ANTISPAM:* excesso de comandos. Novos comandos liberados em *' +
    result.retrySeconds + 's*. Mensagens normais continuam permitidas.'
}
