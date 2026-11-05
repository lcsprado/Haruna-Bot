// Escala fixa das missões coletivas: quiz é opt-in, nunca obrigação semanal.
// Mesmo grupo alterna trabalho e batalha a cada chave de semana.
export const GROUP_WEEKLY_CHOICES=Object.freeze([
  Object.freeze({type:'work',title:'Mutirão Alpha — Trabalhar juntos',target:40,reward:50000}),
  Object.freeze({type:'battle',title:'Arena Alpha — Batalhar juntos',target:25,reward:60000})
])

export function groupWeeklyChoice(chatJid,weekKey){
  const matched=/^(\d{4})-W(\d{1,2})$/.exec(String(weekKey||''))
  if(!matched)throw new Error('Chave da semana coletiva inválida.')
  const year=Number(matched[1]),week=Number(matched[2])
  if(week<1||week>53)throw new Error('Semana coletiva inválida.')
  const jan1=Date.UTC(year,0,1)
  // A chave legada avança aos domingos UTC. Calcular o ordinal dessa semana
  // (não somar caracteres "W40", "W41"... que produz seleções enviesadas).
  const firstSunday=Math.floor(jan1/86400000)-new Date(jan1).getUTCDay()
  const ordinal=Math.floor(firstSunday/7)+week-1
  const parity=[...String(chatJid||'')].reduce((n,ch)=>(n+ch.codePointAt(0))%2,0)
  return GROUP_WEEKLY_CHOICES[((ordinal+parity)%2+2)%2]
}
