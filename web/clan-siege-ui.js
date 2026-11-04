// Cerco ao Castelo — etapa visual. Nenhuma ação daqui executa transações no servidor.
const ESCAPE = (value) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

const ACTIONS = Object.freeze([
  {id:'attack',icon:'⚔️',label:'Atacar',effect:'180 de dano. Em dupla com outro atacante, +10% nos ataques; com Espionar, +30%.'},
  {id:'defend',icon:'🛡️',label:'Defender',effect:'Reduz 50% do dano ao castelo e devolve 80 se o rival atacar. Dois defensores bloqueiam 75%.'},
  {id:'repair',icon:'🔨',label:'Reparar',effect:'Recupera até 220 HP depois do ataque. Máximo de 2 reparos por guerra e por clã.'},
  {id:'spy',icon:'🕵️',label:'Espionar',effect:'Com um atacante, +30% agora. Na próxima rodada, +60% de ataque por espião.'}
]);
const TACTICAL_ACTIONS = Object.freeze([
  {id:'attack',icon:'⚔️',label:'Atacar',effect:'Castelo: 180 de dano; Portão: 105 e pressão para rompê-lo; Depósito: 110 e saque de suprimento.'},
  {id:'defend',icon:'🛡️',label:'Defender',effect:'Proteja uma frente: bloqueia 50% por defensor no alvo certo (até 75%) e contra-ataca. Alvo errado protege só 10%.'},
  {id:'repair',icon:'🔨',label:'Reparar',effect:'Consome 1 suprimento de guerra: restaura até 220 HP do Castelo OU 1 ponto do Portão. Dois reparos por guerra.'},
  {id:'spy',icon:'🕵️',label:'Espionar',effect:'Escolha uma frente: +30% no ataque aliado à mesma frente agora e +60% na próxima rodada.'},
  {id:'supply',icon:'📦',label:'Reabastecer',effect:'Ganha 1 suprimento de guerra (máximo 3). Não é dinheiro do tesouro do clã.'}
]);
const FRONTS_V4=Object.freeze([
  {id:'castle',icon:'🏰',label:'Castelo',tip:'Dano direto ao HP da fortaleza'},
  {id:'gate',icon:'🚪',label:'Portão',tip:'Rompimento expõe o castelo a +25% de dano futuro'},
  {id:'depot',icon:'📦',label:'Depósito',tip:'Proteção ou saque de suprimentos de reparo'}
]);
function objectivesGuide(match){
  const version=Number(match?.rulesVersion||5);
  const repairHp=version>=5?280:220;
  const empty='—';
  const gate=side=>match?.[side+'Gate']??empty;
  const supplies=side=>match?.[side+'Supplies']??empty;
  const score=side=>match?.[side+'Score']??empty;
  return '<section class="siege-selected section" aria-label="Três frentes do Cerco">'+
    '<strong>🗺️ GUERRA POR OBJETIVOS — V'+version+'</strong>'+
    '<p>⚔️ <b>Castelo:</b> ataque básico 180. Quando o Portão inimigo está rompido, ataques ao Castelo ganham +25% a partir da rodada seguinte.</p>'+
    '<p>🚪 <b>Portão:</b> cada ataque causa 105 ao HP e 1 ponto de pressão. Duas investidas rompem o Portão; Defender o Portão bloqueia uma investida por guarda.</p>'+
    '<p>📦 <b>Depósito:</b> cada ataque causa 110 ao HP e pode saquear 1 suprimento. Defender o Depósito impede um saque por guarda.</p>'+
    '<p>📦 <b>Reabastecer:</b> recebe 1 suprimento de Cerco (máximo 3); o jogo começa com 1. Reparar exige 1 suprimento, restaura até '+repairHp+' HP do Castelo ou 1 ponto do Portão e só pode ser realizado duas vezes por clã.</p>'+
    '<p>🤝 <b>Combine os alvos com seu parceiro:</b> duas ofensivas na mesma frente recebem +10%; espionagem só melhora ataques direcionados à frente escolhida.</p>'+
    '<p>🏆 <b>Vitória:</b> mais HP ao terminar seis rodadas. Se houver igualdade, pontos de objetivos; depois integridade do Portão; depois suprimentos. Persistindo igualdade, empate.</p>'+
    '<div class="grid two"><div class="siege-selected"><strong>🔵 Fortaleza azul</strong><p>🚪 '+ESCAPE(gate('blue'))+'/2 • 📦 '+ESCAPE(supplies('blue'))+'/3 • 🎯 '+ESCAPE(score('blue'))+' pontos</p></div>'+
    '<div class="siege-selected"><strong>🔴 Fortaleza vermelha</strong><p>🚪 '+ESCAPE(gate('red'))+'/2 • 📦 '+ESCAPE(supplies('red'))+'/3 • 🎯 '+ESCAPE(score('red'))+' pontos</p></div></div>'+
    '<small>Suprimentos do Cerco são virtuais, não movimentam dinheiro, XP, HP ou itens dos personagens. Valores com traço são prévia, ainda sem uma partida ativa. As ações rivais permanecem privadas até fechar cada rodada.</small></section>';
}
const LEGACY_ACTIONS = Object.freeze([
  {id:'attack',icon:'⚔️',label:'Atacar',effect:'180 de dano por jogador, antes da defesa rival.'},
  {id:'defend',icon:'🛡️',label:'Defender',effect:'Reduz 35% por defensor, até o máximo de 60%, sem contra-ataque.'},
  {id:'repair',icon:'🔨',label:'Reparar',effect:'Recupera até 140 HP, com dois usos por guerra.'},
  {id:'spy',icon:'🕵️',label:'Espionar',effect:'Aumenta em 20% o dano do clã na próxima rodada.'}
]);
function renderTacticsGuide(version,round,repairsLeft){
  if(version>=4)return '';
  if(version<2)return '<aside class="siege-selected section" aria-label="Regras preservadas desta guerra">'+
    '<strong>📜 Guerra na regra antiga</strong><p>Esta partida segue com ataque 180, defesa -35% por defensor, reparo 140 e espionagem +20% na próxima rodada. As novas combinações só valem para partidas futuras.</p>'+
    '<p>🏆 Vence quem terminar com mais HP; HP igual é empate sem insígnia.</p></aside>';
  return '<aside class="siege-selected section" aria-label="Guia de táticas da dupla">'+
    '<strong>🤝 Estratégia em conjunto — dois jogadores</strong>'+
    '<p>Converse com seu parceiro antes de confirmar. Cada jogador escolhe UMA ação. As escolhas permanecem secretas até o fim da rodada.</p>'+
    '<p>⚔️ + ⚔️ <b>Assalto coordenado:</b> 396 de dano antes da defesa rival (+10% nos dois ataques).</p>'+
    '<p>⚔️ + 🛡️ <b>Avanço protegido:</b> 180 de dano + 50% de proteção e 80 de contra-ataque quando atingido.</p>'+
    '<p>⚔️ + 🔨 <b>Ofensiva de suporte:</b> 180 de dano + até 220 HP restaurados.</p>'+
    '<p>⚔️ + 🕵️ <b>Ataque marcado:</b> 234 de dano agora e +60% de ataque na rodada seguinte.</p>'+
    '<p>🛡️ + 🛡️ <b>Muralha conjunta:</b> bloqueia 75% e devolve até 160 de dano se for atacada.</p>'+
    '<p>🛡️ + 🔨 <b>Bastião:</b> 50% de proteção + até 220 HP de reparo.</p>'+
    '<p>🕵️ + 🕵️ <b>Inteligência total:</b> prepara +120% de dano na rodada seguinte, sem ataque agora.</p>'+
    '<p>🔨 + 🔨 <b>Reconstrução:</b> recupera até 440 HP, mas consome os dois reparos da guerra.</p>'+
    '<p>🛡️ + 🕵️ protege e prepara ofensiva; 🔨 + 🕵️ recupera e prepara ofensiva.</p>'+
    '<p>🔨 Reparos restantes do seu clã: <b>'+ESCAPE(repairsLeft)+'/2</b>. '+
    (round===6?'⚠️ Na última rodada Espionar não gera bônus, porque não haverá próxima rodada.':
    'Espionar ajuda na rodada seguinte: combine quando atacar com seu parceiro.')+'</p>'+
    '<p>🏆 Após 6 rodadas ganha quem tiver mais HP; HP igual dá empate e a insígnia continua disponível.</p></aside>';
}

