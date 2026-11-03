// Cerco ao Castelo — etapa visual. Nenhuma ação daqui executa transações no servidor.
const ESCAPE = (value) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

const ACTIONS = Object.freeze([
  {id:'attack',icon:'⚔️',label:'Atacar',effect:'Pressiona as muralhas rivais. Melhor quando o outro clã não está defendendo.'},
  {id:'defend',icon:'🛡️',label:'Defender',effect:'Reduz o dano sofrido pelo castelo na rodada.'},
  {id:'repair',icon:'🔨',label:'Reparar',effect:'Recupera HP da fortaleza, respeitando um limite por guerra.'},
  {id:'spy',icon:'🕵️',label:'Espionar',effect:'Prepara vantagem estratégica para a próxima rodada, sem revelar a ação adversária antes do fechamento.'}
]);

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
  const canMove=active&&Boolean(match.mySide)&&!match.myMove;
  const selected=ACTIONS.find(x=>x.id===ui.siegePreviewAction)||null;
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
    '<div class="siege-action-grid">'+ACTIONS.map(item=>'<button type="button" class="siege-action '+
      (item.id===selectedActionId?'selected':'')+'" data-siege-preview="'+item.id+'" '+
      (!canPreview?'disabled':'')+'><span class="siege-action-icon">'+item.icon+'</span>'+
      '<strong>'+item.label+'</strong><small>'+ESCAPE(item.effect)+'</small></button>').join('')+'</div>'+
    '<div class="siege-selected"><span>ESTRATÉGIA '+(active?'DA RODADA':'PRÉVIA — NÃO ENVIADA')+'</span><strong>'+
      ESCAPE(ACTIONS.find(a=>a.id===selectedActionId)?.label||'Nenhuma ação selecionada')+'</strong>'+
      '<p>'+(active?'As escolhas rivais ficam secretas. Só a confirmação registra sua ação nesta rodada.':
        'Explore Atacar, Defender, Reparar ou Espionar. A escolha agora é apenas visual; nada será enviado antes das 20h.')+'</p>'+
      (canConfirm?'<button class="btn good" data-siege-command="move">🔒 Confirmar ação secreta</button>':
        '<small>'+(match?.myMove?'✅ Ação registrada nesta rodada; não pode ser alterada.':
          canMove?'Selecione uma das quatro estratégias acima para habilitar a confirmação.':
          active?'Você não pode enviar ação nesta rodada.':
          'Prévia sem registro. A confirmação só estará disponível durante a guerra às 20h.')+'</small>')+'</div></div>'+
    (latest.length?'<div class="siege-selected section"><strong>📜 Histórico</strong>'+
      latest.map(x=>'<p>Rodada '+Number(x.round)+': 🔵 '+Number(x.blueHp)+
        ' HP • 🔴 '+Number(x.redHp)+' HP</p>').join('')+'</div>':'')+
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
