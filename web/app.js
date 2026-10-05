const API_BASE = window.location.origin;
const TOKEN_KEY = 'alphaWebTokenV1';

const ui = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  catalog: null,
  data: null,
  extras: null,
  extrasFetchedAt: 0,
  lastResult: null,
  page: 'home',
  petTab: 'owned',
  raidTimer: null,
  raidLevel: null,
  bossTimer: null,
  syncing: false
};

const navItems = [
  ['home','⌂','Início'],
  ['pets','🐾','Pets'],
  ['inventory','🎒','Inventário'],
  ['shop','🏪','Loja'],
  ['raids','⚔️','Raids'],
  ['boss','👹','Boss'],
  ['social','🥊','Social'],
  ['market','📣','Mercado'],
  ['clan','🛡️','Clã'],
  ['games','🎮','Minigames'],
  ['activities','⏳','Atividades'],
  ['rankings','🏆','Rankings'],
  ['economy','💰','Economia'],
  ['loans','💳','Empréstimos']
];

const speciesEmoji = {
  cachorro:'🐶',gato:'🐱',coelho:'🐰',papagaio:'🦜',hamster:'🐹',tartaruga:'🐢',coruja:'🦉',
  raposa:'🦊',golfinho_celestial:'🐬',lobo:'🐺',moreia_sombria:'🐍',aguia:'🦅',gaviao:'🦅',
  panda:'🐼',tubarao_abissal:'🦈',guepardo:'🐆',tigre:'🐯',polvo_arcano:'🐙',
  gazela_mistica:'🦌',leao:'🦁',cervo_mistico:'🦌',orca_guerra:'🐋',cavalo_guerra:'🐎',
  unicornio:'🦄',baleia_colossal:'🐋',dragao:'🐉',golem_ancestral:'🪨',urso_runico:'🐻',
  colosso_cristal:'💎',salamandra_infernal:'🔥',dragao_vulcanico:'🐲',fenix_fogo:'🔥',
  corvo_abissal:'👁️',lobo_abismo:'🌑',fenix_gelo:'❄️',rinoceronte_titanico:'🦏',
  guardiao_obsidiana:'🗿',leviata_gelo:'🌊',cerbero_carmesim:'🩸',tigre_lunar:'🌙',
  imperador_abissal:'👑',leao_solar:'☀️',grifo_celestial:'✨',fenix_celestial:'🌟',
  serpente_cosmica:'🌌',dragao_corrompido:'☠️',fenix_alpha:'👑'
};

const $ = s => document.querySelector(s);
const esc = value => String(value == null ? '' : value)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const money = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Number(value||0));
const num = value => Number(value||0).toLocaleString('pt-BR');
const pct = value => Math.max(0,Math.min(100,Number(value||0)));
const rarityClass = r => 'rarity-' + String(r||'common').toLowerCase();
const titleCase = s => String(s||'').replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase());

function toast(message){
  const el=$('#toast');
  el.textContent=message;
  el.classList.add('show');
  clearTimeout(window.__alphaToast);
  window.__alphaToast=setTimeout(()=>el.classList.remove('show'),2600);
}

async function api(path, options){
  options=options||{};
  const headers=Object.assign({'content-type':'application/json'},options.headers||{});
  if(ui.token) headers.authorization='Bearer '+ui.token;
  const res=await fetch(API_BASE+path,Object.assign({},options,{headers}));
  let body={};
  try{ body=await res.json(); }catch{}
  if(!res.ok || body.ok===false) throw new Error(body.error||('HTTP '+res.status));
  return body;
}

async function exchange(code){
  const clean=String(code||'').trim().toUpperCase();
  if(!clean) throw new Error('Informe o código gerado pelo !web.');
  const body=await api('/api/v1/auth/exchange',{method:'POST',body:JSON.stringify({code:clean})});
  ui.token=body.token;
  localStorage.setItem(TOKEN_KEY,ui.token);
  return body;
}

async function sync(silent){
  if(!ui.token || ui.syncing) return;
  ui.syncing=true;
  setSync(false);
  try{
    const jobs=[];
    if(!ui.catalog) jobs.push(api('/api/v1/catalog'));
    else jobs.push(Promise.resolve(null));
    jobs.push(api('/api/v1/me/bootstrap'));
    const values=await Promise.all(jobs);
    if(values[0]) ui.catalog=values[0].data;
    ui.data=values[1].data;
    showApp();
    render();
    setSync(true);
    if(!silent) toast('Dados sincronizados com o Alpha Bot.');
  }catch(err){
    if(/sessão web inválida|expirada/i.test(err.message)){
      logout(false);
      showLogin(err.message);
    }else{
      setSync(false);
      if(!silent) toast(err.message);
    }
  }finally{ ui.syncing=false; }
}

async function syncExtras(force){
  if(!ui.token) return null;
  if(!force && ui.extras && Date.now()-ui.extrasFetchedAt<30000) return ui.extras;
  try{
    const response=await api('/api/v1/me/extras');
    ui.extras=response.data;
    ui.extrasFetchedAt=Date.now();
    return ui.extras;
  }catch(err){
    toast(err.message);
    throw err;
  }
}

async function doAction(name,body,options){
  options=options||{};
  try{
    if(!options.quiet) toast('Processando...');
    const response=await api('/api/v1/action/'+encodeURIComponent(name),{method:'POST',body:JSON.stringify(body||{})});
    ui.lastResult=response.result;
    if(options.afterSync!==false) await sync(true);
    if(['social','market','clan','games','activities','rankings','loans'].includes(ui.page)){
      await syncExtras(true).catch(()=>null);
      render();
    }
    if(!options.quiet) toast(options.success||'Ação concluída no Alpha Bot.');
    return response.result;
  }catch(err){
    if(!options.quiet) toast(err.message);
    throw err;
  }
}