function renderFortressPanel(fortress){
  if(!fortress)return '';
  const statNames={hp:'❤️ Muralhas',attack:'⚔️ Arsenal',defense:'🛡️ Defesas'};
  const levels=fortress.levels||{},offers=fortress.offers||{},stats=fortress.stats||{};
  const currency=v=>'R$ '+Math.max(0,Number(v)||0).toLocaleString('pt-BR');
  const active=fortress.pending;
  const rest=active?Math.max(0,Number(active.readyAt||0)-Date.now()):0;
  const time=rest?Math.ceil(rest/3600000)+'h restantes':'Aguardando finalização e atualização';
  return '<section class="card section" aria-label="Evolução permanente da fortaleza">'+
    '<div class="section-title"><h3>🏰 Fortaleza do clã</h3><small>Melhorias permanentes • separadas dos personagens</small></div>'+
    '<p>💰 Tesouro: <strong>'+currency(fortress.treasury)+'</strong> • ⭐ Nível do clã: '+
      Number(fortress.clanLevel||1)+'</p>'+
    '<p>❤️ HP: <b>'+Number(stats.maxHp||2000)+'</b> / 2.250 • '+
      '⚔️ Bônus ATK: <b>+'+(Number(stats.attackPct||0)*100).toFixed(1)+'%</b> • '+
      '🛡️ Redução de dano: <b>'+(Number(stats.defensePct||0)*100).toFixed(1)+'%</b></p>'+
    (active?'<p class="notice">⏳ Obra em andamento: '+ESCAPE(statNames[active.stat]||active.stat)+
      ' → nível '+Number(active.to)+' • '+time+'. Benefício somente na próxima guerra iniciada após a conclusão.</p>':
      '<p>O líder pode iniciar UMA obra por vez. Cada investimento desconta o tesouro do clã. Doações continuam gerando XP do clã, mas não dão bônus de combate por si mesmas.</p>')+
    '<div class="siege-action-grid">'+['hp','attack','defense'].map(stat=>{
      const offer=offers[stat],level=Number(levels[stat]||0),price=Number(offer?.cost||0);
      const hours=Math.round(Number(offer?.durationMs||0)/3600000);
      const permitted=fortress.isLeader&&!active&&offer&&Number(fortress.treasury)>=price;
      return '<div class="siege-action"><strong>'+statNames[stat]+' • Nível '+level+'/5</strong>'+
        '<small>'+(stat==='hp'?'+50 HP por nível (máximo +250)':stat==='attack'?
          '+2% de dano por nível (máximo +10%)':'+1,5% de redução por nível (máximo 7,5%)')+'</small>'+
        '<small>'+(offer?'Próximo nível: '+currency(price)+' • '+hours+'h de obra':'Nível máximo alcançado')+'</small>'+
        (offer?'<button type="button" class="btn" data-siege-upgrade="'+stat+'"'+
          (permitted?'':' disabled')+'>'+ (fortress.isLeader?'Construir':'Somente líder')+'</button>':'')+
        '</div>';
    }).join('')+'</div>'+
    '<p class="muted">A evolução é exclusiva do castelo: não aumenta HP, ATK ou DEF dos heróis. A força da fortaleza fica congelada no início de cada guerra.</p>'+
    '</section>';
}

