import {heroLevelAwardPolicy,HERO_MASTERY_DAILY_CAP,HERO_MASTERY_SPECIAL_DAILY_CAP,raid75MasteryBonusActive,sevenSinsProgressWeekActive} from './playable-heroes-core.js'

// Leitura de XP ja creditado: nao altera saldo, progressao nem cooldown.
// Sao Paulo e a mesma data utilizada pelos INSERTs e limites diarios.
const whole=x=>Math.max(0,Math.floor(Number(x)||0))
const fmt=x=>whole(x).toLocaleString('pt-BR')
const timeBR=seconds=>new Intl.DateTimeFormat('pt-BR',{
  timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'
}).format(new Date(Number(seconds)*1000))
export function formatHeroDailyXpReport({heroes=[],awards=[],playerLevel=1,nowMs=Date.now()}={}){
  const available=heroes.filter(h=>h?.owned)
  if(!available.length)return '🌈 *XP DOS HERÓIS — HOJE*\n\nVocê ainda não possui heróis dos Sete Pecados.'
  const when=new Intl.DateTimeFormat('pt-BR',{
    timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'
  }).format(new Date(nowMs))
  const specialRaid=raid75MasteryBonusActive({level:75,collab:true,nowMs})
  const uncapped=sevenSinsProgressWeekActive(nowMs)
  const masteryCap=uncapped?null:(specialRaid?HERO_MASTERY_SPECIAL_DAILY_CAP:HERO_MASTERY_DAILY_CAP)
  const lines=['🌈⚔️ *XP DOS HERÓIS — HOJE*','📅 *'+when+'* • horário de Brasília']
  let activeFinished=false
  for(const hero of available){
    const levelRow=awards.find(a=>a.hero_species===hero.id&&a.kind==='nivel')
    const masteryRow=awards.find(a=>a.hero_species===hero.id&&a.kind==='maestria')
    const earnedLevel=whole(levelRow?.gained),earnedMastery=whole(masteryRow?.gained)
    const heroLevel=whole(hero.petLevel),masteryTotal=whole(hero.masteryXp)
    const levelMax=heroLevel>=100||whole(hero.petXp)>=9900
    const masteryMax=masteryTotal>=7000
    const policy=heroLevelAwardPolicy({
      earnedToday:earnedLevel,currentXp:Math.max(whole(hero.petXp),Math.max(0,heroLevel-1)*100),
      xp:9900,playerLevel,heroLevel,nowMs
    })
    const remainingLevel=levelMax?0:policy.amount
    const remainingMastery=masteryMax?0:(uncapped?Math.max(0,7000-masteryTotal):Math.max(0,masteryCap-earnedMastery))
    const finished=remainingLevel===0&&remainingMastery===0
    if(hero.active)activeFinished=finished
    lines.push('',(hero.active?'⚔️ ':'🌈 ')+ '*' +hero.name.toUpperCase()+'*'+
      (hero.active?' — ATIVO':'')+' • Nv.'+heroLevel+'/100 • Maestria '+whole(hero.masteryStage)+'/5')
    lines.push('⭐ Nível hoje: '+(levelMax?'*'+fmt(earnedLevel)+' XP* • nível máximo':
      uncapped?'*'+fmt(earnedLevel)+' XP* • sem limite diário • faltam *'+fmt(remainingLevel)+' XP* até Nv.100':
      '*'+fmt(earnedLevel)+'/'+fmt(policy.dailyCap)+' XP* • faltam *'+fmt(remainingLevel)+' XP*'))
    lines.push('🏅 Maestria hoje: '+(masteryMax?'*'+fmt(earnedMastery)+' XP* • XP máximo':
      uncapped?'*'+fmt(earnedMastery)+' XP* • sem limite diário • faltam *'+fmt(remainingMastery)+' XP* até 7.000':
      '*'+fmt(earnedMastery)+'/'+fmt(masteryCap)+' XP* • faltam *'+fmt(remainingMastery)+' XP*'))
    const last=Math.max(whole(levelRow?.last_award),whole(masteryRow?.last_award))
    if(last)lines.push('🕐 Último XP creditado hoje: '+timeBR(last))
    lines.push(finished?'✅ Sem XP adicional para farmar hoje':'🟢 Ainda pode farmar XP')
  }
  if(uncapped)lines.push('','🔥 *09 a 15/11: XP diário de nível e maestria sem limite para os Sete Pecados.*','⏳ Limites diários normais voltam em 16/11 às 00h de Brasília.')
  else {
    lines.push('','🔄 Os limites diários reiniciam à *00h00 de Brasília*.')
    if(specialRaid)lines.push('🌈 Maestria acima de 400 XP depende da Raid 75 especial.')
  }
  if(activeFinished&&available.length>1)
    lines.push('💡 Seu herói ativo esgotou o XP disponível. Para trocar: *!heroi usar nome*.')
  lines.push('🔎 Consultar um só: *!heroi xp ban* (substitua pelo nome).')
  return lines.join('\n')
}