function setSync(ok){
  const el=$('#syncBadge');
  if(!el) return;
  el.textContent=ok?'● WPP / NEON SINCRONIZADO':'● SINCRONIZANDO';
  el.classList.toggle('ok',!!ok);
}

function showApp(){
  $('#loginOverlay').classList.add('hidden');
  $('#app').classList.remove('hidden');
}
function showLogin(error){
  $('#app').classList.add('hidden');
  $('#loginOverlay').classList.remove('hidden');
  $('#linkError').textContent=error||'';
}
async function logout(remote){
  stopRaidAuto();
  stopBossAuto();
  if(remote!==false && ui.token){
    try{ await api('/api/v1/auth/logout',{method:'POST',body:'{}'}); }catch{}
  }
  ui.token=''; ui.data=null; ui.catalog=null; ui.extras=null; ui.extrasFetchedAt=0;
  localStorage.removeItem(TOKEN_KEY);
  showLogin();
}

function renderNav(){
  $('#nav').innerHTML=navItems.map(item=>{
    return '<button class="nav-btn '+(ui.page===item[0]?'active':'')+'" data-page="'+item[0]+'"><span>'+item[1]+'</span>'+item[2]+'</button>';
  }).join('');
  document.querySelectorAll('[data-page]').forEach(btn=>btn.onclick=async()=>{
    ui.page=btn.dataset.page;
    $('#sidebar').classList.remove('open');
    if(['social','market','clan','games','activities','rankings','loans'].includes(ui.page)){
      await syncExtras(false).catch(()=>null);
    }
    render();
  });
}

function profile(){
  return (ui.data&&ui.data.combatProfile) || (ui.data&&ui.data.profile) || {};
}
function currentGroup(){
  return ui.data&&ui.data.group;
}
function collection(){
  return (ui.data&&ui.data.pets)||[];
}
function catalogPets(){
  return (ui.catalog&&ui.catalog.pets)||[];
}
function itemCount(id){
  const row=((ui.data&&ui.data.inventory)||[]).find(x=>x.item_id===id);
  return Number(row&&row.quantity||0);
}

function renderHeader(){
  const p=profile();
  const raw=(ui.data&&ui.data.profile)||p;
  $('#miniProfile').innerHTML='<strong>'+esc(raw.push_name||'Jogador')+'</strong><small>Nível '+num(raw.level)+' • '+(ui.data&&ui.data.identity&&ui.data.identity.groupLinked?'grupo vinculado':'sem grupo vinculado')+'</small>';
  $('#topStats').innerHTML=[
    '<span class="top-pill">❤️ '+num(p.effective_hp||p.hp)+'/'+num(p.effective_max_hp||p.max_hp)+'</span>',
    '<span class="top-pill">💵 '+money(raw.cash)+'</span>',
    '<span class="top-pill">🏦 '+money(raw.bank)+'</span>'
  ].join('');
  const title=(navItems.find(x=>x[0]===ui.page)||['','','Alpha RPG'])[2];
  $('#pageTitle').textContent=title;
}

function statCard(label,value,sub){
  return '<div class="card stat-card"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span>'+esc(sub||'')+'</span></div>';
}

function renderHome(){
  const p=profile(), raw=ui.data.profile||p;
  const hpMax=Number(p.effective_max_hp||p.max_hp||1), hp=Number(p.effective_hp||p.hp||0);
  const group=currentGroup();
  const activities=(ui.data&&ui.data.activities)||{};
  const missions=(ui.data&&ui.data.dailyMissions)||[];
  return '<div class="hero card">'+
    '<div><p class="eyebrow">CONTA REAL DO WHATSAPP</p><h2>'+esc(raw.push_name||'Jogador')+'</h2>'+
    '<p class="muted">Dados carregados diretamente do mesmo Neon usado pelo Alpha Bot.</p>'+
    '<div class="progress"><span style="width:'+pct(hp/hpMax*100)+'%"></span></div>'+
    '<div class="hero-actions"><button class="btn primary" data-action="daily">🎁 Daily</button><button class="btn" data-action="work">💼 Trabalhar</button><button class="btn" data-resync>↻ Sincronizar</button></div></div>'+
    '<div class="hero-side"><div><small>CARTEIRA</small><strong>'+money(raw.cash)+'</strong></div><div><small>BANCO</small><strong>'+money(raw.bank)+'</strong></div><div><small>ARMA</small><strong>'+esc(p.weapon_name||'Nenhuma')+' Lv.'+num(p.weapon_level||1)+'</strong></div><div><small>ARMADURA</small><strong>'+esc(p.armor_name||'Nenhuma')+' Lv.'+num(p.armor_level||1)+'</strong></div></div>'+
  '</div>'+
  '<div class="grid stats">'+
    statCard('NÍVEL',num(raw.level),'EXP '+num(raw.exp))+
    statCard('ATK',num(p.effective_atk||p.atk),'Base '+num(p.base_atk||p.atk))+
    statCard('DEF',num(p.effective_def||p.def),'Base '+num(p.base_def||p.def))+
    statCard('CRÍTICO',Math.round(Number(p.effective_crit||0)*100)+'%','VEL '+num(p.effective_spd||p.spd))+
  '</div>'+
  '<div class="section grid two">'+
    '<div class="card"><div class="section-title"><h3>Missões diárias</h3><small>'+missions.length+' missões</small></div>'+renderMissionList(missions)+'</div>'+
    '<div class="card"><div class="section-title"><h3>Estado compartilhado</h3><small>Neon</small></div>'+
      '<div class="list">'+
        '<div class="list-row"><span>Grupo</span><small>'+(group?'Vinculado':'Use !web no grupo')+'</small></div>'+
        '<div class="list-row"><span>Pets na coleção</span><strong>'+collection().length+'</strong></div>'+
        '<div class="list-row"><span>Itens diferentes</span><strong>'+((ui.data.inventory||[]).length)+'</strong></div>'+
        '<div class="list-row"><span>Dormindo</span><strong>'+(activities.sleep?'SIM':'NÃO')+'</strong></div>'+
        '<div class="list-row"><span>Carpinando</span><strong>'+(activities.carpinar?'SIM':'NÃO')+'</strong></div>'+
      '</div>'+
    '</div>'+
  '</div>';
}