function renderCastle(clan,side){
  const name=ESCAPE(clan?.name|| (side==='home'?'Seu clã':'Clã rival'));
  const count=Number(clan?.members||0);
  return '<article class="siege-castle siege-'+side+'">'+
    '<span class="siege-castle-kicker">'+(side==='home'?'FORTALEZA AZUL':'FORTALEZA VERMELHA')+'</span>'+
    '<div class="siege-castle-art" aria-hidden="true">🏰</div>'+
    '<h4>'+name+'</h4>'+
    '<p>'+(count>0?count+' combatente(s) cadastrado(s)':'Escalação a confirmar')+'</p>'+
    '<div class="siege-castle-hp"><span>HP inicial previsto</span><strong>2.000 / 2.000</strong></div>'+
    '<div class="siege-hp-track"><span></span></div>'+
    '</article>';
}

function siegeActionRisk(match,selectedAction,target,remainingRepairs){
  const version=Number(match?.rulesVersion||1);
  if(version<4||!selectedAction||match?.status!=='active'||match?.myMove)return '';
  const side=match?.mySide;
  if(!side)return '';
  const hp=Number(match?.[side+'Hp']||0);
  const maxHp=Number(match?.[side+'MaxHp']||2000);
  const supplies=Number(match?.[side+'Supplies']||0);
  const gate=Number(match?.[side+'Gate']||0);
  const heal=version>=5?280:220;
  const warnings=[];
  if(selectedAction==='repair'){
    if(remainingRepairs<=0)warnings.push('❌ Você já usou os 2 reparos do clã. Escolha outra ação.');
    else {
      if(supplies===0)warnings.push('⚠️ Sem suprimentos agora: o reparo só será possível se seu parceiro usar Reabastecer nesta rodada. Caso contrário, essa ação não terá efeito.');
      if(target==='castle'){
        if(hp>=maxHp)warnings.push('⚠️ HP cheio neste momento: reparar só terá efeito se o Castelo sofrer dano nesta rodada.');
        else warnings.push('💚 Sem novos ataques, a recuperação máxima seria '+Math.min(heal,maxHp-hp)+' HP. Se receber dano nesta rodada, pode recuperar até '+heal+' HP, limitado ao máximo do Castelo.');
      }
      if(target==='gate'&&gate>=2)warnings.push('⚠️ Portão intacto: reparar só terá efeito se o Portão receber uma investida nesta rodada.');
      else if(target==='gate')warnings.push('🚪 O reparo recupera 1 ponto de Portão (máximo 2); NÃO recupera HP do Castelo.');
      warnings.push('⚖️ Reparar não garante vitória: na resolução, prevalece o HP final do Castelo.');
    }
  }
  if(selectedAction==='spy'&&Number(match.round)>=6)
    warnings.push('⚠️ Última rodada: não haverá próxima rodada para usar o bônus de +60%. O bônus imediato de +30% exige que seu parceiro ataque a mesma frente agora.');
  if(selectedAction==='supply'&&supplies>=3)
    warnings.push('⚠️ Estoque já cheio (3/3). Reabastecer agora não gera suprimento nem recupera HP.');
  if(selectedAction==='attack'&&target==='gate'&&Number(match?.[otherSide(side)+'Gate'])===0)
    warnings.push('ℹ️ Portão adversário já rompido: atacar o Castelo agora permite aproveitar +25% de dano; atacar o Portão novamente não reduz mais sua integridade.');
  return warnings.length?'<div class="notice warn section" aria-label="Aviso estratégico antes da confirmação">'+warnings.map(x=>'<p>'+ESCAPE(x)+'</p>').join('')+'</div>':'';
}
const otherSide=side=>side==='blue'?'red':'blue';

