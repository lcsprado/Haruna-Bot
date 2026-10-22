/** Serializa operações por chat, sem bloquear outros grupos nem duplicar ações. */
export function createKeyedAsyncQueue() {
  const pending = new Map()
  return function enqueue(key, task) {
    if (typeof task !== 'function') throw new TypeError('A queue task must be a function')
    const chatKey = String(key || '__unknown__')
    const previous = pending.get(chatKey) || Promise.resolve()
    const current = previous.catch(() => {}).then(task)
    pending.set(chatKey, current)
    // Falha não bloqueia operações seguintes; o chamador recebe a rejeição original.
    void current.then(
      () => { if (pending.get(chatKey) === current) pending.delete(chatKey) },
      () => { if (pending.get(chatKey) === current) pending.delete(chatKey) }
    )
    return current
  }
}
