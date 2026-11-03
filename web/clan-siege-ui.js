// Cerco ao Castelo — etapa visual. Nenhuma ação daqui executa transações no servidor.
const ESCAPE = (value) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

const ACTIONS = Object.freeze([
  {id:'attack',icon:'⚔️',label:'Atacar',effect:'180 de dano. Em dupla com outro atacante, +10% nos ataques; com Espionar, +30%.'},
  {id:'defend',icon:'🛡️',label:'Defender',effect:'Reduz 50% do dano ao castelo e devolve 80 se o rival atacar. Dois defensores bloqueiam 75%.'},
  {id:'repair',icon:'🔨',label:'Reparar',effect:'Recupera até 220 HP depois do ataque. Máximo de 2 reparos por guerra e por clã.'},
  {id:'spy',icon:'🕵️',label:'Espionar',effect:'Com um atacante, +30% agora. Na próxima rodada, +60% de ataque por espião.'}
]);
const LEGACY_ACTIONS = Object.freeze([
  {id:'attack',icon:'⚔️',label:'Atacar',effect:'180 de dano por jogador, antes da defesa rival.'},
  {id:'defend',icon:'🛡️',label:'Defender',effect:'Reduz 35% por defensor, até o máximo de 60%, sem contra-ataque.'},
  {id:'repair',icon:'🔨',label:'Reparar',effect:'Recupera até 140 HP, com dois usos por guerra.'},
  {id:'spy',icon:'🕵️',label:'Espionar',effect:'Aumenta em 20% o dano do clã na próxima rodada.'}
]);
function renderTacticsGuide(version,round,repairsLeft){
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

function siegeFirstPrizePanel(match=null,awardedId=null){
  const earned=Boolean(match?.status==='completed'&&awardedId!=null&&String(match.id)===String(awardedId));
  const taken=Boolean(awardedId);
  const message=earned?'🎉 Insígnia entregue aos dois integrantes do clã campeão. Use !reliquias para equipar.':
    taken?'Premiação histórica já conquistada em uma guerra anterior.':
    'Reserva exclusiva para os dois membros do primeiro clã que vencer. Empate não consome o prêmio.';
  return '<aside class="siege-prize"><div class="siege-prize-symbol" aria-hidden="true">👑</div>'+
    '<div><small>PRIMEIRA GUERRA DE CLÃS · EVENTO ÚNICO</small>'+
    '<h4>Insígnia dos Primeiros Conquistadores</h4>'+
    '<p>⚔️ +7% dano Boss/Raid • 🎯 +3 p.p. CRIT Boss/Raid • 🛡️ −2% dano recebido em Raid</p>'+
    '<p>'+ESCAPE(message)+'</p>'+
    '<small>Relíquia permanente, não vendável, vinculada ao vencedor e sem bônus PvP.</small></div></aside>';
}
function renderLiveSiege(ui){
  const data=ui.siege,match=data.match,clans=data.clans||[];
  const mine=clans.find(c=>String(c.id)===String(data.myClanId));
  const blue=match?clans.find(c=>String(c.id)===String(match.blueClanId)):mine;
  const red=match?clans.find(c=>String(c.id)===String(match.redClanId)):clans.find(c=>String(c.id)!==String(data.myClanId));
  const stage=match?.status||'idle';
  const active=stage==='active';
  const rulesVersion=match?Number(match.rulesVersion||1):2;
  const availableActions=rulesVersion>=2?ACTIONS:LEGACY_ACTIONS;
  const remainingRepairs=Math.max(0,2-Number(match?.[match?.mySide+'Repairs']||0));
  const canMove=active&&Boolean(match.mySide)&&!match.myMove;
  const selected=availableActions.find(x=>x.id===ui.siegePreviewAction)||null;
  const selectedActionId=match?.myMove||selected?.id||null;
  // Antes das 20h: seleção apenas visual, sem transação.
  // Na rodada ativa: precisa confirmar uma escolha; jamais usar Defender como padrão oculto.
  const canPreview=!match?.myMove&&(!active||canMove);
  const canConfirm=canMove&&Boolean(selected);
  const duration=active?Math.max(0,Math.ceil((Number(match.roundEndsAt)-Date.now())/1000)):0;
  const countdown=active?' • '+Math.floor(duration/60)+'m '+String(duration%60).padStart(2,'0')+'s':'';
  const label=active?'⚔️ GUERRA ATIVA':stage==='pending'?'⏳ DESAFIO ANTIGO PENDENTE':stage==='completed'?'🏆 CONCLUÍDA':'⏰ CERCO ÀS 20H';
  // A guerra começa às 20h, sem convite ou aceite manual.
  let controls='';
  if(stage==='pending'&&match.createdByMe)controls='<button class="btn danger" data-siege-command="cancel">Cancelar desafio antigo</button>';
  const notice=stage==='pending'?'Desafio anterior: expira em 30 minutos sem aceite. A guerra diária começa às 20h. Você já pode testar as quatro estratégias, sem enviar ações.':
    stage==='completed'?'Último resultado disponível por até 24h. Próxima guerra às 20h. As estratégias abaixo são apenas uma prévia.':
    active?'Ações são secretas. Escolha uma estratégia e CONFIRME por rodada. Sem confirmação, nenhuma ação será executada.':
    'A guerra começa diariamente às 20h de Brasília. Você pode explorar as quatro estratégias agora, mas só enviar ações durante a partida.';
  const pct=hp=>Math.min(100,Math.max(0,Number(hp||0)/20)).toFixed(1);
  function fortress(c,side){
    const hp=Number(match?.[side+'Hp']??2000);
    return '<article class="siege-castle siege-'+(side==='blue'?'home':'enemy')+'">'+
      '<span class="siege-castle-kicker">'+(side==='blue'?'🔵 CASTELO AZUL':'🔴 CASTELO VERMELHO')+'</span>'+
      '<div class="siege-castle-art" aria-hidden="true">🏰</div><h4>'+ESCAPE(c?.name||'Clã a confirmar')+'</h4>'+
      '<p>'+Number(c?.members||0)+' membros • '+Number(c?.linked||0)+'/2 Web vinculados</p>'+
      '<div class="siege-castle-hp"><span>HP</span><strong>'+hp+' / 2.000</strong></div>'+
      '<div class="siege-hp-track"><span style="width:'+pct(hp)+'%"></span></div></article>';
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
    '<div class="siege-planning"><div class="siege-planning-head"><h4>'+(
      match?.myMove?'✅ Ação confirmada':'Escolha sua estratégia')+'</h4>'+
      '<span class="siege-status">'+(active?'RODADA '+Number(match.round)+'/6':'AGUARDANDO GUERRA')+'</span></div>'+
    '<div class="siege-action-grid">'+availableActions.map(item=>'<button type="button" class="siege-action '+
      (item.id===selectedActionId?'selected':'')+'" data-siege-preview="'+item.id+'" '+
      (!canPreview?'disabled':'')+'><span class="siege-action-icon">'+item.icon+'</span>'+
      '<strong>'+item.label+'</strong><small>'+ESCAPE(item.effect)+'</small></button>').join('')+'</div>'+
    '<div class="siege-selected"><span>ESTRATÉGIA '+(active?'DA RODADA':'PRÉVIA — NÃO ENVIADA')+'</span><strong>'+
      ESCAPE(availableActions.find(a=>a.id===selectedActionId)?.label||'Nenhuma ação selecionada')+'</strong>'+
      '<p>'+(active?'As escolhas rivais ficam secretas. Só a confirmação registra sua ação nesta rodada.':
        'Explore Atacar, Defender, Reparar ou Espionar. A escolha agora é apenas visual; nada será enviado antes das 20h.')+'</p>'+
      (canConfirm?'<button class="btn good" data-siege-command="move">🔒 Confirmar ação secreta</button>':
        '<small>'+(match?.myMove?'✅ Ação registrada nesta rodada; não pode ser alterada.':
          canMove?'Selecione uma das quatro estratégias acima para habilitar a confirmação.':
          active?'Você não pode enviar ação nesta rodada.':
          'Prévia sem registro. A confirmação só estará disponível durante a guerra às 20h.')+'</small>')+'</div></div>'+
    renderTacticsGuide(rulesVersion,Number(match?.round||0),remainingRepairs)+
    (latest.length?'<div class="siege-selected section"><strong>📜 Histórico</strong>'+
      latest.map(x=>'<p>Rodada '+Number(x.round)+': 🔵 '+Number(x.blueHp)+
        ' HP • 🔴 '+Number(x.redHp)+' HP'+
        (Number(x.rulesVersion)>=2?' • Dano 🔵 '+Number(x.blueDamage)+' / 🔴 '+Number(x.redDamage)+
          ' • 🤝 '+ESCAPE(x.blueTactic)+' / '+ESCAPE(x.redTactic):'')+'</p>').join('')+'</div>':'')+
    siegeFirstPrizePanel(match,data.firstWarPrizeMatchId)+
    '<div class="siege-footer">Ações exclusivas por jogador e rodada. O jogo não utiliza dinheiro, XP ou HP real nesta versão.</div></section>';
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
    siegeFirstPrizePanel()+
    '<div class="siege-footer">🔒 O evento só será liberado depois de autenticação por jogador, ações persistidas, bloqueio de duplicidade, resolução simultânea e testes de integração. Nenhum saldo, XP, HP ou cofre real é alterado nesta prévia.</div>'+
  '</section>';
}

export function bindClanSiegePreview(ui,{render,submit,refresh}){
  document.querySelectorAll('[data-siege-preview]').forEach(button=>button.addEventListener('click',()=>{
    if(ui.siege?.match?.myMove)return;
    const next=button.dataset.siegePreview;
    if(!ACTIONS.some(item=>item.id===next))return;
    ui.siegePreviewAction=next;
    render();
  }));
  document.querySelectorAll('[data-siege-command]').forEach(button=>button.addEventListener('click',()=>{
    const command=button.dataset.siegeCommand;
    if(!['cancel','move'].includes(command))return;
    const message=command==='move'?'Confirmar ação? Ela não poderá ser alterada.':'Cancelar desafio antigo?';
    if(!confirm(message))return;
    if(command==='move'&&!ACTIONS.some(item=>item.id===ui.siegePreviewAction))return;
    void submit(command,command==='move'?{action:ui.siegePreviewAction}:{});
  }));
  document.querySelectorAll('[data-siege-refresh]').forEach(button=>
    button.addEventListener('click',()=>void refresh(true)));
}