function renderLiveSiege(ui){
  const data=ui.siege,match=data.match,clans=data.clans||[];
  const mine=clans.find(c=>String(c.id)===String(data.myClanId));
  const blue=match?clans.find(c=>String(c.id)===String(match.blueClanId)):mine;
  const red=match?clans.find(c=>String(c.id)===String(match.redClanId)):clans.find(c=>String(c.id)!==String(data.myClanId));
  const stage=match?.status||'idle';
  const active=stage==='active';
  const previous=stage==='completed';
  // Uma guerra concluída é histórico. Seu HP, sua seleção V1 e o botão de
  // Defesa não podem controlar a prévia independente da próxima Guerra V5.
  // Fora de uma partida ativa, os botões demonstram a PRÓXIMA guerra (V5),
  // mas o histórico/placar continuam mostrando a versão em que foram jogados.
  const rulesVersion=active?Number(match.rulesVersion||1):5;
  const availableActions=rulesVersion>=4?TACTICAL_ACTIONS.map(a=>a.id==='repair'&&rulesVersion>=5?
    {...a,effect:a.effect.replace('220 HP','280 HP')}:a):rulesVersion>=2?ACTIONS:LEGACY_ACTIONS;
  const remainingRepairs=active?Math.max(0,2-Number(match?.[match?.mySide+'Repairs']||0)):2;
  const canMove=active&&Boolean(match.mySide)&&!match.myMove;
  const selected=availableActions.find(x=>x.id===ui.siegePreviewAction)||null;
  const selectedActionId=(active?match?.myMove:null)||selected?.id||null;
  const selectedTarget=(active?match?.myTarget:null)||(
    selectedActionId==='supply'?'depot':ui.siegePreviewTarget||'castle');
  const permittedTargets=selectedActionId==='repair'?FRONTS_V4.filter(front=>front.id!=='depot'):
    selectedActionId==='supply'?FRONTS_V4.filter(front=>front.id==='depot'):FRONTS_V4;
  // Antes das 20h: seleção apenas visual, sem transação.
  // Na rodada ativa: precisa confirmar uma escolha; jamais usar Defender como padrão oculto.
  const canPreview=!active||(canMove&&!match?.myMove);
  const canConfirm=canMove&&Boolean(selected)&&!(selected?.id==='repair'&&remainingRepairs<=0);
  const duration=active?Math.max(0,Math.ceil((Number(match.roundEndsAt)-Date.now())/1000)):0;
  const countdown=active?' • '+Math.floor(duration/60)+'m '+String(duration%60).padStart(2,'0')+'s':'';
  const label=active?'⚔️ GUERRA ATIVA · V'+rulesVersion:stage==='pending'?'⏳ DESAFIO ANTIGO PENDENTE':'⏰ CERCO V5 · HOJE ÀS 20H';
  // A guerra começa às 20h, sem convite ou aceite manual.
  let controls='';
  if(stage==='pending'&&match.createdByMe)controls='<button class="btn danger" data-siege-command="cancel">Cancelar desafio antigo</button>';
  const notice=stage==='pending'?'Desafio anterior: expira em 30 minutos sem aceite. A guerra diária começa às 20h. Você já pode explorar as ações, sem enviar escolhas.':
    stage==='completed'?'A guerra anterior (V'+Number(match?.rulesVersion||1)+') terminou. Abaixo está a NOVA GUERRA V5 com cinco ações e três frentes. Faça uma prévia livre; escolhas só poderão ser confirmadas a partir das 20h.':
    active?'Ações são secretas. Escolha uma estratégia e CONFIRME por rodada. Sem confirmação, nenhuma ação será executada.':
    'A guerra começa diariamente às 20h de Brasília. Você pode explorar as cinco ações da próxima guerra agora, mas só confirmar durante a partida.';
  const pct=(hp,max)=>Math.min(100,Math.max(0,Number(hp||0)/Number(max||2000)*100)).toFixed(1);
  function fortress(c,side){
    const hp=Number((active?match:null)?.[side+'Hp']??2000);
    const maxHp=Number((active?match:null)?.[side+'MaxHp']??2000);
    return '<article class="siege-castle siege-'+(side==='blue'?'home':'enemy')+'">'+
      '<span class="siege-castle-kicker">'+(side==='blue'?'🔵 CASTELO AZUL':'🔴 CASTELO VERMELHO')+'</span>'+
      '<div class="siege-castle-art" aria-hidden="true">🏰</div><h4>'+ESCAPE(c?.name||'Clã a confirmar')+'</h4>'+
      '<p>'+Number(c?.members||0)+' membros • '+Number(c?.linked||0)+'/2 Web vinculados</p>'+
      '<div class="siege-castle-hp"><span>HP</span><strong>'+hp+' / '+maxHp.toLocaleString('pt-BR')+'</strong></div>'+
      '<div class="siege-hp-track"><span style="width:'+pct(hp,maxHp)+'%"></span></div></article>';
  }
  const latest=Array.isArray(match?.history)?match.history.slice(-3):[];
  return '<section class="siege-preview section">'+
    '<div class="siege-head"><div><p class="siege-eyebrow">ALPHA BOT · GUERRA DE CLÃS</p>'+
    '<h3>🏰 Cerco ao Castelo</h3><p>Dois clãs, quatro jogadores, ações secretas e resultado no WhatsApp.</p></div>'+
    '<span class="siege-status">'+label+'</span></div>'+
    '<div class="siege-stage">'+fortress(blue,'blue')+
    '<div class="siege-versus"><strong>VS</strong><small>⏰ 20h</small><small>6 rodadas</small><small>5 min cada</small></div>'+
    fortress(red,'red')+'</div>'+
    '<div class="siege-data-note">'+ESCAPE(notice)+
    (active?' • Rodada '+Number(match.round)+'/6'+countdown+' • '+Number(match.submitted)+'/4 ações enviadas':'')+'</div>'+
    '<div class="hero-actions">'+controls+'<button class="btn" data-siege-refresh>🔄 Atualizar</button></div>'+
    (ui.siegeError?'<div class="notice warn section">'+ESCAPE(ui.siegeError)+'</div>':'')+
    renderFortressPanel(data.fortress)+
    '<div class="siege-planning"><div class="siege-planning-head"><h4>'+(
      match?.myMove?'✅ Ação confirmada':'Escolha sua estratégia')+'</h4>'+
      '<span class="siege-status">'+(active?'RODADA '+Number(match.round)+'/6':'AGUARDANDO GUERRA')+'</span></div>'+
    '<div class="siege-action-grid">'+availableActions.map(item=>'<button type="button" class="siege-action '+
      (item.id===selectedActionId?'selected':'')+'" data-siege-preview="'+item.id+'" '+
      (!canPreview?'disabled':'')+'><span class="siege-action-icon">'+item.icon+'</span>'+
      '<strong>'+item.label+'</strong><small>'+ESCAPE(item.effect)+'</small></button>').join('')+'</div>'+
    (rulesVersion>=4?'<div class="siege-selected section"><strong>🎯 Escolha o objetivo desta ação</strong>'+
      '<p>Cada jogador escolhe sua própria frente. Coordene antes de confirmar: as ações só aparecem para o rival depois da rodada.</p>'+
      '<div class="siege-action-grid">'+permittedTargets.map(front=>'<button type="button" class="siege-action '+
        (front.id===selectedTarget&&selectedActionId?'selected':'')+'" data-siege-target="'+front.id+'" aria-pressed="'+
        (front.id===selectedTarget?'true':'false')+'" '+(!canPreview||!selectedActionId?'disabled':'')+'>'+
        '<span class="siege-action-icon">'+front.icon+'</span><strong>'+front.label+
        '</strong><small>'+ESCAPE(front.tip)+'</small></button>').join('')+'</div>'+
      '<p>Objetivo escolhido: <b>'+ESCAPE(FRONTS_V4.find(f=>f.id===selectedTarget)?.label||'Castelo')+'</b></p></div>':'')+
    (rulesVersion>=4?siegeActionRisk(match,selectedActionId,selectedTarget,remainingRepairs):'')+
    '<div class="siege-selected"><span>ESTRATÉGIA '+(active?'DA RODADA':'PRÉVIA — NÃO ENVIADA')+'</span><strong>'+
      ESCAPE(availableActions.find(a=>a.id===selectedActionId)?.label||'Nenhuma ação selecionada')+'</strong>'+
      '<p>'+(active?'As escolhas rivais ficam secretas. Só a confirmação registra sua ação nesta rodada.':
        'Explore Atacar, Defender, Reparar, Espionar ou Reabastecer. A prévia não seleciona Defesa automaticamente e não envia ações antes das 20h.')+'</p>'+
      (canConfirm?'<button class="btn good" data-siege-command="move">🔒 Confirmar ação secreta</button>':
        '<small>'+(match?.myMove?'✅ Ação registrada nesta rodada; não pode ser alterada.':
          canMove?'Selecione uma das cinco ações e uma frente acima para habilitar a confirmação.':
          active?'Você não pode enviar ação nesta rodada.':
          'Prévia sem registro. A confirmação só estará disponível durante a guerra às 20h.')+'</small>')+'</div></div>'+
    (rulesVersion>=4?objectivesGuide(active?match:{rulesVersion:5}):renderTacticsGuide(rulesVersion,Number(match?.round||0),remainingRepairs))+
    (latest.length?'<div class="siege-selected section"><strong>📜 '+(previous?'ÚLTIMA GUERRA — REGRA V'+Number(match.rulesVersion||1)+' (HISTÓRICO)':'Histórico das rodadas')+'</strong>'+
      latest.map(x=>'<p>Rodada '+Number(x.round)+': 🔵 '+Number(x.blueHp)+
        ' HP • 🔴 '+Number(x.redHp)+' HP'+
        (Number(x.rulesVersion)>=2?' • Dano 🔵 '+Number(x.blueDamage)+' / 🔴 '+Number(x.redDamage)+
          ' • 🤝 '+ESCAPE(x.blueTactic)+' / '+ESCAPE(x.redTactic):'')+
        (Number(x.rulesVersion)>=4?' • 💚 HP realmente recuperado: 🔵 +'+Number(x.blueHeal||0)+' / 🔴 +'+Number(x.redHeal||0):'')+
        (Number(x.rulesVersion)>=5&&((x.blueRepairWithoutEffect||[]).length||(x.redRepairWithoutEffect||[]).length)?
          ' • ⚠️ Reparos sem efeito: 🔵 '+ESCAPE((x.blueRepairWithoutEffect||[]).join(', ')||'nenhum')+
          ' / 🔴 '+ESCAPE((x.redRepairWithoutEffect||[]).join(', ')||'nenhum'):'')+'</p>').join('')+'</div>':'')+
    '<div class="siege-footer">Ações de guerra não gastam dinheiro, XP ou HP do herói. Obras são financiadas somente pelo tesouro virtual do clã.</div></section>';
}

