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

export function renderClanSiegePreview(ui){
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
  const selected=String(ui.siegePreviewAction||'defend');
  const action=ACTIONS.find(item=>item.id===selected)||ACTIONS[1];
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
      '<div class="siege-selected" aria-live="polite"><span>Estratégia em prévia</span><strong>'+action.icon+' '+action.label+'</strong><p>'+ESCAPE(action.effect)+'</p>'+
      '<small>Esta escolha é apenas visual: não foi enviada nem salva. Não há ações de guerra habilitadas no servidor.</small></div>'+
    '</div>'+
    '<div class="siege-steps"><span>1 · Selecionar em segredo</span><span>2 · Aguardar a rodada fechar</span><span>3 · Resultado público no WhatsApp</span></div>'+
    '<div class="siege-footer">🔒 O evento só será liberado depois de autenticação por jogador, ações persistidas, bloqueio de duplicidade, resolução simultânea e testes de integração. Nenhum saldo, XP, HP ou cofre real é alterado nesta prévia.</div>'+
  '</section>';
}

export function bindClanSiegePreview(ui,render){
  document.querySelectorAll('[data-siege-preview]').forEach(button=>{
    button.addEventListener('click',()=>{
      const next=button.dataset.siegePreview;
      if(!ACTIONS.some(item=>item.id===next))return;
      ui.siegePreviewAction=next;
      render();
    });
  });
}