function renderMissionList(missions){
  if(!missions.length) return '<div class="empty">Nenhuma missão diária carregada.</div>';
  return '<div class="list">'+missions.map(m=>{
    const done=Number(m.progress||0)>=Number(m.target||1);
    return '<div class="list-row"><div><strong>'+esc(m.title)+'</strong><small>'+num(m.progress)+'/'+num(m.target)+'</small></div><span class="tag '+(done?'good':'')+'">'+(m.claimed?'RESGATADA':done?'PRONTA':'ATIVA')+'</span></div>';
  }).join('')+'</div>';
}

function specialtyText(p){
  const s=p&&p.specialty;
  if(!s) return '';
  const stats=s.stats || (s.stat?{[s.stat]:s.base}:{});
  const labels={damage:'dano',bossDamage:'Boss',defense:'defesa',crit:'crítico',dodge:'esquiva',speed:'VEL',xp:'XP',drop:'drop'};
  const parts=Object.entries(stats).filter(x=>Number(x[1])>0).map(x=>{
    return '+'+x[1]+(x[0]==='speed'?' ':'% ')+(labels[x[0]]||x[0]);
  });
  if(Number(s.healPct||0)>0) parts.push('cura '+s.healPct+'% / '+s.healCooldown+' rodadas');
  return parts.join(' • ');
}

function petPortrait(species){
  return '<div class="pet-portrait">'+(speciesEmoji[species]||'🐾')+'</div>';
}
function ownedPetCard(p){
  const cat=catalogPets().find(x=>x.species===p.species);
  return '<div class="card pet-card owned">'+petPortrait(p.species)+
    '<div class="tag-row"><span class="tag good">'+(p.active?'ATIVO':'COLEÇÃO')+'</span><span class="tag">'+esc(cat&&cat.style||'Pet')+'</span></div>'+
    '<h3>'+esc(p.name||cat&&cat.label||titleCase(p.species))+'</h3>'+
    '<p>'+esc(titleCase(p.species))+' • Lv.'+num(p.level)+' • HP '+num(p.hp)+'/'+num(p.max_hp)+' • Energia '+num(p.energy)+'</p>'+
    '<p>'+esc(specialtyText(cat))+'</p>'+
    '<div class="pet-actions">'+(!p.active?'<button class="btn good" data-pet-select="'+p.id+'">Usar pet</button>':'')+'<button class="btn" data-pet-id="'+p.id+'">ID '+p.id+'</button></div>'+
  '</div>';
}
function catalogPetCard(p){
  const owned=collection().some(x=>x.species===p.species);
  const level=Number(profile().level||ui.data.profile&&ui.data.profile.level||1);
  const special=p.source==='raid';
  const cost=special?Number(p.summonCost||100):Number(p.price||0);
  const materialQty=special?itemCount(p.materialId):0;
  const can= special ? materialQty>=cost : level>=Number(p.level||1);
  return '<div class="card catalog-card">'+petPortrait(p.species)+
    '<div class="tag-row"><span class="tag '+(special?'legendary':'')+'">'+(special?'RAID / INVOCAÇÃO':'ADOTÁVEL')+'</span><span class="tag">'+esc(p.style||'')+'</span>'+(owned?'<span class="tag good">NA COLEÇÃO</span>':'')+'</div>'+
    '<h3>'+esc(p.label||p.name||titleCase(p.species))+'</h3>'+
    '<p>'+esc(specialtyText(p))+'</p>'+
    (special?'<p>Raid Lv.'+num(p.raidLevel)+' • Chance '+num(p.chance)+'% • '+esc(p.materialName)+' '+materialQty+'/'+cost+'</p>':'<p>Nível mínimo '+num(p.level)+' • '+money(p.price)+'</p>')+
    '<div class="pet-actions">'+(special?'<button class="btn '+(can?'primary':'')+'" '+(can?'':'disabled')+' data-pet-summon="'+esc(p.materialId)+'">Invocar</button>':'<button class="btn '+(can?'primary':'')+'" '+(can?'':'disabled')+' data-pet-adopt="'+esc(p.species)+'">Adotar</button>')+'</div>'+
  '</div>';
}

function renderPets(){
  const tabs=[['owned','Minha coleção ('+collection().length+')'],['adopt','26 adotáveis'],['raid','21 Raid / especiais']];
  let rows=[];
  if(ui.petTab==='owned') rows=collection().map(ownedPetCard);
  else if(ui.petTab==='adopt') rows=catalogPets().filter(x=>x.source==='adoption').map(catalogPetCard);
  else rows=catalogPets().filter(x=>x.source==='raid').map(catalogPetCard);
  return '<div class="page-head"><div><h2>Pets sincronizados</h2><p>O catálogo e sua coleção vêm do mesmo backend do WhatsApp.</p></div><span class="tag good">'+catalogPets().length+' espécies/recompensas</span></div>'+
    '<div class="tabs">'+tabs.map(t=>'<button class="tab '+(ui.petTab===t[0]?'active':'')+'" data-pet-tab="'+t[0]+'">'+t[1]+'</button>').join('')+'</div>'+
    '<div class="grid cards">'+(rows.length?rows.join(''):'<div class="empty">Nenhum pet nesta seção.</div>')+'</div>';
}

