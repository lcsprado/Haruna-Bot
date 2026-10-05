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
  ['progression','📈','Progressão'],
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
    if(['social','market','clan','games','activities','progression','rankings','loans'].includes(ui.page)){
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

function cooldownLabel(key){
  const raw=String(key||'').replace(/^[^:]+:/,'').replace(/[_:]+/g,' ');
  const map={battle:'Duelo',rob:'Roubar',work:'Trabalhar',uber:'Uber',ifood:'iFood',daily:'Daily',petduel:'Duelo Pet',dungeon:'Dungeon'};
  const first=raw.split(' ')[0];
  return map[first]||titleCase(raw||key);
}
function renderCooldowns(){
  const rows=(ui.data&&ui.data.cooldowns)||[];
  const nowSec=Math.floor(Date.now()/1000);
  if(!rows.length) return '<div class="empty">Nenhum cooldown ativo.</div>';
  return '<div class="list">'+rows.map(row=>{
    const expires=Number(row.expires_at||0);
    const remain=Math.max(0,expires-nowSec);
    const mins=Math.floor(remain/60), secs=remain%60;
    return '<div class="list-row"><span>'+esc(cooldownLabel(row.key))+'</span><strong>'+mins+'m '+secs+'s</strong></div>';
  }).join('')+'</div>';
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
    '<div class="hero-actions"><button class="btn primary" data-action="daily">🎁 Daily</button><button class="btn good" data-action="all">⚡ ALL</button><button class="btn" data-action="work">💼 Trabalhar</button><button class="btn" data-resync>↻ Sincronizar</button></div></div>'+
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
  '</div>'+
  '<div class="section card"><div class="section-title"><h3>Cooldowns ativos</h3><small>Mesmo estado do WhatsApp</small></div>'+renderCooldowns()+'</div>';
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
  const active=Boolean(p.active);
  return '<div class="card pet-card owned">'+petPortrait(p.species)+
    '<div class="tag-row"><span class="tag '+(active?'good':'')+'">'+(active?'ATIVO':'COLEÇÃO')+'</span><span class="tag">'+esc(cat&&cat.style||'Pet')+'</span></div>'+
    '<h3>'+esc(p.name||cat&&cat.label||titleCase(p.species))+'</h3>'+
    '<p>'+esc(titleCase(p.species))+' • Lv.'+num(p.level)+' • XP '+num(p.xp)+' • Poder '+num(p.power)+'</p>'+
    '<p>❤️ '+num(p.hp)+'/'+num(p.max_hp)+' • ⚡ Energia '+num(p.energy)+' • 🍗 '+num(p.hunger)+'/100 • 🧼 '+num(p.hygiene)+'/100</p>'+
    '<p>'+esc(specialtyText(cat))+'</p>'+
    '<div class="pet-actions">'+
      (!active?'<button class="btn good" data-pet-select="'+p.id+'">Usar pet</button>':'')+
      (active?'<button class="btn" data-pet-rename>Renomear</button><button class="btn good" data-pet-action="descansar">Descansar</button><button class="btn" data-pet-action="alimentar">Alimentar</button><button class="btn" data-pet-action="banho">Banho</button><button class="btn" data-pet-action="passear">Passear</button><button class="btn" data-pet-action="treinar">Treinar</button>':'')+
      '<button class="btn" data-pet-id="'+p.id+'">ID '+p.id+'</button>'+
    '</div>'+
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
  const team=ui.data.petTeam||[], synergy=ui.data.petTeamSynergy||null, pets=collection();
  const labels=['','Principal','Suporte','Reserva'];
  const selectedId=slot=>Number((team.find(x=>Number(x.slot)===slot)||{}).id||0);
  const optionsFor=slot=>{
    const current=selectedId(slot);
    return '<option value="">'+(slot===1?'Escolha o principal':'Vazio')+'</option>'+
      pets.map(p=>'<option value="'+p.id+'" '+(Number(p.id)===current?'selected':'')+'>'+esc(p.name)+' • '+esc(titleCase(p.species))+' • Lv.'+num(p.level)+'</option>').join('');
  };
  const synergyBox=synergy
    ? '<div class="notice good"><strong>'+esc(synergy.label)+'</strong><br>'+esc(synergy.text)+'</div>'
    : '<div class="notice">Monte 3 espécies diferentes do mesmo estilo para ativar uma sinergia de Time Pet.</div>';
  return '<div class="page-head"><div><h2>Pets sincronizados</h2><p>O catálogo, coleção e Time Pet vêm do mesmo backend do WhatsApp.</p></div><span class="tag good">'+catalogPets().length+' espécies/recompensas</span></div>'+
    '<div class="card"><div class="section-title"><div><h3>Time Pet</h3><small>1 Principal • 2 Suporte • 3 Reserva</small></div><button class="btn primary" data-pet-team-save>Salvar time</button></div>'+
      '<div class="grid three">'+[1,2,3].map(slot=>'<label class="team-slot"><span>'+labels[slot]+'</span><select data-team-slot="'+slot+'">'+optionsFor(slot)+'</select></label>').join('')+'</div>'+
      '<div class="section">'+synergyBox+'</div>'+
    '</div>'+
    '<div class="tabs section">'+tabs.map(t=>'<button class="tab '+(ui.petTab===t[0]?'active':'')+'" data-pet-tab="'+t[0]+'">'+t[1]+'</button>').join('')+'</div>'+
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
  const box=String(id).includes('caixa_') || id==='lootbox_std';
  const usable=i.category==='consumable' && !box;
  let actions='';
  if(eq) actions='<button class="btn primary" data-item-equip="'+esc(id)+'">Equipar</button><button class="btn" data-item-upgrade="'+esc(id)+'">Upar</button>';
  else if(petPotion) actions='<button class="btn good" data-pet-heal="'+esc(id)+'">Curar pet</button>';
  else if(energy) actions='<button class="btn good" data-pet-energy>Energia pet</button>';
  else if(box) actions='<button class="btn good" data-box-open="'+esc(id)+'">Abrir 1</button><button class="btn" data-box-open-all="'+esc(id)+'" data-box-qty="'+Number(i.quantity||1)+'">Abrir todas</button>';
  else if(usable) actions='<button class="btn good" data-item-use="'+esc(id)+'">Usar</button>';
  if(i.sellable!==false && String(i.rarity)!=='legendary') actions+='<button class="btn" data-item-sell="'+esc(id)+'">Vender 1</button>';
  return '<div class="card item-card '+rarityClass(i.rarity)+'"><div class="item-icon">'+itemIcon(i)+'</div>'+
    '<div class="tag-row"><span class="tag '+esc(i.rarity)+'">'+esc(i.rarity||'common')+'</span><span class="tag">'+esc(i.category)+'</span></div>'+
    '<h3>'+esc(i.name)+'</h3><p>x'+num(i.quantity)+(eq?' • Lv.'+num(i.equipment_level||1):'')+'</p><p>'+esc(i.description||'')+'</p>'+
    '<div class="item-actions">'+actions+'</div></div>';
}
function renderInventory(){
  const inv=ui.data.inventory||[];
  return '<div class="page-head"><div><h2>Inventário real</h2><p>Quantidade, raridade e upgrade são lidos do Neon.</p></div><div class="hero-actions"><button class="btn" data-sell-duplicates>💰 Vender repetidos</button><span class="tag">'+inv.length+' tipos</span></div></div>'+
    '<div class="grid cards">'+(inv.length?inv.map(inventoryCard).join(''):'<div class="empty">Inventário vazio.</div>')+'</div>'+resultPanel();
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
      const players=Object.values((s&&s.players)||{});
      const meJoined=players.some(p=>p&&p.jid===ui.data.identity.jid);
      const isHost=Boolean(s&&s.host===ui.data.identity.jid);
      if(!s) buttons='<button class="btn primary" data-raid-create="'+r.level+'">Abrir Raid</button>';
      else if(s.status==='lobby'){
        buttons=(meJoined?'':'<button class="btn primary" data-raid-join="'+r.level+'">Entrar</button>')+
          (isHost?'<button class="btn good" data-raid-start="'+r.level+'">Iniciar</button><button class="btn danger" data-raid-cancel="'+r.level+'">Cancelar</button>':'');
      }else if(s.status==='active'){
        buttons=(meJoined?'':'<button class="btn primary" data-raid-join="'+r.level+'">Entrar agora</button>')+
          '<button class="btn good" data-raid-auto="'+r.level+'">'+(ui.raidLevel===r.level?'⏸ AUTO ON':'▶ AUTO')+'</button><button class="btn" data-raid-round="'+r.level+'">Rodada</button>';
      }
      const party=players.length?'<div class="list compact">'+players.map(p=>'<div class="list-row"><span>'+esc(p.name||'Jogador')+'</span><small>'+(p.alive===false?'💀 CAÍDO':'❤️ ATIVO')+' • '+num(p.damage||0)+' dano</small></div>').join('')+'</div>':'<div class="empty">Sem participantes.</div>';
      return '<div class="card raid-card"><div class="tag-row"><span class="tag">LV.'+r.level+'</span><span class="tag '+(s?'good':'')+'">'+(s?esc(s.status).toUpperCase():'DISPONÍVEL')+'</span><span class="tag">'+players.length+'/5</span></div><h3>'+esc(r.name)+'</h3><p>❤️ '+num(hp)+'/'+num(max)+' • ATK '+num(r.atk)+' • '+num(r.durationMinutes)+' min</p><div class="progress"><span style="width:'+pct(hp/max*100)+'%"></span></div><p>🔑 '+money(r.keyPrice)+'</p>'+party+'<div class="raid-actions">'+buttons+'</div></div>';
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
    '<div class="pet-actions"><button class="btn primary" data-battle="'+esc(m.jid)+'">⚔️ Duelo</button><button class="btn" data-petduel="'+esc(m.jid)+'">🐾 Duelo Pet</button><button class="btn danger" data-rob="'+esc(m.jid)+'">🥷 Roubar</button><button class="btn good" data-transfer="'+esc(m.jid)+'">💸 PIX</button><button class="btn" data-loan-offer="'+esc(m.jid)+'">💳 Emprestar</button><button class="btn" data-relationship-propose="'+esc(m.jid)+'">💍 Casar</button><button class="btn good" data-relationship-accept-member="'+esc(m.jid)+'">✓ Aceitar pedido</button></div></div>';
}
function renderSocial(){
  const members=roster().filter(x=>x.jid!==ui.data.identity.jid);
  const rel=ui.data.relationship;
  if(!currentGroup()) return '<div class="notice warn">Conecte usando <b>!web</b> dentro do grupo para liberar interações com outros jogadores.</div>';
  return '<div class="page-head"><div><h2>Social e PvP</h2><p>Duelo, Duelo Pet, roubo, PIX e empréstimo usam os mesmos jogadores ativos do grupo.</p></div><span class="tag">'+members.length+' jogadores recentes</span></div>'+
    '<div class="card"><div class="section-title"><h3>Relacionamento</h3><small>'+esc(rel?JSON.stringify(rel):'Nenhum')+'</small></div><div class="hero-actions"><button class="btn danger" data-relationship-divorce>Divorciar</button></div></div>'+
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
      '<div class="card"><h3>🔢 Número</h3><p>'+esc(games.numero?JSON.stringify(games.numero):'Nenhum jogo ativo')+'</p><div class="pet-actions"><button class="btn" data-number-start>Iniciar</button><button class="btn good" data-number-guess>Chutar</button></div></div>'+
      '<div class="card"><h3>🔤 Forca</h3><p>'+esc(games.forca?JSON.stringify(games.forca):'Nenhuma forca ativa')+'</p><div class="pet-actions"><button class="btn" data-hangman-start>Iniciar</button><button class="btn good" data-hangman-letter>Letra</button><button class="btn" data-hangman-word>Palavra</button></div></div>'+
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

function renderProgression(){
  const d=ui.data||{}, ex=ui.extras||{}, p=profile(), raw=d.profile||{};
  const streak=d.streak||{}, career=d.career||{}, achievements=d.achievements||[], missions=d.dailyMissions||[];
  const level=Number(raw.level||1), exp=Number(raw.exp||0);
  const nextExp=Math.max(1,level*100);
  const careerXp=Number(career.career_xp||career.xp||0), shifts=Number(career.total_shifts||career.shifts||0);
  return '<div class="page-head"><div><h2>Progressão</h2><p>Equivale aos dados de !nivel, !streak, !carreira, !conquistas e !missoes.</p></div><span class="tag good">NÍVEL '+num(level)+'</span></div>'+
    '<div class="grid stats">'+
      statCard('NÍVEL',num(level),'EXP '+num(exp)+' / '+num(nextExp))+
      statCard('STREAK',num(streak.currentStreak||streak.current_streak||0)+' dias','Recorde '+num(streak.bestStreak||streak.best_streak||0))+
      statCard('CARREIRA XP',num(careerXp),num(shifts)+' turnos')+
      statCard('CONQUISTAS',num(achievements.length),'desbloqueadas')+
    '</div>'+
    '<div class="section grid two">'+
      '<div class="card"><div class="section-title"><h3>Perfil RPG</h3><small>Mesmo stats do WhatsApp</small></div><div class="list">'+
        '<div class="list-row"><span>❤️ HP</span><strong>'+num(p.effective_hp||p.hp)+' / '+num(p.effective_max_hp||p.max_hp)+'</strong></div>'+
        '<div class="list-row"><span>⚔️ ATK</span><strong>'+num(p.effective_atk||p.atk)+'</strong></div>'+
        '<div class="list-row"><span>🛡️ DEF</span><strong>'+num(p.effective_def||p.def)+'</strong></div>'+
        '<div class="list-row"><span>💨 SPD</span><strong>'+num(p.effective_spd||p.spd)+'</strong></div>'+
        '<div class="list-row"><span>⚡ CRIT</span><strong>'+Math.round(Number(p.effective_crit||0)*100)+'%</strong></div>'+
        '<div class="list-row"><span>🏆 Vitórias</span><strong>'+num(p.win||p.wins||0)+'</strong></div>'+
        '<div class="list-row"><span>💀 Derrotas</span><strong>'+num(p.loss||p.losses||0)+'</strong></div>'+
      '</div></div>'+
      '<div class="card"><div class="section-title"><h3>Equipamentos</h3><small>Níveis reais</small></div><div class="list">'+
        '<div class="list-row"><span>🗡️ Arma</span><strong>'+esc(p.weapon_name||'Nenhuma')+' Lv.'+num(p.weapon_level||1)+'</strong></div>'+
        '<div class="list-row"><span>🛡️ Armadura</span><strong>'+esc(p.armor_name||'Nenhuma')+' Lv.'+num(p.armor_level||1)+'</strong></div>'+
        '<div class="list-row"><span>👢 Botas</span><strong>'+esc(p.boot_name||'Nenhuma')+' Lv.'+num(p.boot_level||1)+'</strong></div>'+
      '</div></div>'+
    '</div>'+
    '<div class="section grid two">'+
      '<div class="card"><div class="section-title"><h3>Conquistas</h3><small>'+achievements.length+'</small></div>'+(achievements.length?'<div class="list">'+achievements.map(a=>'<div class="list-row"><span>'+esc(a)+'</span><strong>✓</strong></div>').join('')+'</div>':'<div class="empty">Nenhuma conquista desbloqueada.</div>')+'</div>'+
      '<div class="card"><div class="section-title"><h3>Missões diárias</h3><button class="btn good" data-missions-claim>Resgatar prontas</button></div>'+renderMissionList(missions)+'</div>'+
    '</div>'+
    '<div class="section grid two">'+
      '<div class="card"><div class="section-title"><h3>Recompensas de nível</h3><button class="btn good" data-level-claim>Resgatar disponíveis</button></div><pre class="result-box">'+esc(JSON.stringify(ex.levelRewards||[],null,2))+'</pre></div>'+
      '<div class="card"><div class="section-title"><h3>Cooldowns</h3><small>Servidor</small></div>'+renderCooldowns()+'</div>'+
    '</div>'+resultPanel();
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
  const catalog=ui.catalog||{}, house=d.home, clt=d.cltUber||{};
  return '<div class="page-head"><div><h2>Economia</h2><p>Patrimônio e operações usam as mesmas tabelas e rotinas do bot.</p></div><span class="tag good">'+money(Number(p.cash||0)+Number(p.bank||0))+'</span></div>'+
    '<div class="grid stats">'+statCard('CARTEIRA',money(p.cash),'disponível')+statCard('BANCO',money(p.bank),'saldo')+statCard('CARROS',cars.length,'garagem')+statCard('MOTOS / BIKE',bikes.length,'entregas')+'</div>'+
    '<div class="section grid two">'+
      '<div class="card"><div class="section-title"><h3>Ações rápidas</h3><small>Mesmas rotinas do WhatsApp</small></div><div class="hero-actions"><button class="btn good" data-action="all">⚡ ALL</button><button class="btn primary" data-action="work">💼 Trabalhar</button><button class="btn" data-action="uber">🚗 Uber</button><button class="btn" data-action="ifood">🛵 iFood</button><button class="btn good" data-action="business.collect">🏢 Coletar negócios</button><button class="btn" data-deposit>🏦 Depositar</button><button class="btn" data-withdraw>💵 Sacar</button></div></div>'+
      '<div class="card"><div class="section-title"><h3>Patrimônio</h3></div><pre class="result-box">'+esc(JSON.stringify(d.patrimony||{},null,2))+'</pre></div>'+
    '</div>'+
    '<div class="section"><div class="section-title"><h3>Casa</h3><small>'+(house?esc(house.house_id||house.id||house.name):'Sem casa')+'</small></div><div class="grid cards">'+(catalog.houses||[]).map(x=>'<div class="card catalog-card"><h3>🏠 '+esc(x.name)+'</h3><p>'+money(x.price)+'</p><button class="btn primary" data-house-buy="'+esc(x.id)+'">Comprar</button></div>').join('')+'</div></div>'+
    '<div class="section"><div class="section-title"><h3>Garagem</h3><small>'+cars.length+' veículos</small></div><div class="grid cards">'+(cars.length?cars.map(x=>'<div class="card catalog-card"><h3>🚗 '+esc(x.name||x.car_name||x.car_id)+'</h3><p>'+esc(JSON.stringify(x))+'</p><button class="btn danger" data-car-sell="'+esc(x.id||x.car_id)+'">Vender</button></div>').join(''):'<div class="empty">Garagem vazia.</div>')+'</div><div class="grid cards section">'+(catalog.cars||[]).map(x=>'<div class="card catalog-card"><h3>🚘 '+esc(x.name)+'</h3><p>'+money(x.price)+'</p><button class="btn primary" data-car-buy="'+esc(x.id)+'">Comprar</button></div>').join('')+'</div></div>'+
    '<div class="section"><div class="section-title"><h3>Motos e bicicletas</h3><small>'+bikes.length+' na garagem</small></div><div class="grid cards">'+(bikes.length?bikes.map(x=>'<div class="card catalog-card"><h3>🏍️ '+esc(x.name||x.motorcycle_name||x.motorcycle_id)+'</h3><p>'+esc(JSON.stringify(x))+'</p><button class="btn danger" data-moto-sell="'+esc(x.id||x.motorcycle_id)+'">Vender</button></div>').join(''):'<div class="empty">Nenhuma moto/bike.</div>')+'</div><div class="grid cards section">'+(catalog.motorcycles||[]).map(x=>'<div class="card catalog-card"><h3>🛵 '+esc(x.name)+'</h3><p>'+money(x.price)+'</p><button class="btn primary" data-moto-buy="'+esc(x.id)+'">Comprar</button></div>').join('')+'</div></div>'+
    '<div class="section"><div class="section-title"><h3>Meus negócios</h3><small>'+businesses.length+'</small></div><div class="grid cards">'+(businesses.length?businesses.map(b=>'<div class="card biz-card"><h3>'+esc(b.name||b.business_id)+'</h3><p>Lv.'+num(b.level||1)+'</p><button class="btn" data-business-upgrade="'+esc(b.business_id||b.id)+'">Upar</button></div>').join(''):'<div class="empty">Você ainda não possui negócios.</div>')+'</div><div class="grid cards section">'+(catalog.businesses||[]).map(x=>'<div class="card catalog-card"><h3>🏢 '+esc(x.name)+'</h3><p>'+money(x.price)+' • '+money(x.profitHour)+'/h</p><button class="btn primary" data-business-buy="'+esc(x.id)+'">Comprar</button></div>').join('')+'</div></div>'+
    '<div class="section card"><div class="section-title"><h3>Central Uber CLT</h3><small>Mesmo estado do !centraluber</small></div><pre class="result-box">'+esc(JSON.stringify(clt,null,2))+'</pre><div class="hero-actions"><button class="btn" data-clt-hire>Contratar motorista</button><button class="btn primary" data-clt-start>Iniciar turno</button><button class="btn good" data-action="cltUber.collect">Coletar</button></div></div>'+resultPanel();
}
function renderLoans(){
  const loans=ui.data.loans||{}, borrowed=loans.borrowed||[], lent=loans.lent||[], credit=loans.credit||ui.extras&&ui.extras.loanCredit||{};
  const incoming=borrowed.filter(x=>x.status==='pending');
  const active=borrowed.filter(x=>x.status==='active');
  return '<div class="page-head"><div><h2>Empréstimos</h2><p>Propostas, dívida ativa e crédito vêm diretamente de player_loans.</p></div><span class="tag">Limite '+money(credit.creditLimit||credit.limit||0)+'</span></div>'+
    '<div class="grid stats">'+statCard('CRÉDITO',money(credit.creditLimit||credit.limit||0),'limite calculado')+statCard('PENDENTES',incoming.length,'propostas recebidas')+statCard('ATIVOS',active.length,'dívidas')+statCard('EMPRESTADOS',lent.length,'ofertas suas')+'</div>'+
    '<div class="section"><div class="section-title"><h3>Propostas recebidas</h3><small>'+incoming.length+'</small></div><div class="grid cards">'+
      (incoming.length?incoming.map(x=>'<div class="card"><h3>'+money(x.amount)+' de '+esc(x.lender_name||'Jogador')+'</h3><p>Oferta #'+x.id+' • expira conforme a regra do bot.</p><div class="pet-actions"><button class="btn good" data-loan-accept="'+x.id+'">Aceitar</button><button class="btn danger" data-loan-reject="'+x.id+'">Recusar</button></div></div>').join(''):'<div class="empty">Nenhuma proposta pendente.</div>')+
    '</div></div>'+
    '<div class="section"><div class="section-title"><h3>Dívidas ativas</h3><small>'+active.length+'</small></div><div class="grid cards">'+
      (active.length?active.map(x=>'<div class="card"><h3>'+money(x.principal||x.amount)+'</h3><p>Credor: '+esc(x.lender_name||'Jogador')+' • saldo/juros calculados pelo backend.</p><button class="btn good" data-loan-pay="total">Pagar total</button></div>').join(''):'<div class="empty">Nenhuma dívida ativa.</div>')+
    '</div></div>'+
    '<div class="section"><div class="section-title"><h3>Ofertas / empréstimos concedidos</h3><small>'+lent.length+'</small></div><div class="list">'+
      (lent.length?lent.map(x=>'<div class="list-row"><span>'+esc(x.borrower_name||'Jogador')+' • '+esc(x.status)+'</span><strong>'+money(x.amount||x.principal)+'</strong></div>').join(''):'<div class="empty">Nenhum empréstimo concedido.</div>')+
    '</div></div>'+resultPanel();
}
function render(){
  if(!ui.data || !ui.catalog) return;
  renderNav(); renderHeader();
  const renderers={home:renderHome,pets:renderPets,inventory:renderInventory,shop:renderShop,raids:renderRaids,boss:renderBoss,social:renderSocial,market:renderMarket,clan:renderClan,games:renderGames,activities:renderActivities,progression:renderProgression,rankings:renderRankings,economy:renderEconomy,loans:renderLoans};
  $('#content').innerHTML=(renderers[ui.page]||renderHome)();
  bind();
}

function bind(){
  document.querySelectorAll('[data-resync]').forEach(x=>x.onclick=()=>sync(false));
  document.querySelectorAll('[data-action]').forEach(x=>x.onclick=()=>doAction(x.dataset.action,{},{}));
  document.querySelectorAll('[data-pet-tab]').forEach(x=>x.onclick=()=>{ui.petTab=x.dataset.petTab;render();});
  document.querySelectorAll('[data-pet-team-save]').forEach(x=>x.onclick=()=>{
    const selects=[...document.querySelectorAll('[data-team-slot]')].sort((a,b)=>Number(a.dataset.teamSlot)-Number(b.dataset.teamSlot));
    const petIds=selects.map(s=>Number(s.value||0)).filter(v=>Number.isInteger(v)&&v>0);
    if(!petIds.length) return toast('Escolha pelo menos o pet Principal.');
    if(new Set(petIds).size!==petIds.length) return toast('Não use o mesmo pet em dois slots.');
    doAction('pet.team',{petIds,replaceAll:true},{});
  });
  document.querySelectorAll('[data-pet-select]').forEach(x=>x.onclick=()=>doAction('pet.select',{petId:Number(x.dataset.petSelect)},{}));
  document.querySelectorAll('[data-pet-rename]').forEach(x=>x.onclick=()=>{
    const current=(collection().find(p=>p.active)||{}).name||'';
    const name=prompt('Novo nome do pet ativo (R$ 1.000):',current);
    if(name && name!==current) doAction('pet.rename',{name},{});
  });
  document.querySelectorAll('[data-pet-action]').forEach(x=>x.onclick=()=>doAction('pet.action',{action:x.dataset.petAction},{}));
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
  document.querySelectorAll('[data-box-open]').forEach(x=>x.onclick=()=>doAction('item.box.open',{boxId:x.dataset.boxOpen,qty:1},{}));
  document.querySelectorAll('[data-box-open-all]').forEach(x=>x.onclick=()=>doAction('item.box.open',{boxId:x.dataset.boxOpenAll,qty:Number(x.dataset.boxQty||1)},{}));
  document.querySelectorAll('[data-sell-duplicates]').forEach(x=>x.onclick=()=>doAction('item.sellDuplicates',{},{}));
  document.querySelectorAll('[data-item-sell]').forEach(x=>x.onclick=()=>doAction('item.sell',{itemId:x.dataset.itemSell,qty:1},{}));
  document.querySelectorAll('[data-shop-buy]').forEach(x=>x.onclick=()=>doAction('item.buy',{itemId:x.dataset.shopBuy,qty:1},{}));
  document.querySelectorAll('[data-raid-create]').forEach(x=>x.onclick=()=>doAction('raid.create',{level:Number(x.dataset.raidCreate),name:ui.data.profile.push_name},{}));
  document.querySelectorAll('[data-raid-join]').forEach(x=>x.onclick=()=>doAction('raid.join',{level:Number(x.dataset.raidJoin),name:ui.data.profile.push_name},{}));
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
  document.querySelectorAll('[data-deposit]').forEach(x=>x.onclick=()=>{
    const raw=prompt('Quanto depositar? Use total para tudo:','total');
    if(raw) doAction('deposit',{amount:raw==='total'?'total':Number(raw)},{});
  });
  document.querySelectorAll('[data-withdraw]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Quanto sacar?','1000'));
    if(amount>0) doAction('withdraw',{amount},{});
  });
  document.querySelectorAll('[data-house-buy]').forEach(x=>x.onclick=()=>doAction('house.buy',{id:x.dataset.houseBuy},{}));
  document.querySelectorAll('[data-car-buy]').forEach(x=>x.onclick=()=>doAction('car.buy',{id:x.dataset.carBuy},{}));
  document.querySelectorAll('[data-car-sell]').forEach(x=>x.onclick=()=>doAction('car.sell',{id:x.dataset.carSell},{}));
  document.querySelectorAll('[data-moto-buy]').forEach(x=>x.onclick=()=>doAction('motorcycle.buy',{id:x.dataset.motoBuy},{}));
  document.querySelectorAll('[data-moto-sell]').forEach(x=>x.onclick=()=>doAction('motorcycle.sell',{id:x.dataset.motoSell},{}));
  document.querySelectorAll('[data-business-buy]').forEach(x=>x.onclick=()=>doAction('business.buy',{id:x.dataset.businessBuy},{}));
  document.querySelectorAll('[data-clt-hire]').forEach(x=>x.onclick=()=>{
    const input=prompt('Tipo/número do motorista CLT:','1');
    if(input) doAction('cltUber.hire',{input},{});
  });
  document.querySelectorAll('[data-clt-start]').forEach(x=>x.onclick=()=>{
    const driverSlot=Number(prompt('Slot do motorista:','1'));
    const carSlot=Number(prompt('Slot do carro:','1'));
    if(driverSlot>0&&carSlot>0) doAction('cltUber.start',{driverSlot,carSlot},{});
  });
  document.querySelectorAll('[data-loan-pay]').forEach(x=>x.onclick=()=>doAction('loan.pay',{amount:x.dataset.loanPay},{}));
  document.querySelectorAll('[data-loan-accept]').forEach(x=>x.onclick=()=>doAction('loan.accept',{id:Number(x.dataset.loanAccept)},{}));
  document.querySelectorAll('[data-loan-reject]').forEach(x=>x.onclick=()=>doAction('loan.reject',{id:Number(x.dataset.loanReject)},{}));
  document.querySelectorAll('[data-battle]').forEach(x=>x.onclick=()=>doAction('battle',{targetJid:x.dataset.battle},{}));
  document.querySelectorAll('[data-petduel]').forEach(x=>x.onclick=()=>doAction('petduel',{targetJid:x.dataset.petduel},{}));
  document.querySelectorAll('[data-rob]').forEach(x=>x.onclick=()=>doAction('rob',{targetJid:x.dataset.rob},{}));
  document.querySelectorAll('[data-transfer]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Valor do PIX:','1000'));
    if(amount>0) doAction('transfer',{targetJid:x.dataset.transfer,amount},{});
  });
  document.querySelectorAll('[data-loan-offer]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Valor do empréstimo:','5000'));
    if(amount>0) doAction('loan.offer',{targetJid:x.dataset.loanOffer,amount},{});
  });
  document.querySelectorAll('[data-relationship-propose]').forEach(x=>x.onclick=()=>doAction('relationship.propose',{targetJid:x.dataset.relationshipPropose},{}));
  document.querySelectorAll('[data-relationship-accept-member]').forEach(x=>x.onclick=()=>doAction('relationship.accept',{targetJid:x.dataset.relationshipAcceptMember},{}));
  document.querySelectorAll('[data-relationship-divorce]').forEach(x=>x.onclick=()=>doAction('relationship.divorce',{},{}));

  document.querySelectorAll('[data-market-buy]').forEach(x=>x.onclick=()=>doAction('market.buy',{listingId:Number(x.dataset.marketBuy)},{}));
  document.querySelectorAll('[data-market-cancel]').forEach(x=>x.onclick=()=>doAction('market.cancel',{listingId:Number(x.dataset.marketCancel)},{}));
  document.querySelectorAll('[data-market-create]').forEach(x=>x.onclick=()=>{
    const available=(ui.data.inventory||[]).filter(i=>Number(i.quantity)>0 && i.sellable!==false);
    const hint=available.slice(0,12).map(i=>i.item_id+' x'+i.quantity).join('\n');
    const itemId=prompt('ID do item para anunciar:\n'+hint,available[0]&&available[0].item_id||'');
    if(!itemId) return;
    const qty=Number(prompt('Quantidade:','1'));
    const price=Number(prompt('Preço total do anúncio:','1000'));
    if(qty>0&&price>0) doAction('market.create',{itemId,qty,price},{});
  });

  document.querySelectorAll('[data-clan-create]').forEach(x=>x.onclick=()=>{
    const name=prompt('Nome do novo clã:','Alpha');
    if(name) doAction('clan.create',{name},{});
  });
  document.querySelectorAll('[data-clan-accept]').forEach(x=>x.onclick=()=>doAction('clan.accept',{},{}));
  document.querySelectorAll('[data-clan-leave]').forEach(x=>x.onclick=()=>doAction('clan.leave',{},{}));
  document.querySelectorAll('[data-clan-donate]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Valor da doação ao clã:','1000'));
    if(amount>0) doAction('clan.donate',{amount},{});
  });
  document.querySelectorAll('[data-clan-invite]').forEach(x=>x.onclick=()=>doAction('clan.invite',{targetJid:x.dataset.clanInvite},{}));
  document.querySelectorAll('[data-clan-kick]').forEach(x=>x.onclick=()=>doAction('clan.kick',{targetJid:x.dataset.clanKick},{}));
  document.querySelectorAll('[data-clan-transfer]').forEach(x=>x.onclick=()=>doAction('clan.transfer',{targetJid:x.dataset.clanTransfer},{}));

  document.querySelectorAll('[data-game-coin]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Aposta:','1000')), choice=prompt('cara ou coroa:','cara');
    if(amount>0&&choice) doAction('game.coinflip',{amount,choice},{});
  });
  document.querySelectorAll('[data-game-roulette]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Aposta:','1000')), choice=prompt('Escolha da roleta:','vermelho');
    if(amount>0&&choice) doAction('game.roulette',{amount,choice},{});
  });
  document.querySelectorAll('[data-game-rps]').forEach(x=>x.onclick=()=>{
    const choice=prompt('pedra, papel ou tesoura:','pedra');
    if(choice) doAction('game.rps',{choice},{});
  });
  document.querySelectorAll('[data-game-dungeon]').forEach(x=>x.onclick=()=>doAction('dungeon',{},{}));
  document.querySelectorAll('[data-quiz-start]').forEach(x=>x.onclick=()=>doAction('game.quiz.start',{},{}));
  document.querySelectorAll('[data-quiz-answer]').forEach(x=>x.onclick=()=>{
    const answer=prompt('Sua resposta:','1');
    if(answer) doAction('game.quiz.answer',{answer},{});
  });
  document.querySelectorAll('[data-number-start]').forEach(x=>x.onclick=()=>doAction('game.number.start',{},{}));
  document.querySelectorAll('[data-number-guess]').forEach(x=>x.onclick=()=>{
    const guess=Number(prompt('Seu número:','50'));
    if(guess>0) doAction('game.number.guess',{guess},{});
  });
  document.querySelectorAll('[data-hangman-start]').forEach(x=>x.onclick=()=>doAction('game.hangman.start',{},{}));
  document.querySelectorAll('[data-hangman-letter]').forEach(x=>x.onclick=()=>{
    const letter=prompt('Letra:','a');
    if(letter) doAction('game.hangman.letter',{letter},{});
  });
  document.querySelectorAll('[data-hangman-word]').forEach(x=>x.onclick=()=>{
    const word=prompt('Palavra:','');
    if(word) doAction('game.hangman.word',{word},{});
  });
  document.querySelectorAll('[data-group-roulette-create]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Aposta:','1000')), choice=prompt('Escolha:','vermelho');
    if(amount>0&&choice) doAction('game.groupRoulette.create',{amount,choice},{});
  });
  document.querySelectorAll('[data-group-roulette-join]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Aposta:','1000')), choice=prompt('Escolha:','vermelho');
    if(amount>0&&choice) doAction('game.groupRoulette.join',{amount,choice},{});
  });
  document.querySelectorAll('[data-group-roulette-spin]').forEach(x=>x.onclick=()=>doAction('game.groupRoulette.spin',{},{}));
  document.querySelectorAll('[data-tournament-create]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Entrada do torneio:','1000'));
    if(amount>0) doAction('game.tournament.create',{amount},{});
  });
  document.querySelectorAll('[data-tournament-join]').forEach(x=>x.onclick=()=>doAction('game.tournament.join',{},{}));
  document.querySelectorAll('[data-tournament-start]').forEach(x=>x.onclick=()=>doAction('game.tournament.start',{},{}));

  document.querySelectorAll('[data-sleep]').forEach(x=>x.onclick=()=>doAction(x.dataset.sleep==='wake'?'sleep.wake':'sleep.start',{},{}));
  document.querySelectorAll('[data-carpinar]').forEach(x=>x.onclick=()=>{
    if(x.dataset.carpinar==='leave'){doAction('carpinar.leave',{},{});return;}
    const plans=(ui.extras&&ui.extras.carpinarPlans)||[];
    const hours=Number(prompt('Horas para carpinar ('+plans.map(p=>p.hours).join('/')+'):','1'));
    if(hours>0) doAction('carpinar.start',{hours},{});
  });
  document.querySelectorAll('[data-pet-adventure]').forEach(x=>x.onclick=()=>doAction('pet.adventure',{},{}));
  document.querySelectorAll('[data-pet-expedition]').forEach(x=>x.onclick=()=>{
    const pets=collection();
    if(!pets.length){toast('Você não tem pets.');return;}
    const petId=Number(prompt('ID do pet: '+pets.map(p=>p.id+'='+p.name).join(', '),String(pets[0].id)));
    const hours=Number(prompt('Horas da expedição:','4'));
    if(petId>0&&hours>0) doAction('pet.expedition.start',{petId,hours},{});
  });
  document.querySelectorAll('[data-pet-expedition-resolve]').forEach(x=>x.onclick=()=>doAction('pet.expedition.resolve',{},{}));
  document.querySelectorAll('[data-missions-claim]').forEach(x=>x.onclick=()=>doAction('missions.claim',{},{}));
  document.querySelectorAll('[data-level-claim]').forEach(x=>x.onclick=()=>doAction('level.claim',{},{}));
  document.querySelectorAll('[data-group-mission-claim]').forEach(x=>x.onclick=()=>doAction('groupMission.claim',{},{}));
  document.querySelectorAll('[data-group-event-claim]').forEach(x=>x.onclick=()=>doAction('groupEvent.claim',{},{}));
  document.querySelectorAll('[data-clear-result]').forEach(x=>x.onclick=()=>{ui.lastResult=null;render();});
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