export function renderClanSiegePreview(ui){
  if(ui.siege?.enabled===true)return renderLiveSiege(ui);
  const extras=ui.extras||{};
  const clans=Array.isArray(extras.clans)?extras.clans:[];
  const eligible=clans.filter(clan=>Number(clan?.members)===2);
  const myClan=extras.clan||null;
  const mine=eligible.find(clan=>
    (myClan?.id!=null&&clan.id!=null&&String(myClan.id)===String(clan.id)) ||
    (myClan?.name&&clan.name&&myClan.name===clan.name)
  )||myClan;
  const enemy=eligible.find(clan=>
    !(mine?.id!=null&&clan.id!=null&&String(mine.id)===String(clan.id)) &&
    !(mine?.name&&clan.name&&mine.name===clan.name)
  )||null;
  const pairReady=eligible.length===2&&eligible.some(clan=>clan.id!=null&&mine?.id!=null?String(clan.id)===String(mine.id):Boolean(clan.name&&mine?.name&&clan.name===mine.name))&&Boolean(enemy);
  const selected=String(ui.siegePreviewAction||'');
  const action=ACTIONS.find(item=>item.id===selected)||null;
  const status=pairReady
    ? 'Os dados atuais indicam dois clãs com dois jogadores. A escalação individual ainda precisa ser conferida.'
    : 'Aguardando a confirmação dos dois clãs com dois membros no servidor. Sem escalação fictícia.';
  return '<section class="siege-preview section" aria-label="Prévia do Cerco ao Castelo">'+
    '<div class="siege-head">'+
      '<div><p class="siege-eyebrow">ALPHA BOT · GUERRA DE CLÃS</p><h3>🏰 Cerco ao Castelo</h3><p>Uma guerra 2 × 2 com decisões secretas pelo Web e resultados narrados no grupo.</p></div>'+
      '<span class="siege-status">🧪 PRÉVIA · NÃO INICIADO</span>'+
    '</div>'+
    '<div class="siege-stage">'+renderCastle(mine,'home')+
      '<div class="siege-versus"><strong>VS</strong><small>6 rodadas</small><small>5 min cada</small></div>'+
      renderCastle(enemy,'enemy')+
    '</div>'+
    '<div class="siege-data-note">🔎 '+ESCAPE(status)+' Os HP exibidos são valores iniciais propostos, não dados de uma batalha ativa.</div>'+
    '<div class="siege-planning">'+
      '<div class="siege-planning-head"><div><p class="siege-eyebrow">CENTRAL DE COMANDO</p><h4>Escolha sua estratégia</h4></div><span class="siege-status">MODO DE TESTE VISUAL</span></div>'+
      '<div class="siege-action-grid">'+ACTIONS.map(item=>
        '<button type="button" class="siege-action '+(item.id===selected?'selected':'')+'" data-siege-preview="'+item.id+'" aria-pressed="'+(item.id===selected?'true':'false')+'">'+
          '<span class="siege-action-icon">'+item.icon+'</span><strong>'+item.label+'</strong><small>'+ESCAPE(item.effect)+'</small></button>'
      ).join('')+'</div>'+
      '<div class="siege-selected" aria-live="polite"><span>Estratégia em prévia</span><strong>'+(action?action.icon+' '+action.label:'Nenhuma ação selecionada')+'</strong><p>'+ESCAPE(action?.effect||'Selecione uma das quatro estratégias para conhecer seu efeito.')+'</p>'+
      '<small>Esta escolha é apenas visual: não foi enviada nem salva. Não há ações de guerra habilitadas no servidor.</small></div>'+
    '</div>'+
    '<div class="siege-steps"><span>1 · Selecionar em segredo</span><span>2 · Aguardar a rodada fechar</span><span>3 · Resultado público no WhatsApp</span></div>'+
    '<div class="siege-footer">🔒 O evento só será liberado depois de autenticação por jogador, ações persistidas, bloqueio de duplicidade, resolução simultânea e testes de integração. Nenhum saldo, XP, HP ou cofre real é alterado nesta prévia.</div>'+
  '</section>';
}