function itemIcon(item){
  const map={weapon:'🗡️',armor:'🛡️',boots:'👢',consumable:'🧪',special:'💠'};
  if(String(item.item_id||item.id||'').includes('chave_raid')) return '🗝️';
  if(String(item.item_id||item.id||'').includes('caixa')) return '🎁';
  return map[item.category]||'📦';
}
function inventoryCard(i){
  const id=i.item_id;
  const eq=['weapon','armor','boots'].includes(i.category);
  const petPotion=id.startsWith('pocao_pet_');
  const energy=id==='energetico_pet';
  const usable=i.category==='consumable' && !String(id).includes('caixa');
  let actions='';
  if(eq) actions='<button class="btn primary" data-item-equip="'+esc(id)+'">Equipar</button><button class="btn" data-item-upgrade="'+esc(id)+'">Upar</button>';
  else if(petPotion) actions='<button class="btn good" data-pet-heal="'+esc(id)+'">Curar pet</button>';
  else if(energy) actions='<button class="btn good" data-pet-energy>Energia pet</button>';
  else if(usable) actions='<button class="btn good" data-item-use="'+esc(id)+'">Usar</button>';
  if(i.sellable!==false && String(i.rarity)!=='legendary') actions+='<button class="btn" data-item-sell="'+esc(id)+'">Vender 1</button>';
  return '<div class="card item-card '+rarityClass(i.rarity)+'"><div class="item-icon">'+itemIcon(i)+'</div>'+
    '<div class="tag-row"><span class="tag '+esc(i.rarity)+'">'+esc(i.rarity||'common')+'</span><span class="tag">'+esc(i.category)+'</span></div>'+
    '<h3>'+esc(i.name)+'</h3><p>x'+num(i.quantity)+(eq?' • Lv.'+num(i.equipment_level||1):'')+'</p><p>'+esc(i.description||'')+'</p>'+
    '<div class="item-actions">'+actions+'</div></div>';
}
function renderInventory(){
  const inv=ui.data.inventory||[];
  return '<div class="page-head"><div><h2>Inventário real</h2><p>Quantidade, raridade e upgrade são lidos do Neon.</p></div><span class="tag">'+inv.length+' tipos</span></div>'+
    '<div class="grid cards">'+(inv.length?inv.map(inventoryCard).join(''):'<div class="empty">Inventário vazio.</div>')+'</div>';
}

function renderShop(){
  const items=(ui.catalog&&ui.catalog.shop)||[];
  return '<div class="page-head"><div><h2>Loja Alpha</h2><p>Comprar aqui chama a mesma função buyItem usada pelo bot.</p></div><span class="tag good">'+money(ui.data.profile&&ui.data.profile.cash)+'</span></div>'+
    '<div class="grid cards">'+items.map(i=>'<div class="card item-card '+rarityClass(i.rarity)+'"><div class="item-icon">'+itemIcon(i)+'</div><span class="tag">'+esc(i.category)+'</span><h3>'+esc(i.name)+'</h3><p>'+esc(i.description||'')+'</p><strong>'+money(i.price)+'</strong><div class="item-actions"><button class="btn primary" data-shop-buy="'+esc(i.id)+'">Comprar 1</button></div></div>').join('')+'</div>';
}

function raidState(level){
  const group=currentGroup();
  return group&&Array.isArray(group.raids)?group.raids.find(x=>Number(x.level)===Number(level)):null;
}
function renderRaids(){
  const group=currentGroup();
  if(!group) return '<div class="notice warn">Esta sessão foi vinculada no privado. Para compartilhar Raid com o WhatsApp, mande <b>!web</b> no grupo e conecte novamente.</div>';
  const raids=(ui.catalog&&ui.catalog.raids)||[];
  return '<div class="page-head"><div><h2>Raids do grupo</h2><p>As salas abaixo são as mesmas gravadas em trevo_games pelo WhatsApp.</p></div><span class="tag good">GRUPO VINCULADO</span></div>'+
    '<div class="grid cards">'+raids.map(r=>{
      const s=raidState(r.level);
      const hp=s?Number(s.hp||0):Number(r.hp||0), max=s?Number(s.maxHp||s.max_hp||r.hp):Number(r.hp||1);
      let buttons='';
      if(!s) buttons='<button class="btn primary" data-raid-create="'+r.level+'">Abrir Raid</button>';
      else if(s.status==='lobby') buttons='<button class="btn good" data-raid-start="'+r.level+'">Iniciar</button><button class="btn danger" data-raid-cancel="'+r.level+'">Cancelar</button>';
      else if(s.status==='active') buttons='<button class="btn good" data-raid-auto="'+r.level+'">'+(ui.raidLevel===r.level?'⏸ AUTO ON':'▶ AUTO')+'</button><button class="btn" data-raid-round="'+r.level+'">Rodada</button>';
      return '<div class="card raid-card"><div class="tag-row"><span class="tag">LV.'+r.level+'</span><span class="tag '+(s?'good':'')+'">'+(s?esc(s.status).toUpperCase():'DISPONÍVEL')+'</span></div><h3>'+esc(r.name)+'</h3><p>❤️ '+num(hp)+'/'+num(max)+' • ATK '+num(r.atk)+' • '+num(r.durationMinutes)+' min</p><div class="progress"><span style="width:'+pct(hp/max*100)+'%"></span></div><p>🔑 '+money(r.keyPrice)+'</p><div class="raid-actions">'+buttons+'</div></div>';
    }).join('')+'</div>';
}

function activeBoss(){
  const g=currentGroup();
  if(!g) return null;
  if(g.bossEvent && Number(g.bossEvent.hp)>0 && g.bossEvent.active!==false) return Object.assign({event:true},g.bossEvent);
  if(g.boss && Number(g.boss.hp)>0) return g.boss;
  return null;
}
function renderBoss(){
  const g=currentGroup();
  if(!g) return '<div class="notice warn">Vincule pelo <b>!web</b> dentro do grupo para usar o Boss compartilhado.</div>';
  const b=activeBoss();
  if(!b) return '<div class="page-head"><div><h2>Boss do grupo</h2><p>Nenhum Boss ativo neste momento.</p></div></div><div class="card"><button class="btn primary" data-boss-start>Iniciar Boss</button></div>';
  const hp=Number(b.hp||0), max=Number(b.maxHp||1);
  return '<div class="page-head"><div><h2>'+esc(b.name||'Boss')+'</h2><p>'+esc(b.mode||'common')+' • mesma sessão do WhatsApp</p></div><span class="tag good">ATIVO</span></div>'+
    '<div class="card"><div class="combat-box"><div class="combat-side"><div class="combat-avatar">🧙</div><strong>'+esc(ui.data.profile.push_name||'Jogador')+'</strong></div><div class="combat-side"><div class="combat-avatar">👹</div><strong>'+esc(b.name||'Boss')+'</strong></div></div>'+
    '<p>HP do Boss '+num(hp)+'/'+num(max)+'</p><div class="progress"><span style="width:'+pct(hp/max*100)+'%"></span></div>'+
    '<div class="hero-actions"><button class="btn primary" data-boss-attack>⚔️ Atacar</button><button class="btn good" data-boss-auto>'+(ui.bossTimer?'⏸ AUTO ON':'▶ AUTO OFF')+'</button></div></div>';
}


