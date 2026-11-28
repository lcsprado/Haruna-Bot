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

export const GROUP_WEEKLY_V2_START='2026-12-05';
export const GROUP_WEEKLY_V2_CHOICES=Object.freeze([
 {type:'work',title:'Mutirão Alpha — Trabalhar juntos',target:60,reward:100000,unit:'ações'},
 {type:'battle',title:'Arena Alpha — Batalhar juntos',target:30,reward:120000,unit:'duelos'},
 {type:'raid_coop',title:'União dos Guerreiros',target:20,reward:200000,unit:'Raids'},
 {type:'boss_damage',title:'Caçadores de Titãs',target:1000000,reward:150000,unit:'dano'},
 {type:'dungeon',title:'Exploradores',target:40,reward:120000,unit:'dungeons'},
 {type:'pet_train',title:'Mestres dos Pets',target:60,reward:100000,unit:'treinos'}
].map(Object.freeze));
export function groupWeeklyV2Choice(weekKey){
 const matched=/^(\d{4})-W(\d{1,2})$/.exec(String(weekKey||''));
 if(!matched)throw Error('Semana inválida');
 const year=Number(matched[1]),week=Number(matched[2]);
 if(week<1||week>53)throw Error('Semana inválida');
 const ordinal=Math.floor((Math.floor(Date.UTC(year,0,1)/86400000)-new Date(Date.UTC(year,0,1)).getUTCDay())/7)+week-1;
 // Começa pelo Mutirão, depois as seis atividades em sequência.
 const epoch=Math.floor((Math.floor(Date.UTC(2026,0,1)/86400000)-new Date(Date.UTC(2026,0,1)).getUTCDay())/7)+49;
 return GROUP_WEEKLY_V2_CHOICES[((ordinal-epoch)%6+6)%6];
}