export function bindClanSiegePreview(ui,{render,submit,refresh}){
  document.querySelectorAll('[data-siege-preview]').forEach(button=>button.addEventListener('click',()=>{
    if(ui.siege?.match?.status==='active'&&ui.siege.match.myMove)return;
    const next=button.dataset.siegePreview;
    const variant=ui.siege?.match?.status==='active'?Number(ui.siege.match.rulesVersion||1):5;
    const catalog=variant>=4?TACTICAL_ACTIONS:variant>=2?ACTIONS:LEGACY_ACTIONS;
    if(!catalog.some(item=>item.id===next))return;
    ui.siegePreviewAction=next;
    ui.siegePreviewTarget=next==='supply'?'depot':'castle';
    render();
  }));
  document.querySelectorAll('[data-siege-target]').forEach(button=>button.addEventListener('click',()=>{
    if(ui.siege?.match?.status==='active'&&ui.siege.match.myMove)return;
    if(!ui.siegePreviewAction)return;
    const target=button.dataset.siegeTarget;
    const valid=ui.siegePreviewAction==='supply'?target==='depot':
      ui.siegePreviewAction==='repair'?['castle','gate'].includes(target):
      ['castle','gate','depot'].includes(target);
    if(!valid)return;
    ui.siegePreviewTarget=target;render();
  }));
  document.querySelectorAll('[data-siege-command]').forEach(button=>button.addEventListener('click',()=>{
    const command=button.dataset.siegeCommand;
    if(!['cancel','move'].includes(command))return;
    const pendingTarget=ui.siegePreviewAction==='supply'?'depot':ui.siegePreviewTarget||'castle';
    const version=Number(ui.siege?.match?.rulesVersion||1);
    const label=ui.siegePreviewAction==='repair'?
      '⚠️ REPARAR não garante vitória. Só será aplicado no fim da rodada se o alvo precisar de reparo e houver suprimento; consome 1 suprimento e um dos 2 usos. Pode recuperar até '+
      (version>=5?'280':'220')+' HP ou 1 ponto de Portão.':ui.siegePreviewAction==='spy'&&Number(ui.siege?.match?.round)>=6?
      '⚠️ Espionar na última rodada só ajuda se o parceiro atacar a MESMA frente agora; não há rodada seguinte.':'';
    const message=command==='move'?(label+' Confirma '+ui.siegePreviewAction+' em '+pendingTarget+'? A escolha não poderá ser alterada.').trim():
      'Cancelar desafio antigo?';
    if(!confirm(message))return;
    const currentVersion=ui.siege?.match?Number(ui.siege.match.rulesVersion||1):4;
    // Regras antigas aceitam só 4 ações; Reabastecer é exclusivo da V4.
    if(command==='move'&&!ACTIONS.some(item=>item.id===ui.siegePreviewAction)&&
      !(currentVersion>=4&&TACTICAL_ACTIONS.some(item=>item.id===ui.siegePreviewAction)))return;
    const target=ui.siegePreviewAction==='supply'?'depot':ui.siegePreviewTarget||'castle';
    void submit(command,command==='move'?{action:ui.siegePreviewAction,target}:{});
  }));
  document.querySelectorAll('[data-siege-upgrade]').forEach(button=>button.addEventListener('click',()=>{
    const stat=button.dataset.siegeUpgrade;
    const fortress=ui.siege?.fortress;
    const offer=fortress?.offers?.[stat];
    if(!fortress?.isLeader||fortress.pending||!offer)return;
    const value=Number(offer.cost||0);
    if(!confirm('Investir R$ '+value.toLocaleString('pt-BR')+' do TESOURO do clã nesta melhoria? A obra leva '+Math.round(Number(offer.durationMs)/3600000)+'h e só valerá nas próximas guerras.'))return;
    button.disabled=true;
    void submit('fortress-upgrade',{stat});
  }));
  document.querySelectorAll('[data-siege-refresh]').forEach(button=>
    button.addEventListener('click',()=>void refresh(true)));
}