function roster(){
  return (currentGroup()&&currentGroup().roster)||[];
}
function resultPanel(){
  if(ui.lastResult==null) return '';
  let value;
  try{ value=JSON.stringify(ui.lastResult,null,2); }catch{ value=String(ui.lastResult); }
  return '<div class="section card"><div class="section-title"><h3>Último resultado</h3><button class="text-btn" data-clear-result>Limpar</button></div><pre class="result-box">'+esc(value)+'</pre></div>';
}
function memberCard(m){
  return '<div class="card social-card"><h3>'+esc(m.push_name||'Jogador')+'</h3><p>'+num(m.messages||0)+' msgs • '+num(m.commands||0)+' comandos/7d</p>'+
    '<div class="pet-actions"><button class="btn primary" data-battle="'+esc(m.jid)+'">⚔️ Duelo</button><button class="btn" data-petduel="'+esc(m.jid)+'">🐾 Duelo Pet</button><button class="btn danger" data-rob="'+esc(m.jid)+'">🥷 Roubar</button><button class="btn good" data-transfer="'+esc(m.jid)+'">💸 PIX</button><button class="btn" data-loan-offer="'+esc(m.jid)+'">💳 Emprestar</button></div></div>';
}
function renderSocial(){
  const members=roster().filter(x=>x.jid!==ui.data.identity.jid);
  const rel=ui.data.relationship;
  if(!currentGroup()) return '<div class="notice warn">Conecte usando <b>!web</b> dentro do grupo para liberar interações com outros jogadores.</div>';
  return '<div class="page-head"><div><h2>Social e PvP</h2><p>Duelo, Duelo Pet, roubo, PIX e empréstimo usam os mesmos jogadores ativos do grupo.</p></div><span class="tag">'+members.length+' jogadores recentes</span></div>'+
    '<div class="card"><div class="section-title"><h3>Relacionamento</h3><small>'+esc(rel?JSON.stringify(rel):'Nenhum')+'</small></div><div class="hero-actions"><button class="btn" data-relationship-accept>Aceitar proposta</button><button class="btn danger" data-relationship-divorce>Divorciar</button></div></div>'+
    '<div class="section grid three">'+(members.length?members.map(memberCard).join(''):'<div class="empty">Nenhum outro jogador ativo nos últimos 7 dias.</div>')+'</div>'+resultPanel();
}

function renderMarket(){
  const ex=ui.extras||{}, market=ex.market||[], mine=ui.data.market||[], inv=ui.data.inventory||[];
  return '<div class="page-head"><div><h2>Mercado</h2><p>Os anúncios são os mesmos do comando !mercado e expiram conforme a regra do bot.</p></div><button class="btn primary" data-market-create>Novo anúncio</button></div>'+
    '<div class="section-title"><h3>Anúncios ativos</h3><small>'+market.length+'</small></div>'+
    '<div class="grid cards">'+(market.length?market.map(x=>'<div class="card item-card"><div class="item-icon">📣</div><h3>'+esc(x.name)+'</h3><p>'+esc(x.seller_name||'Jogador')+' • x'+num(x.quantity)+' • expira em '+Math.ceil(Number(x.remaining_seconds||0)/60)+' min</p><strong>'+money(x.price)+'</strong><div class="item-actions">'+(x.seller_jid===ui.data.identity.jid?'<button class="btn danger" data-market-cancel="'+x.id+'">Cancelar</button>':'<button class="btn primary" data-market-buy="'+x.id+'">Comprar</button>')+'</div></div>').join(''):'<div class="empty">Nenhum anúncio ativo.</div>')+'</div>'+
    '<div class="section"><div class="section-title"><h3>Meus anúncios</h3><small>'+mine.length+'</small></div><div class="list">'+(mine.length?mine.map(x=>'<div class="list-row"><span>'+esc(x.name)+' x'+num(x.quantity)+'</span><span>'+money(x.price)+' <button class="btn danger" data-market-cancel="'+x.id+'">Cancelar</button></span></div>').join(''):'<div class="empty">Você não tem anúncios ativos.</div>')+'</div></div>'+
    '<div class="section card"><div class="section-title"><h3>Itens anunciáveis</h3><small>'+inv.filter(x=>x.sellable!==false).length+'</small></div><p class="muted">Use “Novo anúncio” e escolha o ID do item do seu inventário. A quantidade sai do inventário real.</p></div>'+resultPanel();
}

function renderClan(){
  const ex=ui.extras||{}, clan=ex.clan, clans=ex.clans||[], members=roster().filter(x=>x.jid!==ui.data.identity.jid);
  let actions=clan
    ? '<button class="btn good" data-clan-donate>Doar</button><button class="btn danger" data-clan-leave>Sair do clã</button>'
    : '<button class="btn primary" data-clan-create>Criar clã</button><button class="btn good" data-clan-accept>Aceitar convite</button>';
  return '<div class="page-head"><div><h2>Clã</h2><p>Mesma estrutura dos comandos !cla / !criarcla / !claconvidar.</p></div></div>'+
    '<div class="card"><h3>'+esc(clan&&clan.name||'Sem clã')+'</h3><pre class="result-box">'+esc(clan?JSON.stringify(clan,null,2):'Você ainda não faz parte de um clã.')+'</pre><div class="hero-actions">'+actions+'</div></div>'+
    (clan?'<div class="section"><div class="section-title"><h3>Convidar / administrar jogadores</h3></div><div class="grid three">'+members.map(m=>'<div class="card"><h3>'+esc(m.push_name)+'</h3><div class="pet-actions"><button class="btn" data-clan-invite="'+esc(m.jid)+'">Convidar</button><button class="btn danger" data-clan-kick="'+esc(m.jid)+'">Expulsar</button><button class="btn" data-clan-transfer="'+esc(m.jid)+'">Promover líder</button></div></div>').join('')+'</div></div>':'')+
    '<div class="section"><div class="section-title"><h3>Clãs existentes</h3><small>'+clans.length+'</small></div><div class="list">'+clans.map(x=>'<div class="list-row"><span>'+esc(x.name||'Clã')+'</span><small>'+esc(JSON.stringify(x))+'</small></div>').join('')+'</div></div>'+resultPanel();
}

function renderGames(){
  const games=currentGroup()&&currentGroup().games||{};
  const groupLinked=Boolean(currentGroup());
  return '<div class="page-head"><div><h2>Minigames</h2><p>Resultados e apostas passam pelo mesmo motor do WhatsApp.</p></div><span class="tag '+(groupLinked?'good':'')+'">'+(groupLinked?'GRUPO VINCULADO':'SOLO')+'</span></div>'+
    '<div class="grid three">'+
      '<div class="card"><h3>🪙 Cara ou Coroa</h3><p>Aposta individual.</p><button class="btn primary" data-game-coin>Jogar</button></div>'+
      '<div class="card"><h3>🎰 Roleta</h3><p>Aposta individual com escolha.</p><button class="btn primary" data-game-roulette>Jogar</button></div>'+
      '<div class="card"><h3>✊ Pedra Papel Tesoura</h3><p>Partida rápida.</p><button class="btn primary" data-game-rps>Jogar</button></div>'+
      '<div class="card"><h3>🏰 Dungeon</h3><p>Usa a rotina !dungeon.</p><button class="btn primary" data-game-dungeon>Entrar</button></div>'+
      '<div class="card"><h3>❓ Quiz do Grupo</h3><p>'+esc(games.quiz?JSON.stringify(games.quiz):'Nenhum quiz ativo')+'</p><div class="pet-actions"><button class="btn" data-quiz-start>Iniciar</button><button class="btn good" data-quiz-answer>Responder</button></div></div>'+
      '<div class="card"><h3>🔢 Número</h3><p>'+esc(games.number?JSON.stringify(games.number):'Nenhum jogo ativo')+'</p><div class="pet-actions"><button class="btn" data-number-start>Iniciar</button><button class="btn good" data-number-guess>Chutar</button></div></div>'+
      '<div class="card"><h3>🔤 Forca</h3><p>'+esc(games.hangman?JSON.stringify(games.hangman):'Nenhuma forca ativa')+'</p><div class="pet-actions"><button class="btn" data-hangman-start>Iniciar</button><button class="btn good" data-hangman-letter>Letra</button><button class="btn" data-hangman-word>Palavra</button></div></div>'+
      '<div class="card"><h3>🎯 Roleta em Grupo</h3><p>Crie, entre e gire a mesma sessão do grupo.</p><div class="pet-actions"><button class="btn" data-group-roulette-create>Criar</button><button class="btn" data-group-roulette-join>Entrar</button><button class="btn good" data-group-roulette-spin>Girar</button></div></div>'+
      '<div class="card"><h3>🏆 Torneio</h3><p>Crie, entre ou inicie o torneio do grupo.</p><div class="pet-actions"><button class="btn" data-tournament-create>Criar</button><button class="btn" data-tournament-join>Entrar</button><button class="btn good" data-tournament-start>Iniciar</button></div></div>'+
    '</div>'+resultPanel();
}

function renderActivities(){
  const d=ui.data, ex=ui.extras||{}, sleep=d.activities&&d.activities.sleep, carp=d.activities&&d.activities.carpinar;
  const missions=d.dailyMissions||[], exp=d.petExpeditions||[], plans=ex.carpinarPlans||[];
  return '<div class="page-head"><div><h2>Atividades</h2><p>Missões, dormir, carpinar, aventura e expedições dos pets.</p></div></div>'+
    '<div class="grid three">'+
      '<div class="card"><h3>😴 Dormir</h3><p>'+(sleep?'Ativo até '+new Date(Number(sleep.ends_at)*1000).toLocaleString('pt-BR'):'Você está acordado.')+'</p><button class="btn '+(sleep?'danger':'primary')+'" data-sleep="'+(sleep?'wake':'start')+'">'+(sleep?'Acordar':'Dormir')+'</button></div>'+
      '<div class="card"><h3>🌱 Carpinar</h3><p>'+(carp?'Ativo • termina em '+Math.ceil((Number(carp.ends_at)-Date.now()/1000)/60)+' min':'Planos: '+plans.map(x=>x.hours+'h').join(', '))+'</p><button class="btn '+(carp?'danger':'primary')+'" data-carpinar="'+(carp?'leave':'start')+'">'+(carp?'Sair':'Começar')+'</button></div>'+
      '<div class="card"><h3>🐾 Aventura Pet</h3><p>Usa o pet ativo e as regras reais.</p><button class="btn primary" data-pet-adventure>Aventura</button><button class="btn" data-pet-expedition>Expedição</button><button class="btn" data-pet-expedition-resolve>Verificar expedições</button></div>'+
    '</div>'+
    '<div class="section card"><div class="section-title"><h3>Missões diárias</h3><button class="btn good" data-missions-claim>Resgatar prontas</button></div>'+renderMissionList(missions)+'</div>'+
    '<div class="section card"><div class="section-title"><h3>Recompensas de nível</h3><button class="btn good" data-level-claim>Resgatar disponíveis</button></div><pre class="result-box">'+esc(JSON.stringify(ex.levelRewards||[],null,2))+'</pre></div>'+
    (currentGroup()?'<div class="section card"><div class="section-title"><h3>Missão do grupo</h3><button class="btn good" data-group-mission-claim>Resgatar</button></div><pre class="result-box">'+esc(JSON.stringify(ex.groupMission||{},null,2))+'</pre><button class="btn good" data-group-event-claim>Resgatar evento coletivo</button></div>':'')+
    '<div class="section card"><div class="section-title"><h3>Expedições</h3></div><pre class="result-box">'+esc(JSON.stringify(exp,null,2))+'</pre></div>'+resultPanel();
}

function leaderboardBlock(title,rows,valueFn){
  return '<div class="card"><div class="section-title"><h3>'+esc(title)+'</h3></div><div class="list">'+((rows||[]).length?(rows||[]).map((x,i)=>'<div class="list-row"><span>#'+(i+1)+' '+esc(x.push_name||x.name||'Jogador')+'</span><strong>'+esc(valueFn(x))+'</strong></div>').join(''):'<div class="empty">Sem dados.</div>')+'</div></div>';
}
function renderRankings(){
  const ex=ui.extras||{}, l=ex.leaderboards||{};
  return '<div class="page-head"><div><h2>Rankings</h2><p>Economia, RPG, pets, patrimônio e atividade do mesmo Neon.</p></div><span class="tag">Seu rank ECO #'+num(ex.ranks&&ex.ranks.economyRank)+' • RPG #'+num(ex.ranks&&ex.ranks.combatRank)+'</span></div>'+
    '<div class="grid two">'+
      leaderboardBlock('💰 Economia',l.economy,x=>money(x.total))+
      leaderboardBlock('⚔️ Combate',l.combat,x=>num(x.score)+' pts')+
      leaderboardBlock('🐾 Pets',l.pets,x=>'Lv.'+num(x.level)+' • '+num(x.power)+' poder')+
      leaderboardBlock('🏛️ Patrimônio',l.patrimony,x=>money(x.total||x.patrimony))+
      leaderboardBlock('💬 Atividade do grupo',l.activity,x=>num(x.messages)+' msgs')+
    '</div>';
}

function renderEconomy(){
  const d=ui.data, p=d.profile||{}, businesses=d.businesses||[], cars=d.cars||[], bikes=d.motorcycles||[];
  return '<div class="page-head"><div><h2>Economia</h2><p>Patrimônio e operações usam as mesmas tabelas do bot.</p></div><span class="tag good">'+money(Number(p.cash||0)+Number(p.bank||0))+'</span></div>'+
    '<div class="grid stats">'+statCard('CARTEIRA',money(p.cash),'disponível')+statCard('BANCO',money(p.bank),'saldo')+statCard('CARROS',cars.length,'garagem')+statCard('MOTOS / BIKE',bikes.length,'entregas')+'</div>'+
    '<div class="section grid two">'+
      '<div class="card"><div class="section-title"><h3>Ações rápidas</h3></div><div class="hero-actions"><button class="btn primary" data-action="work">💼 Trabalhar</button><button class="btn" data-action="uber">🚗 Uber</button><button class="btn" data-action="ifood">🛵 iFood</button><button class="btn good" data-action="business.collect">🏢 Coletar negócios</button></div></div>'+
      '<div class="card"><div class="section-title"><h3>Patrimônio</h3></div><pre class="muted" style="white-space:pre-wrap;font:inherit;font-size:10px">'+esc(JSON.stringify(d.patrimony||{},null,2))+'</pre></div>'+
    '</div>'+
    '<div class="section"><div class="section-title"><h3>Meus negócios</h3><small>'+businesses.length+'</small></div><div class="grid cards">'+(businesses.length?businesses.map(b=>'<div class="card biz-card"><h3>'+esc(b.name||b.business_id)+'</h3><p>Lv.'+num(b.level||1)+'</p><button class="btn" data-business-upgrade="'+esc(b.business_id||b.id)+'">Upar</button></div>').join(''):'<div class="empty">Você ainda não possui negócios.</div>')+'</div></div>';
}

function renderLoans(){
  const loans=ui.data.loans||{};
  const rows=[];
  if(Array.isArray(loans.active)) rows.push.apply(rows,loans.active);
  else if(loans.active) rows.push(loans.active);
  return '<div class="page-head"><div><h2>Empréstimos</h2><p>Dados vindos de player_loans.</p></div></div>'+
    '<div class="card"><pre class="muted" style="white-space:pre-wrap;font:inherit;font-size:10px">'+esc(JSON.stringify(loans,null,2))+'</pre>'+
    '<div class="hero-actions"><button class="btn good" data-loan-pay="total">Pagar empréstimo ativo</button></div></div>';
}

function render(){
  if(!ui.data || !ui.catalog) return;
  renderNav(); renderHeader();
  const renderers={home:renderHome,pets:renderPets,inventory:renderInventory,shop:renderShop,raids:renderRaids,boss:renderBoss,social:renderSocial,market:renderMarket,clan:renderClan,games:renderGames,activities:renderActivities,rankings:renderRankings,economy:renderEconomy,loans:renderLoans};
  $('#content').innerHTML=(renderers[ui.page]||renderHome)();
  bind();
}

function bind(){
  document.querySelectorAll('[data-resync]').forEach(x=>x.onclick=()=>sync(false));
  document.querySelectorAll('[data-action]').forEach(x=>x.onclick=()=>doAction(x.dataset.action,{},{}));
  document.querySelectorAll('[data-pet-tab]').forEach(x=>x.onclick=()=>{ui.petTab=x.dataset.petTab;render();});
  document.querySelectorAll('[data-pet-select]').forEach(x=>x.onclick=()=>doAction('pet.select',{petId:Number(x.dataset.petSelect)},{}));
  document.querySelectorAll('[data-pet-adopt]').forEach(x=>x.onclick=()=>{
    const name=prompt('Nome deste pet:','Alpha');
    if(name) doAction('pet.adopt',{species:x.dataset.petAdopt,name:name},{});
  });
  document.querySelectorAll('[data-pet-summon]').forEach(x=>x.onclick=()=>doAction('pet.summon',{materialId:x.dataset.petSummon},{}));
  document.querySelectorAll('[data-pet-heal]').forEach(x=>x.onclick=()=>doAction('pet.heal',{itemId:x.dataset.petHeal},{}));
  document.querySelectorAll('[data-pet-energy]').forEach(x=>x.onclick=()=>doAction('pet.energy',{},{}));
  document.querySelectorAll('[data-item-equip]').forEach(x=>x.onclick=()=>doAction('item.equip',{itemId:x.dataset.itemEquip},{}));
  document.querySelectorAll('[data-item-upgrade]').forEach(x=>x.onclick=()=>doAction('item.upgrade',{itemId:x.dataset.itemUpgrade},{}));
  document.querySelectorAll('[data-item-use]').forEach(x=>x.onclick=()=>doAction('item.use',{itemId:x.dataset.itemUse},{}));
  document.querySelectorAll('[data-item-sell]').forEach(x=>x.onclick=()=>doAction('item.sell',{itemId:x.dataset.itemSell,qty:1},{}));
  document.querySelectorAll('[data-shop-buy]').forEach(x=>x.onclick=()=>doAction('item.buy',{itemId:x.dataset.shopBuy,qty:1},{}));
  document.querySelectorAll('[data-raid-create]').forEach(x=>x.onclick=()=>doAction('raid.create',{level:Number(x.dataset.raidCreate),name:ui.data.profile.push_name},{}));
  document.querySelectorAll('[data-raid-start]').forEach(x=>x.onclick=async()=>{
    const level=Number(x.dataset.raidStart);
    await doAction('raid.start',{level:level},{});
    startRaidAuto(level);
  });
  document.querySelectorAll('[data-raid-cancel]').forEach(x=>x.onclick=()=>doAction('raid.cancel',{level:Number(x.dataset.raidCancel)},{}));
  document.querySelectorAll('[data-raid-round]').forEach(x=>x.onclick=()=>doAction('raid.round',{level:Number(x.dataset.raidRound)},{}));
  document.querySelectorAll('[data-raid-auto]').forEach(x=>x.onclick=()=>toggleRaidAuto(Number(x.dataset.raidAuto)));
  document.querySelectorAll('[data-boss-start]').forEach(x=>x.onclick=()=>doAction('boss.start',{},{}));
  document.querySelectorAll('[data-boss-attack]').forEach(x=>x.onclick=()=>doAction('boss.attack',{name:ui.data.profile.push_name,usePet:true},{}));
  document.querySelectorAll('[data-boss-auto]').forEach(x=>x.onclick=toggleBossAuto);
  document.querySelectorAll('[data-business-upgrade]').forEach(x=>x.onclick=()=>doAction('business.upgrade',{id:x.dataset.businessUpgrade},{}));
  document.querySelectorAll('[data-loan-pay]').forEach(x=>x.onclick=()=>doAction('loan.pay',{amount:x.dataset.loanPay},{}));
}

function stopRaidAuto(){
  if(ui.raidTimer) clearInterval(ui.raidTimer);
  ui.raidTimer=null; ui.raidLevel=null;
}
function startRaidAuto(level){
  stopRaidAuto();
  ui.raidLevel=Number(level);
  const tick=async()=>{
    try{
      const result=await doAction('raid.round',{level:ui.raidLevel},{quiet:true,afterSync:false});
      await sync(true);
      if(result&&((result.victory)||(result.failed)||(result.reason==='inactive'))){
        stopRaidAuto(); render();
      }
    }catch{ stopRaidAuto(); render(); }
  };
  tick();
  ui.raidTimer=setInterval(tick,8000);
  render();
}
function toggleRaidAuto(level){
  if(ui.raidTimer && ui.raidLevel===level){stopRaidAuto();render();}
  else startRaidAuto(level);
}
function stopBossAuto(){
  if(ui.bossTimer) clearInterval(ui.bossTimer);
  ui.bossTimer=null;
}
function toggleBossAuto(){
  if(ui.bossTimer){stopBossAuto();render();return;}
  const tick=async()=>{
    try{
      await doAction('boss.attack',{name:ui.data.profile.push_name,usePet:true},{quiet:true,afterSync:false});
      await sync(true);
      if(!activeBoss()) stopBossAuto();
    }catch{stopBossAuto();render();}
  };
  tick();
  const b=activeBoss();
  const ms=b&&b.event?8000:10000;
  ui.bossTimer=setInterval(tick,ms);
  render();
}

$('#linkForm').addEventListener('submit',async e=>{
  e.preventDefault();
  $('#linkError').textContent='';
  try{
    await exchange($('#linkCode').value);
    history.replaceState({},document.title,'/rpg');
    await sync(false);
  }catch(err){ $('#linkError').textContent=err.message; }
});
$('#logoutBtn').onclick=()=>logout(true);
$('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');

document.addEventListener('visibilitychange',()=>{
  if(!document.hidden && ui.token) sync(true);
});

setInterval(()=>{
  if(!document.hidden && ui.token && !ui.syncing) sync(true);
},15000);

(async function boot(){
  renderNav();
  const linked=new URLSearchParams(location.search).get('link');
  if(linked){
    $('#linkCode').value=linked;
    try{
      await exchange(linked);
      history.replaceState({},document.title,'/rpg');
    }catch(err){
      showLogin(err.message);
      return;
    }
  }
  if(ui.token){
    showApp();
    await sync(true);
  }else showLogin();
})();
