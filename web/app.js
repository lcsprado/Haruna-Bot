const API_BASE = window.location.origin;
const TOKEN_KEY = 'alphaWebTokenV1';
const CHARACTER_KEY = 'alphaWebCharacterV1';

const ui = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  catalog: null,
  data: null,
  extras: null,
  extrasFetchedAt: 0,
  lastResult: null,
  page: 'home',
  petTab: 'owned',
  characterId: localStorage.getItem(CHARACTER_KEY) || 'rei-alpha',
  raidTimer: null,
  raidLevel: null,
  bossTimer: null,
  syncing: false,
  avatarUrl: '',
  avatarFetchedAt: 0
};

const navItems = [
  ['home','⌂','Início'],
  ['character','🧙','Personagem'],
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


const CHARACTER_ART = [
  {id:'rei-alpha',name:'Rei Alpha',role:'Guerreiro',img:'/assets/characters/rei-alpha.webp',desc:'Ofensivo e imponente. Visual clássico do Alpha.'},
  {id:'guardiao-onix',name:'Guardião Ônix',role:'Guardião',img:'/assets/characters/guardiao-onix.webp',desc:'Armadura pesada e presença de linha de frente.'},
  {id:'sentinela-azul',name:'Sentinela Azul',role:'Sentinela',img:'/assets/characters/sentinela-azul.webp',desc:'Visual ágil e tecnológico para combate.'}
];

const PET_ART_ALIASES = {
  cachorro:'lobo',gato:'gato',coelho:'gato',papagaio:'aguia',hamster:'gato',
  tartaruga:'polvo-arcano',coruja:'corvo-abissal',raposa:'raposa',
  golfinho_celestial:'baleia-colossal',lobo:'lobo',moreia_sombria:'serpente-cosmica',
  aguia:'aguia',gaviao:'aguia',panda:'leao',tubarao_abissal:'tubarao-abissal',
  guepardo:'tigre',tigre:'tigre',polvo_arcano:'polvo-arcano',
  gazela_mistica:'raposa',leao:'leao',cervo_mistico:'raposa',
  orca_guerra:'baleia-colossal',cavalo_guerra:'leao',unicornio:'fenix-celestial',
  baleia_colossal:'baleia-colossal',dragao:'dragao',golem_ancestral:'dragao',
  urso_runico:'leao',colosso_cristal:'dragao',salamandra_infernal:'dragao',
  dragao_vulcanico:'dragao',fenix_fogo:'fenix-celestial',corvo_abissal:'corvo-abissal',
  lobo_abismo:'lobo',fenix_gelo:'fenix-de-gelo',rinoceronte_titanico:'leao',
  guardiao_obsidiana:'dragao',leviata_gelo:'serpente-cosmica',cerbero_carmesim:'lobo',
  tigre_lunar:'tigre',imperador_abissal:'tubarao-abissal',leao_solar:'leao',
  grifo_celestial:'grifo-celestial',fenix_celestial:'fenix-celestial',
  serpente_cosmica:'serpente-cosmica',dragao_corrompido:'dragao',
  fenix_alpha:'fenix-celestial',kitsune:'kitsune'
};

function selectedCharacter(){
  return CHARACTER_ART.find(x=>x.id===ui.characterId) || CHARACTER_ART[0];
}
function petArtUrl(species){
  const raw=String(species||'').toLowerCase();
  const id=PET_ART_ALIASES[raw] || raw.replace(/_/g,'-') || 'lobo';
  return '/assets/pets/'+id+'.webp';
}
function bossArtUrl(name){
  const n=String(name||'').toLowerCase();
  if(n.includes('vulc')||n.includes('drag')) return '/assets/pets/dragao.webp';
  if(n.includes('abiss')||n.includes('ancestral')) return '/assets/pets/serpente-cosmica.webp';
  if(n.includes('gelo')) return '/assets/pets/fenix-de-gelo.webp';
  if(n.includes('fênix')||n.includes('fenix')) return '/assets/pets/fenix-celestial.webp';
  return '/assets/characters/guardiao-onix.webp';
}
function raidArtUrl(level){
  const lv=Number(level||0);
  if(lv>=50) return '/assets/pets/fenix-celestial.webp';
  if(lv>=40) return '/assets/pets/serpente-cosmica.webp';
  if(lv>=30) return '/assets/pets/tubarao-abissal.webp';
  if(lv>=25) return '/assets/pets/grifo-celestial.webp';
  if(lv>=20) return '/assets/pets/corvo-abissal.webp';
  if(lv>=15) return '/assets/pets/dragao.webp';
  return '/assets/pets/lobo.webp';
}
function combatArenaMarkup(enemyName,kind,level){
  const ch=selectedCharacter();
  const enemySrc=kind==='raid'?raidArtUrl(level):bossArtUrl(enemyName);
  const key=kind==='raid'?'raid-'+Number(level):'boss';
  return '<div class="combat-arena" data-combat-arena="'+key+'">'+
    '<div class="combat-fighter player" data-combat-player><img src="'+esc(ch.img)+'" alt="'+esc(ch.name)+'"><span>'+esc(ch.name)+'</span></div>'+
    '<div class="combat-vs">VS</div>'+
    '<div class="combat-fighter enemy" data-combat-enemy><img src="'+esc(enemySrc)+'" alt="'+esc(enemyName||'Inimigo')+'"><span>'+esc(enemyName||'Inimigo')+'</span></div>'+
    '<div class="combat-fx" data-combat-fx></div>'+
  '</div>';
}
function raidArenaMarkup(raid,state){
  return state&&state.status==='active'?combatArenaMarkup(raid.name,'raid',raid.level):'';
}
function combatDamage(result){
  if(!result||typeof result!=='object') return 0;
  const keys=['damage','totalDamage','dealtDamage','playerDamage','roundDamage','damageDealt'];
  for(const k of keys){
    const v=Number(result[k]);
    if(Number.isFinite(v)&&v>0) return v;
  }
  for(const arrKey of ['attacks','log','hits']){
    const arr=result[arrKey];
    if(Array.isArray(arr)){
      const v=arr.reduce((s,x)=>s+Number((x&&((x.damage??x.dmg)??0))||0),0);
      if(v>0) return v;
    }
  }
  if(result.result&&typeof result.result==='object') return combatDamage(result.result);
  return 0;
}
function combatIncomingDamage(result){
  if(!result||typeof result!=='object') return 0;
  const direct=Number(result.bossDamage||0);
  if(direct>0) return direct;
  if(Array.isArray(result.events)){
    return result.events.filter(x=>x&&x.type==='boss').reduce((sum,x)=>sum+Number(x.damage||0),0);
  }
  return 0;
}
function combatWasCritical(result){
  if(!result||typeof result!=='object') return false;
  if(result.pet&&result.pet.crit) return true;
  if(result.crit===true) return true;
  return Array.isArray(result.events)&&result.events.some(x=>x&&x.type==='hit'&&x.crit);
}
function animateCombatImpact(kind,result,level){
  const key=kind==='raid'?'raid-'+Number(level):'boss';
  const arena=document.querySelector('[data-combat-arena="'+key+'"]');
  if(!arena) return;
  const player=arena.querySelector('[data-combat-player]');
  const enemy=arena.querySelector('[data-combat-enemy]');
  const fx=arena.querySelector('[data-combat-fx]');
  if(!player||!enemy) return;
  const dealt=combatDamage(result);
  const incoming=combatIncomingDamage(result);
  const critical=combatWasCritical(result);
  for(const el of [player,enemy,arena]) el.classList.remove('attack','hit','counter','impact','critical-impact');
  if(fx) fx.innerHTML='';
  void arena.offsetWidth;
  arena.classList.add('impact');
  if(critical) arena.classList.add('critical-impact');
  player.classList.add('attack');
  window.setTimeout(()=>{
    enemy.classList.add('hit');
    if(fx) fx.innerHTML='<span class="damage-float '+(critical?'critical':'')+'">'+(critical?'💥 ':'')+(dealt>0?'-'+num(dealt):'💥')+'</span>';
  },170);
  if(incoming>0){
    window.setTimeout(()=>{
      enemy.classList.add('counter');
      player.classList.add('hit');
      if(fx) fx.innerHTML+='<span class="damage-float incoming">-'+num(incoming)+'</span>';
    },560);
  }
  window.setTimeout(()=>{
    for(const el of [player,enemy,arena]) el.classList.remove('attack','hit','counter','impact','critical-impact');
    if(fx) fx.innerHTML='';
  },1250);
}

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

async function syncAvatar(force=false){
  if(!ui.token) return;
  if(!force && ui.avatarFetchedAt && Date.now()-ui.avatarFetchedAt<60000) return;
  ui.avatarFetchedAt=Date.now();
  try{
    const res=await fetch(API_BASE+'/api/v1/me/avatar',{headers:{authorization:'Bearer '+ui.token},cache:'no-store'});
    if(res.status===404){
      if(ui.avatarUrl) URL.revokeObjectURL(ui.avatarUrl);
      ui.avatarUrl='';
      return;
    }
    if(!res.ok) return;
    const blob=await res.blob();
    const next=URL.createObjectURL(blob);
    if(ui.avatarUrl) URL.revokeObjectURL(ui.avatarUrl);
    ui.avatarUrl=next;
  }catch{}
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
    await syncAvatar(false);
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

function actionFeedback(name,result){
  if(result&&result.ok===false&&Number(result.remaining)>0) return '⏳ Cooldown: '+formatRemaining(result.remaining);
  if(result&&result.cooldown&&Number(result.remainingMs)>0) return '⏳ Aguarde '+formatRemaining(Number(result.remainingMs)/1000);
  if(name==='daily'&&result&&result.ok) return '🎁 Daily recebido • '+money(result.totalCash||result.amount||0)+' • sequência '+num(result.streak||1);
  if(name==='work'&&result&&result.ok) return '💼 Trabalho concluído • +'+money(result.amount||0)+' • cooldown 30 min';
  if(name==='all'&&result) return '⚡ ALL processado. Veja o resultado abaixo.';
  return 'Ação concluída no Alpha Bot.';
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
    if(!options.quiet) toast(options.success||actionFeedback(name,response.result));
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
  if(ui.avatarUrl) URL.revokeObjectURL(ui.avatarUrl);
  ui.avatarUrl=''; ui.avatarFetchedAt=0;
  ui.token=''; ui.data=null; ui.catalog=null; ui.extras=null; ui.extrasFetchedAt=0;
  localStorage.removeItem(TOKEN_KEY);
  showLogin();
}

function setMenu(open){
  const side=$('#sidebar');
  const back=$('#menuBackdrop');
  const isOpen=Boolean(open);
  if(side) side.classList.toggle('open',isOpen);
  if(back){
    back.classList.toggle('open',isOpen);
    back.setAttribute('aria-hidden',isOpen?'false':'true');
  }
  document.body.classList.toggle('menu-open',isOpen);
}

function renderNav(){
  $('#nav').innerHTML=navItems.map(item=>{
    return '<button class="nav-btn '+(ui.page===item[0]?'active':'')+'" data-page="'+item[0]+'"><span>'+item[1]+'</span>'+item[2]+'</button>';
  }).join('');
  document.querySelectorAll('[data-page]').forEach(btn=>btn.onclick=async()=>{
    ui.page=btn.dataset.page;
    setMenu(false);
    if(['social','market','clan','games','activities','rankings','loans'].includes(ui.page)){
      await syncExtras(false).catch(()=>null);
    }
    render();
    window.scrollTo({top:0,left:0,behavior:'auto'});
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
  $('#miniProfile').innerHTML='<div class="mini-profile-row">'+(ui.avatarUrl?'<img class="mini-avatar" src="'+esc(ui.avatarUrl)+'" alt="">':'<div class="mini-avatar fallback">A</div>')+'<div><strong>'+esc(raw.push_name||'Jogador')+'</strong><small>Nível '+num(raw.level)+' • '+(ui.data&&ui.data.identity&&ui.data.identity.groupLinked?'grupo vinculado':'sem grupo vinculado')+'</small></div></div>';
  $('#topStats').innerHTML=[
    '<span class="top-pill">❤️ '+num(p.effective_hp||p.hp)+'/'+num(p.effective_max_hp||p.max_hp)+'</span>',
    '<span class="top-pill">💵 '+money(raw.cash)+'</span>',
    '<span class="top-pill">🏦 '+money(raw.bank)+'</span>'
  ].join('');
  const title=(navItems.find(x=>x[0]===ui.page)||['','','Alpha RPG'])[2];
  $('#pageTitle').textContent=title;
}

function cooldownKey(key){
  return String(key||'').split(':')[0].trim().toLowerCase();
}
function cooldownLabel(key){
  const action=cooldownKey(key);
  const map={battle:'Duelo',rob:'Roubar',work:'Trabalhar',uber:'Uber',ifood:'iFood',daily:'Daily',petduel:'Duelo Pet',dungeon:'Dungeon'};
  return map[action]||titleCase(action||'Cooldown');
}
function formatRemaining(seconds){
  const total=Math.max(0,Math.ceil(Number(seconds||0)));
  const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
  if(h>0) return h+'h '+m+'m';
  if(m>0) return m+'m '+s+'s';
  return s+'s';
}
function cooldownExpiry(action){
  const row=((ui.data&&ui.data.cooldowns)||[]).find(x=>cooldownKey(x.key)===String(action||'').toLowerCase());
  return row?Number(row.expires_at||0):0;
}
function cooldownRemaining(action){
  const nowSec=Math.floor(Date.now()/1000);
  const expires=cooldownExpiry(action);
  return expires?Math.max(0,expires-nowSec):0;
}
function refreshLiveCountdowns(){
  const nowSec=Math.floor(Date.now()/1000);
  document.querySelectorAll('[data-cooldown-expires]').forEach(el=>{
    const expires=Number(el.dataset.cooldownExpires||0);
    const remain=Math.max(0,expires-nowSec);
    el.textContent=formatRemaining(remain);
    if(remain<=0){
      const row=el.closest('.list-row');
      if(row) row.remove();
    }
  });
  document.querySelectorAll('[data-work-cooldown]').forEach(btn=>{
    const expires=Number(btn.dataset.workCooldown||0);
    const remain=Math.max(0,expires-nowSec);
    if(remain>0){
      btn.disabled=true;
      btn.textContent='⏳ Trabalhar • '+formatRemaining(remain);
    }else{
      btn.disabled=false;
      btn.textContent='💼 Trabalhar';
      delete btn.dataset.workCooldown;
    }
  });
}
function transactionLabel(type){
  const map={
    work:'Trabalho',income_tax:'TAXADE',uber:'Uber',ifood:'iFood',transfer:'PIX',
    shop:'Loja',market:'Mercado',market_sale:'Venda no mercado',raid_reward:'Raid',
    boss_reward:'Boss',business_collect:'Negócios',daily:'Daily',loan:'Empréstimo',
    equipment_upgrade:'Upgrade',pet_rename:'Renomear pet',raid_key_auto:'Chave Raid'
  };
  return map[String(type||'')]||titleCase(String(type||'movimentação').replace(/_/g,' '));
}
function renderTransactions(limit){
  const rows=((ui.data&&ui.data.recentTransactions)||[]).slice(0,Number(limit||20));
  if(!rows.length) return '<div class="empty">Nenhuma movimentação recente.</div>';
  return '<div class="list transactions">'+rows.map(t=>{
    const outgoing=t.direction==='out',incoming=t.direction==='in';
    const sign=outgoing?'-':incoming?'+':'';
    const when=Number(t.created_at||0)>0?new Date(Number(t.created_at)*1000).toLocaleString('pt-BR'):'';
    const who=t.counterparty?' • '+esc(t.counterparty):'';
    return '<div class="list-row"><div><strong>'+esc(transactionLabel(t.type))+'</strong><small>'+esc(t.note||'')+who+(when?' • '+esc(when):'')+'</small></div><strong class="'+(incoming?'money-in':outgoing?'money-out':'')+'">'+sign+money(t.amount)+'</strong></div>';
  }).join('')+'</div>';
}

function renderCooldowns(){
  const rows=(ui.data&&ui.data.cooldowns)||[];
  const nowSec=Math.floor(Date.now()/1000);
  const active=rows.filter(row=>Number(row.expires_at||0)>nowSec);
  if(!active.length) return '<div class="empty">Nenhum cooldown ativo.</div>';
  return '<div class="list">'+active.map(row=>{
    const expires=Number(row.expires_at||0);
    const remain=Math.max(0,expires-nowSec);
    return '<div class="list-row"><span>'+esc(cooldownLabel(row.key))+'</span><strong data-cooldown-expires="'+expires+'">'+esc(formatRemaining(remain))+'</strong></div>';
  }).join('')+'</div>';
}

function statCard(label,value,sub){
  return '<div class="card stat-card"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span>'+esc(sub||'')+'</span></div>';
}

function renderLiveGroupState(group){
  if(!group) return '<div class="empty">Vincule pelo !web dentro do grupo para acompanhar Boss, Raids e eventos daqui.</div>';
  const boss=group.bossEvent||group.boss||null;
  const raids=(group.raids||[]).filter(r=>r&&['lobby','active'].includes(r.status));
  const games=group.games||{};
  const activeGames=Object.keys(games).filter(k=>games[k] && !['boss','boss_event'].includes(k));
  let html='<div class="list">';
  if(boss){
    const hp=Number(boss.hp||0),max=Math.max(1,Number(boss.maxHp||1));
    html+='<div class="list-row"><div><strong>👹 '+esc(boss.name||'Boss')+'</strong><small>'+num(hp)+'/'+num(max)+' HP</small></div><button class="btn" data-go-page="boss">Abrir</button></div>';
  }else html+='<div class="list-row"><span>👹 Boss</span><small>Nenhum ativo</small></div>';
  if(raids.length){
    for(const raid of raids.slice(0,4)){
      html+='<div class="list-row"><div><strong>⚔️ Raid Lv.'+num(raid.level)+'</strong><small>'+esc(raid.status)+' • '+num(Object.keys(raid.players||{}).length)+'/5</small></div><button class="btn" data-go-page="raids">Abrir</button></div>';
    }
  }else html+='<div class="list-row"><span>⚔️ Raids</span><small>Nenhuma aberta</small></div>';
  html+='<div class="list-row"><span>🎮 Sessões de minigame</span><strong>'+num(activeGames.length)+'</strong></div>';
  return html+'</div>';
}

function renderDoubleRewardEvent(){
  const event=(ui.data&&ui.data.events&&ui.data.events.doubleReward)||null;
  if(!event || (!event.active&&!event.scheduled)) return '';
  const now=Date.now();
  const ms=event.active?Math.max(0,Number(event.endsAt||0)-now):Math.max(0,Number(event.startsAt||0)-now);
  const mins=Math.max(1,Math.ceil(ms/60000));
  return '<div class="section card double-event '+(event.active?'active':'scheduled')+'">'+
    '<div class="section-title"><div><h3>🔥 Evento de recompensa '+(event.active?'ATIVO':'AGENDADO')+'</h3><small>Dinheiro ×'+num(event.moneyMultiplier||1)+' • XP ×'+num(event.xpMultiplier||1)+'</small></div><span class="tag '+(event.active?'good':'')+'">⏳ '+mins+' min</span></div>'+
    '<p>'+(event.active?'Trabalho, Uber, iFood, Dungeon e outras recompensas elegíveis já usam esses multiplicadores no backend.':'O multiplicador ainda não começou.')+'</p>'+
  '</div>';
}

function renderLuckyBoxEvent(){
  const event=(ui.data&&ui.data.events&&ui.data.events.luckyBox)||null;
  if(!event || (!event.active&&!event.scheduled)) return '';
  const qty=itemCount('caixa_sorte');
  const now=Date.now();
  const ms=event.active?Math.max(0,Number(event.endsAt||0)-now):Math.max(0,Number(event.startsAt||0)-now);
  const mins=Math.max(1,Math.ceil(ms/60000));
  return '<div class="section card lucky-event '+(event.active?'active':'scheduled')+'">'+
    '<div class="section-title"><div><h3>🎁 Evento Caixa da Sorte '+(event.active?'ATIVO':'AGENDADO')+'</h3><small>Multiplicador de sorte ×'+num(event.multiplier||2)+'</small></div><span class="tag '+(event.active?'good':'')+'">⏳ '+mins+' min</span></div>'+
    '<p>'+(event.active?'As Caixas da Sorte abertas agora usam o multiplicador do evento compartilhado do WhatsApp.':'O bônus ainda não começou.')+'</p>'+
    (event.active&&qty>0?'<div class="hero-actions"><button class="btn primary" data-lucky-open="1">Abrir 1</button><button class="btn good" data-lucky-open="'+Math.min(50,qty)+'">Abrir '+Math.min(50,qty)+'</button><span class="tag">'+qty+' caixa(s)</span></div>':'')+
  '</div>';
}

function renderHome(){
  const p=profile(), raw=ui.data.profile||p;
  const hpMax=Number(p.effective_max_hp||p.max_hp||1), hp=Number(p.effective_hp||p.hp||0);
  const group=currentGroup();
  const activities=(ui.data&&ui.data.activities)||{};
  const missions=(ui.data&&ui.data.dailyMissions)||[];
  const dailyDone=Boolean(ui.data&&ui.data.streak&&ui.data.streak.claimedToday);
  const dailyStreak=Number(ui.data&&ui.data.streak&&ui.data.streak.streak||0);
  const workExpires=cooldownExpiry('work');
  const workRemain=cooldownRemaining('work');
  const dailyText=dailyDone?'✅ Daily feito':'🎁 Daily';
  const workText=workRemain>0?'⏳ Trabalhar • '+formatRemaining(workRemain):'💼 Trabalhar';
  return renderDoubleRewardEvent()+renderLuckyBoxEvent()+'<div class="hero card">'+
    '<div><p class="eyebrow">CONTA REAL DO WHATSAPP</p><h2>'+esc(raw.push_name||'Jogador')+'</h2>'+
    '<p class="muted">Dados carregados diretamente do mesmo Neon usado pelo Alpha Bot.</p>'+
    '<div class="home-hp"><div><span>❤️ HP</span><strong>'+num(hp)+'/'+num(hpMax)+'</strong></div><div class="progress"><span style="width:'+pct(hp/hpMax*100)+'%"></span></div></div>'+
    '<div class="home-exp"><div><span>⭐ EXP</span><strong>'+num(raw.exp||0)+'/'+num(Math.max(1,Number(raw.level||1)*100))+'</strong></div><div class="progress exp-progress"><span style="width:'+pct(Number(raw.exp||0)/Math.max(1,Number(raw.level||1)*100)*100)+'%"></span></div></div>'+
    '<div class="hero-actions"><button class="btn primary" data-action="daily" '+(dailyDone?'disabled':'')+'>'+dailyText+'</button><button class="btn good" data-action="all">⚡ ALL</button><button class="btn" data-action="work" '+(workRemain>0?'disabled':'')+' '+(workExpires?'data-work-cooldown="'+workExpires+'"':'')+'>'+workText+'</button><button class="btn" data-resync>↻ Sincronizar</button></div>'+
    '<div class="home-action-status"><span>🎁 Daily: <strong>'+(dailyDone?'feito hoje':'disponível')+'</strong> • sequência '+num(dailyStreak)+'</span><span>💼 Trabalho: <strong>'+(workRemain>0?'cooldown '+esc(formatRemaining(workRemain)):'disponível')+'</strong></span></div></div>'+
    '<div class="hero-side"><div><small>CARTEIRA</small><strong>'+money(raw.cash)+'</strong></div><div><small>BANCO</small><strong>'+money(raw.bank)+'</strong></div><div><small>ARMA</small><strong>'+esc(p.weapon_name||'Nenhuma')+' Lv.'+num(p.weapon_level||1)+'</strong></div><div><small>ARMADURA</small><strong>'+esc(p.armor_name||'Nenhuma')+' Lv.'+num(p.armor_level||1)+'</strong></div></div>'+
  '</div>'+
  resultPanel()+
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
  '<div class="section grid two">'+
    '<div class="card"><div class="section-title"><h3>Ao vivo no grupo</h3><small>Mesmo estado do WhatsApp</small></div>'+renderLiveGroupState(group)+'</div>'+
    '<div class="card"><div class="section-title"><h3>Cooldowns ativos</h3><small>Servidor</small></div>'+renderCooldowns()+'</div>'+
  '</div>'+
  '<div class="section card"><div class="section-title"><h3>Últimas movimentações</h3><small>WhatsApp + Web</small></div>'+renderTransactions(8)+'</div>';
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
  const src=petArtUrl(species);
  const fallback=speciesEmoji[String(species||'').toLowerCase()]||'🐾';
  return '<div class="pet-portrait"><img src="'+esc(src)+'" alt="'+esc(titleCase(species))+'" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\'"><span class="pet-art-fallback">'+fallback+'</span></div>';
}
function ownedPetCard(p){
  const cat=catalogPets().find(x=>x.species===p.species);
  const active=Boolean(p.active);
  return '<div class="card pet-card owned">'+petPortrait(p.species)+
    '<div class="tag-row"><span class="tag '+(active?'good':'')+'">'+(active?'ATIVO':'COLEÇÃO')+'</span><span class="tag">'+esc(cat&&cat.style||'Pet')+'</span></div>'+
    '<h3>'+esc(p.name||cat&&cat.label||titleCase(p.species))+'</h3>'+
    '<p>'+esc(titleCase(p.species))+' • Lv.'+num(p.level)+' • XP '+num(p.xp)+' • Poder '+num(p.power)+'</p>'+
    '<div class="pet-vitals"><div><span>❤️ HP</span><strong>'+num(p.hp)+'/'+num(p.max_hp)+'</strong><div class="progress"><span style="width:'+pct(Number(p.hp||0)/Math.max(1,Number(p.max_hp||1))*100)+'%"></span></div></div>'+
    '<div><span>⚡ Energia</span><strong>'+num(p.energy)+'/'+num(p.max_energy||100)+'</strong><div class="progress"><span style="width:'+pct(Number(p.energy||0)/Math.max(1,Number(p.max_energy||100))*100)+'%"></span></div></div></div>'+
    '<div class="pet-needs"><span>🍗 '+num(p.hunger)+'/100</span><span>🧼 '+num(p.hygiene)+'/100</span></div>'+
    '<p>'+esc(specialtyText(cat))+'</p>'+
    '<div class="pet-actions">'+
      (!active?'<button class="btn good" data-pet-select="'+p.id+'">Usar pet</button>':'')+
      (active?'<div class="pet-rename-inline"><input data-pet-name maxlength="24" value="'+esc(p.name||'')+'" placeholder="Nome do pet"><button class="btn" data-pet-rename>Renomear • R$ 1.000</button></div><button class="btn good" data-pet-action="descansar">Descansar</button><button class="btn" data-pet-action="alimentar">Alimentar</button><button class="btn" data-pet-action="banho">Banho</button><button class="btn" data-pet-action="passear">Passear</button><button class="btn" data-pet-action="treinar">Treinar</button>':'')+
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
    '<div class="pet-actions">'+(special?'<button class="btn '+(can?'primary':'')+'" '+(can?'':'disabled')+' data-pet-summon="'+esc(p.materialId)+'">Invocar</button>':'<div class="pet-adopt-inline"><input data-pet-adopt-name="'+esc(p.species)+'" maxlength="24" placeholder="Nome do novo pet" value="'+esc(p.label||titleCase(p.species))+'"><button class="btn '+(can?'primary':'')+'" '+(can?'':'disabled')+' data-pet-adopt="'+esc(p.species)+'">Adotar</button></div>')+'</div>'+
  '</div>';
}

function renderCharacter(){
  const selected=selectedCharacter();
  return '<div class="page-head"><div><h2>Seu personagem</h2><p>Escolha o visual usado nas cenas de Boss, Raid e combate. É cosmético e não altera seus atributos do bot.</p></div><span class="tag good">'+esc(selected.name)+' ativo</span></div>'+
    '<div class="character-grid">'+CHARACTER_ART.map(ch=>
      '<div class="card character-card '+(ch.id===selected.id?'selected':'')+'">'+
        '<div class="character-art"><img src="'+esc(ch.img)+'" alt="'+esc(ch.name)+'"></div>'+
        '<div class="tag-row"><span class="tag">'+esc(ch.role)+'</span>'+(ch.id===selected.id?'<span class="tag good">ATIVO</span>':'')+'</div>'+
        '<h3>'+esc(ch.name)+'</h3><p>'+esc(ch.desc)+'</p>'+
        '<button class="btn '+(ch.id===selected.id?'good':'primary')+'" data-character-select="'+esc(ch.id)+'">'+(ch.id===selected.id?'Selecionado':'Usar personagem')+'</button>'+
      '</div>'
    ).join('')+'</div>';
}

function renderPets(){
  const adoptCount=catalogPets().filter(x=>x.source==='adoption').length;
  const raidCount=catalogPets().filter(x=>x.source==='raid').length;
  const tabs=[['owned','Minha coleção ('+collection().length+')'],['adopt','🐾 Adotar pet ('+adoptCount+')'],['raid','✨ Raid / especiais ('+raidCount+')']];
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
  return '<div class="page-head"><div><h2>Pets sincronizados</h2><p>O catálogo, coleção e Time Pet vêm do mesmo backend do WhatsApp.</p></div><div class="hero-actions"><button class="btn primary" data-pet-tab="adopt">🐾 Adotar novo pet</button><span class="tag good">'+catalogPets().length+' espécies/recompensas</span></div></div>'+
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
  if(i.sellable!==false && String(i.rarity)!=='legendary'){
    const qty=Math.max(1,Number(i.quantity||1));
    actions+='<button class="btn" data-item-sell="'+esc(id)+'">Vender 1</button>';
    if(qty>1) actions+='<button class="btn" data-item-sell-all="'+esc(id)+'" data-item-sell-qty="'+qty+'">Vender '+qty+'</button>';
  }
  return '<div class="card item-card '+rarityClass(i.rarity)+'"><div class="item-icon">'+itemIcon(i)+'</div>'+
    '<div class="tag-row"><span class="tag '+esc(i.rarity)+'">'+esc(i.rarity||'common')+'</span><span class="tag">'+esc(i.category)+'</span></div>'+
    '<h3>'+esc(i.name)+'</h3><p>x'+num(i.quantity)+(eq?' • Lv.'+num(i.equipment_level||1):'')+'</p><p>'+esc(i.description||'')+'</p>'+
    (i.sellable!==false?'<div class="inventory-value"><span>Venda unitária</span><strong>'+money(i.sell_unit||0)+'</strong></div>':'')+
    (eq&&Number(i.upgrade_refund)>0?'<small class="refund-note">Upgrade devolve '+money(i.upgrade_refund)+' na venda.</small>':'')+
    '<div class="item-actions">'+actions+'</div></div>';
}
function renderInventory(){
  const inv=ui.data.inventory||[];
  return '<div class="page-head"><div><h2>Inventário real</h2><p>Quantidade, raridade e upgrade são lidos do Neon.</p></div><div class="hero-actions"><button class="btn" data-sell-duplicates>💰 Vender repetidos</button><span class="tag">'+inv.length+' tipos</span></div></div>'+
    renderLuckyBoxEvent()+
    '<div class="grid cards">'+(inv.length?inv.map(inventoryCard).join(''):'<div class="empty">Inventário vazio.</div>')+'</div>'+resultPanel();
}

function shopCategoryLabel(cat){
  return ({weapon:'🗡️ Armas',armor:'🛡️ Armaduras',boots:'🥾 Botas',potion:'🧪 Poções',pet_potion:'🐾 Cura Pet',pet_energy:'⚡ Energia Pet',box:'📦 Caixas',raid:'🔑 Raid',material:'🧩 Materiais'}[cat]||('📦 '+titleCase(cat||'outros')));
}
function shopCard(i){
  const eq=i.equipment||{};
  const bonus=[];
  if(Number(eq.attack||eq.atk)>0) bonus.push('+'+num(eq.attack||eq.atk)+' ATK');
  if(Number(eq.defense||eq.def)>0) bonus.push('+'+num(eq.defense||eq.def)+' DEF');
  if(Number(eq.speed||eq.spd)>0) bonus.push('+'+num(eq.speed||eq.spd)+' SPD');
  if(Number(eq.crit)>0) bonus.push('+'+num(Number(eq.crit)<=1?Number(eq.crit)*100:eq.crit)+'% CRIT');
  return '<div class="card item-card '+rarityClass(i.rarity)+'"><div class="item-icon">'+itemIcon(i)+'</div><div class="tag-row"><span class="tag">'+esc(i.rarity||'Comum')+'</span><span class="tag">'+esc(i.category||'item')+'</span></div><h3>'+esc(i.name)+'</h3><p>'+esc(i.description||'')+'</p>'+
    (bonus.length?'<p class="item-bonus">'+bonus.join(' • ')+'</p>':'')+
    '<strong>'+money(i.price)+'</strong><div class="item-actions"><button class="btn primary" data-shop-buy="'+esc(i.id)+'" data-shop-price="'+Number(i.price||0)+'">Comprar 1</button><button class="btn" data-shop-buy-qty="'+esc(i.id)+'" data-shop-price="'+Number(i.price||0)+'">Comprar quantidade</button></div></div>';
}

function renderShop(){
  const items=(ui.catalog&&ui.catalog.shop)||[];
  const groups=[];
  for(const i of items){
    const key=String(i.category||'outros');
    let g=groups.find(x=>x.key===key);
    if(!g){g={key,items:[]};groups.push(g)}
    g.items.push(i);
  }
  return '<div class="page-head"><div><h2>Loja Alpha</h2><p>Itens, preços e atributos vêm do mesmo catálogo usado pelo bot.</p></div><span class="tag good">'+money(ui.data.profile&&ui.data.profile.cash)+'</span></div>'+
    (groups.length?groups.map(g=>'<div class="section shop-section"><div class="section-title"><h3>'+esc(shopCategoryLabel(g.key))+'</h3><small>'+g.items.length+' item(ns)</small></div><div class="grid cards">'+g.items.map(shopCard).join('')+'</div></div>').join(''):'<div class="empty">Loja sem itens disponíveis.</div>');
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
      const ranked=players.slice().sort((a,z)=>Number(z.damage||0)-Number(a.damage||0));
      const totalDamage=ranked.reduce((sum,p)=>sum+Number(p.damage||0),0);
      const party=ranked.length?'<div class="raid-party"><div class="section-title"><h4>Equipe / dano</h4><small>'+num(totalDamage)+' total</small></div><div class="list compact">'+ranked.map((p,i)=>'<div class="list-row"><div><strong>#'+(i+1)+' '+esc(p.name||'Jogador')+'</strong><small>'+(p.alive===false?'💀 CAÍDO':'❤️ '+num(p.hp||0)+' HP')+(p.pet&&p.pet.name?' • 🐾 '+esc(p.pet.name):'')+'</small></div><strong>'+num(p.damage||0)+'</strong></div>').join('')+'</div></div>':'<div class="empty">Sem participantes.</div>';
      const timeLeft=s&&Number(s.expiresAt||0)>Date.now()?Math.ceil((Number(s.expiresAt)-Date.now())/60000):null;
      return '<div class="card raid-card"><div class="tag-row"><span class="tag">LV.'+r.level+'</span><span class="tag '+(s?'good':'')+'">'+(s?esc(s.status).toUpperCase():'DISPONÍVEL')+'</span><span class="tag">'+players.length+'/5</span>'+(timeLeft!=null?'<span class="tag">⏳ '+timeLeft+' min</span>':'')+'</div><h3>'+esc(r.name)+'</h3>'+raidArenaMarkup(r,s)+'<p>❤️ '+num(hp)+'/'+num(max)+' • ATK '+num(r.atk)+' • '+num(r.durationMinutes)+' min</p><div class="progress raid-progress"><span style="width:'+pct(hp/max*100)+'%"></span></div><p>🔑 '+money(r.keyPrice)+'</p>'+party+'<div class="raid-actions">'+buttons+'</div></div>';
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
  const participants=Object.values(b.participants||{}).sort((a,z)=>Number(z.damage||0)-Number(a.damage||0));
  const totalDamage=participants.reduce((s,p)=>s+Number(p.damage||0),0);
  const ranking=participants.length?'<div class="boss-ranking"><div class="section-title"><h3>Ranking de dano</h3><small>'+participants.length+' participante(s)</small></div><div class="list">'+participants.slice(0,10).map((p,i)=>'<div class="list-row"><div><strong>#'+(i+1)+' '+esc(p.name||'Jogador')+'</strong><small>'+num(p.attacks||0)+' ataques'+(p.petHealing?' • 🧪 '+num(p.petHealing)+' cura pet':'')+'</small></div><strong>'+num(p.damage||0)+' dano</strong></div>').join('')+'</div></div>':'<div class="empty section">Ainda não houve ataques neste Boss.</div>';
  return '<div class="page-head"><div><h2>'+esc(b.name||'Boss')+'</h2><p>'+esc(b.mode||'common')+' • mesma sessão do WhatsApp</p></div><span class="tag good">ATIVO</span></div>'+
    '<div class="card">'+combatArenaMarkup(b.name||'Boss','boss')+
    '<div class="boss-hp-line"><span>HP do Boss</span><strong>'+num(hp)+'/'+num(max)+'</strong></div><div class="progress boss-progress"><span style="width:'+pct(hp/max*100)+'%"></span></div>'+
    '<div class="grid stats section">'+statCard('DANO TOTAL',num(totalDamage),'grupo')+statCard('PARTICIPANTES',num(participants.length),'jogadores')+'</div>'+
    '<div class="hero-actions"><button class="btn primary" data-boss-attack>⚔️ Atacar</button><button class="btn good" data-boss-auto>'+(ui.bossTimer?'⏸ AUTO ON':'▶ AUTO OFF')+'</button></div>'+ranking+'</div>';
}


function roster(){
  return (currentGroup()&&currentGroup().roster)||[];
}
function resultMetric(label,value,kind='text'){
  const shown=kind==='money'?money(value):kind==='num'?num(value):esc(value);
  return '<div class="result-metric"><small>'+esc(label)+'</small><strong>'+shown+'</strong></div>';
}
function prettyResult(value){
  if(value==null) return '<div class="empty">Sem detalhes adicionais.</div>';
  if(typeof value!=='object') return '<div class="result-message">'+esc(value)+'</div>';
  if(value.ok===false&&Number(value.remaining)>0){
    return '<div class="result-message cooldown-result">⏳ Ação em cooldown. Tente novamente em <strong>'+esc(formatRemaining(value.remaining))+'</strong>.</div>';
  }
  if(value.cooldown&&Number(value.remainingMs)>0){
    return '<div class="result-message cooldown-result">⏳ Combate em cooldown. Aguarde <strong>'+esc(formatRemaining(Number(value.remainingMs)/1000))+'</strong>.</div>';
  }
  const metrics=[];
  const moneyKeys=[['totalCash','Recebido'],['bonusCash','Bônus'],['amount','Valor'],['cash','Dinheiro'],['reward','Recompensa'],['payout','Pagamento'],['profit','Lucro'],['fee','Taxa'],['tax','TAXADE'],['gross','Bruto'],['netTotal','Líquido'],['grossTotal','Bruto total'],['taxTotal','TAXADE total'],['pot','Prêmio']];
  for(const [key,label] of moneyKeys) if(value[key]!=null && Number.isFinite(Number(value[key]))) metrics.push(resultMetric(label,value[key],'money'));
  const numKeys=[['streak','Sequência'],['exp','EXP'],['xp','XP'],['xpGain','XP carreira'],['damage','Dano'],['bossDamage','Dano recebido'],['attempts','Tentativas'],['level','Nível'],['totalShifts','Turnos']];
  for(const [key,label] of numKeys) if(value[key]!=null && (typeof value[key]==='number'||typeof value[key]==='string')) metrics.push(resultMetric(label,value[key],'num'));
  if(value.won===true) metrics.push(resultMetric('Resultado','🏆 Vitória'));
  else if(value.won===false && value.lost===true) metrics.push(resultMetric('Resultado','💀 Derrota'));
  else if(value.correct===true) metrics.push(resultMetric('Resultado','✅ Correto'));
  else if(value.correct===false) metrics.push(resultMetric('Resultado','❌ Incorreto'));
  if(value.result && typeof value.result!=='object') metrics.push(resultMetric('Resultado',titleCase(value.result)));
  if(value.monster) metrics.push(resultMetric('Inimigo',value.monster));
  if(value.rank) metrics.push(resultMetric('Cargo',typeof value.rank==='object'?(value.rank.name||'Novo cargo'):value.rank));
  let details='';
  if(Array.isArray(value.rewards)&&value.rewards.length){
    details+='<div class="result-rewards"><h4>🎁 Recompensas</h4>'+value.rewards.map(r=>'<div class="reward-chip">'+esc(r.name||r.itemId||r.id||'Item')+(r.qty?' ×'+num(r.qty):'')+'</div>').join('')+'</div>';
  }
  if(Array.isArray(value.results)&&value.results.length){
    details+='<div class="result-rewards"><h4>📋 Detalhes</h4>'+value.results.map(r=>'<div class="reward-chip">'+esc(r.label||r.name||r.result||'Ação')+(r.amount!=null?' • '+money(r.amount):'')+(r.cooldown&&Number(r.remaining)>0?' • ⏳ '+esc(formatRemaining(r.remaining)):'')+(r.error?' • '+esc(r.error):'')+'</div>').join('')+'</div>';
  }
  const combat=renderCombatResult(value);
  if(combat) return combat+(metrics.length?'<div class="result-metrics section">'+metrics.join('')+'</div>':'')+details;
  if(metrics.length||details) return (metrics.length?'<div class="result-metrics">'+metrics.join('')+'</div>':'')+details;
  let raw; try{raw=JSON.stringify(value,null,2)}catch{raw=String(value)}
  return '<pre class="result-box">'+esc(raw)+'</pre>';
}
function renderCombatResult(value){
  if(!value||typeof value!=='object') return '';
  if(Array.isArray(value.log)&&value.winner&&value.loser){
    const crits=value.log.filter(x=>x&&x.crit).length;
    const total=value.log.reduce((s,x)=>s+Number(x&&x.dmg||0),0);
    const recent=value.log.slice(-8);
    return '<div class="combat-result">'+
      '<div class="combat-result-head"><div><small>VENCEDOR</small><strong>🏆 '+esc(value.winner.name||'Jogador')+'</strong></div><div><small>RECOMPENSA</small><strong>'+money(value.reward||0)+'</strong></div></div>'+
      '<div class="result-metrics">'+resultMetric('Golpes',value.log.length,'num')+resultMetric('Críticos',crits,'num')+resultMetric('Dano total',total,'num')+'</div>'+
      '<div class="combat-log">'+recent.map(x=>'<div class="combat-hit '+(x.crit?'critical':'')+'"><span>'+esc(x.from||'Jogador')+' → '+esc(x.to||'Alvo')+'</span><strong>'+(x.crit?'💥 CRÍTICO ':'')+num(x.dmg)+' dano</strong></div>').join('')+'</div>'+
    '</div>';
  }
  if(value.winner&&value.loser&&value.rounds!=null&&value.winner.species){
    return '<div class="combat-result"><div class="combat-result-head"><div><small>VENCEDOR PET</small><strong>🐾 '+esc(value.winner.name||value.winner.species)+'</strong></div><div><small>RODADAS</small><strong>'+num(value.rounds)+'</strong></div></div>'+
      '<div class="result-metrics">'+resultMetric('Vencedor','Lv.'+num(value.winner.level))+resultMetric('HP restante',num(value.winner.hp)+'/'+num(value.winner.max_hp))+'</div></div>';
  }
  return '';
}

function resultPanel(){
  if(ui.lastResult==null) return '';
  return '<div class="section card result-card"><div class="section-title"><h3>Resultado</h3><button class="text-btn" data-clear-result>Limpar</button></div>'+prettyResult(ui.lastResult)+'</div>';
}

function memberCard(m){
  return '<div class="card social-card"><h3>'+esc(m.push_name||'Jogador')+'</h3><p>'+num(m.messages||0)+' msgs • '+num(m.commands||0)+' comandos/7d</p>'+
    '<div class="pet-actions"><button class="btn primary" data-battle="'+esc(m.jid)+'">⚔️ Duelo</button><button class="btn" data-petduel="'+esc(m.jid)+'">🐾 Duelo Pet</button><button class="btn" data-coin-duel="'+esc(m.jid)+'">🪙 Cara/Coroa</button><button class="btn" data-rps-duel="'+esc(m.jid)+'">✊ PPT</button><button class="btn danger" data-rob="'+esc(m.jid)+'">🥷 Roubar</button><button class="btn good" data-transfer="'+esc(m.jid)+'">💸 PIX</button><button class="btn" data-loan-offer="'+esc(m.jid)+'">💳 Emprestar</button><button class="btn" data-relationship-propose="'+esc(m.jid)+'">💍 Casar</button><button class="btn good" data-relationship-accept-member="'+esc(m.jid)+'">✓ Aceitar pedido</button></div></div>';
}
function renderSocial(){
  const members=roster().filter(x=>x.jid!==ui.data.identity.jid);
  const rel=ui.data.relationship;
  if(!currentGroup()) return '<div class="notice warn">Conecte usando <b>!web</b> dentro do grupo para liberar interações com outros jogadores.</div>';
  const games=currentGroup().games||{}, me=ui.data.identity.jid;
  const coinPending=games['coin_duel:'+me]||null, rpsPending=games['rps_duel:'+me]||null;
  const pending=(coinPending||rpsPending)?'<div class="section card"><div class="section-title"><h3>Desafios pendentes</h3><small>Mesma sessão do grupo</small></div><div class="hero-actions">'+
    (coinPending?'<button class="btn good" data-coin-duel-accept>🪙 Aceitar Cara/Coroa • '+money(coinPending.amount)+'</button>':'')+
    (rpsPending?'<button class="btn good" data-rps-duel-accept>✊ Aceitar PPT • '+money(rpsPending.amount)+'</button>':'')+
    '</div></div>':'';
  return '<div class="page-head"><div><h2>Social e PvP</h2><p>Duelo, Duelo Pet, apostas PvP, roubo, PIX e empréstimo usam os mesmos jogadores ativos do grupo.</p></div><span class="tag">'+members.length+' jogadores recentes</span></div>'+
    pending+
    '<div class="card"><div class="section-title"><h3>Relacionamento</h3><small>Mesmo estado do WhatsApp</small></div>'+renderRelationship(rel)+(rel?'<div class="hero-actions section"><button class="btn danger" data-relationship-divorce>Divorciar</button></div>':'')+'</div>'+
    '<div class="section grid three">'+(members.length?members.map(memberCard).join(''):'<div class="empty">Nenhum outro jogador ativo nos últimos 7 dias.</div>')+'</div>'+resultPanel();
}

function renderMarket(){
  const ex=ui.extras||{}, market=ex.market||[], mine=ui.data.market||[], inv=ui.data.inventory||[];
  const available=inv.filter(i=>Number(i.quantity)>0 && i.sellable!==false);
  return '<div class="page-head"><div><h2>Mercado</h2><p>Os anúncios são os mesmos do comando !mercado e expiram conforme a regra do bot.</p></div><span class="tag">'+market.length+' ativos</span></div>'+
    '<div class="section-title"><h3>Anúncios ativos</h3><small>'+market.length+'</small></div>'+
    '<div class="grid cards">'+(market.length?market.map(x=>'<div class="card item-card"><div class="item-icon">📣</div><h3>'+esc(x.name)+'</h3><p>'+esc(x.seller_name||'Jogador')+' • x'+num(x.quantity)+' • expira em '+Math.ceil(Number(x.remaining_seconds||0)/60)+' min</p><strong>'+money(x.price)+'</strong><div class="item-actions">'+(x.seller_jid===ui.data.identity.jid?'<button class="btn danger" data-market-cancel="'+x.id+'">Cancelar</button>':'<button class="btn primary" data-market-buy="'+x.id+'">Comprar</button>')+'</div></div>').join(''):'<div class="empty">Nenhum anúncio ativo.</div>')+'</div>'+
    '<div class="section"><div class="section-title"><h3>Meus anúncios</h3><small>'+mine.length+'</small></div><div class="list">'+(mine.length?mine.map(x=>'<div class="list-row"><span>'+esc(x.name)+' x'+num(x.quantity)+'</span><span>'+money(x.price)+' <button class="btn danger" data-market-cancel="'+x.id+'">Cancelar</button></span></div>').join(''):'<div class="empty">Você não tem anúncios ativos.</div>')+'</div></div>'+
    '<div class="section card"><div class="section-title"><h3>Anunciar do inventário</h3><small>'+available.length+' itens disponíveis</small></div>'+
      (available.length?'<div class="market-inventory">'+available.map(i=>'<div class="market-inventory-row"><div><strong>'+esc(i.name)+'</strong><small>x'+num(i.quantity)+(Number(i.price)>0?' • referência '+money(i.price)+' cada':'')+'</small></div><button class="btn primary" data-market-announce="'+esc(i.item_id)+'" data-market-max="'+num(i.quantity)+'" data-market-ref="'+num(i.price||0)+'">Anunciar</button></div>').join('')+'</div>':'<div class="empty">Você não possui itens anunciáveis.</div>')+
    '</div>'+resultPanel();
}

function renderClan(){
  const ex=ui.extras||{}, clan=ex.clan, clans=ex.clans||[], members=roster().filter(x=>x.jid!==ui.data.identity.jid);
  let actions=clan
    ? '<button class="btn good" data-clan-donate>Doar</button><button class="btn danger" data-clan-leave>Sair do clã</button>'
    : '<button class="btn primary" data-clan-create>Criar clã</button><button class="btn good" data-clan-accept>Aceitar convite</button>';
  return '<div class="page-head"><div><h2>Clã</h2><p>Mesma estrutura dos comandos !cla / !criarcla / !claconvidar.</p></div></div>'+
    '<div class="card"><div class="section-title"><h3>'+esc(clan&&clan.name||'Sem clã')+'</h3><small>'+(clan?'Clã sincronizado':'Entre ou crie um clã')+'</small></div>'+renderClanSummary(clan)+'<div class="hero-actions section">'+actions+'</div></div>'+
    (clan?'<div class="section"><div class="section-title"><h3>Convidar / administrar jogadores</h3><small>Ações respeitam sua função no clã</small></div><div class="grid three">'+members.map(m=>'<div class="card"><h3>'+esc(m.push_name)+'</h3><div class="pet-actions"><button class="btn" data-clan-invite="'+esc(m.jid)+'">Convidar</button><button class="btn danger" data-clan-kick="'+esc(m.jid)+'">Expulsar</button><button class="btn" data-clan-transfer="'+esc(m.jid)+'">Promover líder</button></div></div>').join('')+'</div></div>':'')+
    '<div class="section card"><div class="section-title"><h3>Ranking de clãs</h3><small>'+clans.length+' listados</small></div>'+renderClanList(clans)+'</div>'+resultPanel();
}

function gameStatePanel(type,state){
  if(!state) return '<div class="game-state empty">Nenhuma sessão ativa.</div>';
  if(type==='quiz'){
    const opts=Array.isArray(state.a)?state.a:[];
    return '<div class="game-state"><span class="tag '+(state.difficulty==='difícil'?'epic':'')+'">'+esc(state.difficulty||'normal')+'</span><h4>'+esc(state.q||'Quiz ativo')+'</h4>'+
      (opts.length?'<div class="quiz-options">'+opts.map((o,i)=>'<div><b>'+(i+1)+'.</b> '+esc(o)+'</div>').join('')+'</div>':'')+'</div>';
  }
  if(type==='numero') return '<div class="game-state"><strong>🔢 Número entre 1 e 100</strong><small>Tentativas: '+num(state.attempts||0)+'/'+num(state.max||10)+'</small></div>';
  if(type==='forca') return '<div class="game-state"><strong class="hangman-word">'+esc(state.masked||'_ _ _ _')+'</strong><small>Dica: '+esc(state.hint||'—')+' • ❤️ '+num(state.lives||0)+' • Erradas: '+esc((state.wrong||[]).join(', ')||'nenhuma')+'</small></div>';
  if(type==='roulette_group'){
    const players=Object.values(state.players||{});
    return '<div class="game-state"><strong>🎯 Roleta aberta</strong><small>'+num(players.length)+' participante(s) • expira em '+Math.max(0,Math.ceil((Number(state.expiresAt||0)-Date.now())/1000))+'s</small></div>';
  }
  if(type==='tournament'){
    const players=state.players||[];
    return '<div class="game-state"><strong>🏆 Torneio aberto</strong><small>'+num(players.length)+' jogador(es) • entrada '+money(state.amount||0)+'</small></div>';
  }
  return '<div class="game-state"><span class="tag good">ATIVO</span></div>';
}

function renderGames(){
  const games=currentGroup()&&currentGroup().games||{};
  const groupLinked=Boolean(currentGroup());
  return '<div class="page-head"><div><h2>Minigames</h2><p>Resultados e apostas passam pelo mesmo motor do WhatsApp.</p></div><span class="tag '+(groupLinked?'good':'')+'">'+(groupLinked?'GRUPO VINCULADO':'SOLO')+'</span></div>'+
    '<div class="grid three">'+
      '<div class="card game-card"><div class="game-icon">🪙</div><h3>Cara ou Coroa</h3><p>Aposta individual, mesmo saldo real.</p><input class="game-input" data-coin-amount type="number" inputmode="numeric" min="1" value="1000"><div class="choice-row"><button class="btn" data-game-coin-choice="cara">Cara</button><button class="btn" data-game-coin-choice="coroa">Coroa</button></div></div>'+
      '<div class="card game-card"><div class="game-icon">🎰</div><h3>Roleta</h3><p>Aposta individual com escolha.</p><input class="game-input" data-roulette-amount type="number" inputmode="numeric" min="1" value="1000"><div class="choice-row"><button class="btn" data-game-roulette-choice="vermelho">🔴 Vermelho</button><button class="btn" data-game-roulette-choice="preto">⚫ Preto</button></div></div>'+
      '<div class="card game-card"><div class="game-icon">✊</div><h3>Pedra Papel Tesoura</h3><p>Partida rápida contra o sistema.</p><div class="choice-row"><button class="btn" data-game-rps-choice="pedra">✊ Pedra</button><button class="btn" data-game-rps-choice="papel">✋ Papel</button><button class="btn" data-game-rps-choice="tesoura">✌️ Tesoura</button></div></div>'+
      '<div class="card game-card"><div class="game-icon">🏰</div><h3>Dungeon</h3><p>Usa HP, atributos, equipamentos e cooldown reais.</p><button class="btn primary" data-game-dungeon>Entrar</button></div>'+
      '<div class="card game-card"><h3>❓ Quiz do Grupo</h3>'+gameStatePanel('quiz',games.quiz)+'<div class="game-answer"><input class="game-input" data-quiz-input placeholder="Resposta ou número"><button class="btn good" data-quiz-answer>Responder</button></div><button class="btn" data-quiz-start>Iniciar</button></div>'+
      '<div class="card game-card"><h3>🔢 Número</h3>'+gameStatePanel('numero',games.numero)+'<div class="game-answer"><input class="game-input" data-number-input type="number" inputmode="numeric" min="1" placeholder="Seu número"><button class="btn good" data-number-guess>Chutar</button></div><button class="btn" data-number-start>Iniciar</button></div>'+
      '<div class="card game-card"><h3>🔤 Forca</h3>'+gameStatePanel('forca',games.forca)+'<div class="game-answer"><input class="game-input" data-hangman-input placeholder="Letra ou palavra"><button class="btn good" data-hangman-send>Enviar</button></div><button class="btn" data-hangman-start>Iniciar</button></div>'+
      '<div class="card game-card"><h3>🎯 Roleta em Grupo</h3>'+gameStatePanel('roulette_group',games.roulette_group)+'<p class="muted">Criação e entrada continuam disponíveis; formulário avançado será refinado na próxima etapa.</p><div class="pet-actions"><button class="btn" data-group-roulette-create>Criar</button><button class="btn" data-group-roulette-join>Entrar</button><button class="btn good" data-group-roulette-spin>Girar</button></div></div>'+
      '<div class="card game-card"><h3>🏆 Torneio</h3>'+gameStatePanel('tournament',games.tournament)+'<div class="pet-actions"><button class="btn" data-tournament-create>Criar</button><button class="btn" data-tournament-join>Entrar</button><button class="btn good" data-tournament-start>Iniciar</button></div></div>'+
    '</div>'+resultPanel();
}

function renderGroupMissionCard(ex){
  const board=ex.groupMissionLeaderboard||{}, mission=board.mission||ex.groupMission||null, rows=board.rows||[];
  if(!mission) return '<div class="empty">Nenhuma missão coletiva carregada.</div>';
  const target=Math.max(1,Number(mission.target||1)), progress=Number(mission.progress||0);
  return '<div class="section-title"><div><h3>Missão coletiva</h3><small>'+esc(mission.title||mission.mission_type||'Missão')+'</small></div><span class="tag '+(mission.completed?'good':'')+'">'+num(progress)+'/'+num(target)+'</span></div>'+
    '<div class="progress"><span style="width:'+pct(progress/target*100)+'%"></span></div>'+
    '<p>Recompensa total: <strong>'+money(mission.reward_cash||0)+'</strong> • distribuição proporcional à contribuição.</p>'+
    (rows.length?'<div class="list">'+rows.slice(0,10).map(r=>'<div class="list-row"><span>#'+num(r.position)+' '+esc(r.push_name||'Jogador')+'</span><strong>'+num(r.contribution)+' • '+money(r.share||0)+'</strong></div>').join('')+'</div>':'<div class="empty">Ainda sem contribuição registrada.</div>')+
    '<div class="hero-actions"><button class="btn good" data-group-mission-claim>Resgatar minha parte</button></div>';
}
function renderGroupEventCard(ex){
  const e=ex.groupEvent||null, nowSec=Math.floor(Date.now()/1000);
  if(!e || e.claimed || Number(e.expires_at||0)<=nowSec){
    return '<div class="section-title"><h3>Evento relâmpago do grupo</h3><small>Nenhum evento disponível agora</small></div><p>Quando surgir uma maleta, PIX misterioso ou tesouro no grupo, o Web enxergará o mesmo evento.</p>';
  }
  const remain=Math.max(0,Number(e.expires_at||0)-nowSec);
  const labels={maleta:'💼 Maleta de dinheiro',pix:'💸 PIX misterioso',tesouro:'🧰 Pequeno tesouro'};
  return '<div class="section-title"><div><h3>'+esc(labels[e.event_type]||titleCase(e.event_type))+'</h3><small>Evento compartilhado com o WhatsApp</small></div><span class="tag good">'+remain+'s</span></div>'+
    '<p>Recompensa base: <strong>'+money(e.reward_cash||0)+'</strong></p>'+
    '<button class="btn primary" data-group-event-claim>Resgatar agora</button>';
}

function renderExpeditions(rows){
  rows=rows||[];
  if(!rows.length) return '<div class="empty">Nenhum pet em expedição.</div>';
  const nowSec=Math.floor(Date.now()/1000);
  return '<div class="grid cards">'+rows.map(e=>{
    const remain=Math.max(0,Number(e.ends_at||0)-nowSec);
    const h=Math.floor(remain/3600),m=Math.ceil((remain%3600)/60);
    const ready=remain<=0;
    const trait=e.trait||{};
    const bonuses=[];
    if(Number(trait.xp)>0) bonuses.push('+'+Math.round(Number(trait.xp)*100)+'% XP');
    if(Number(trait.cash)>0) bonuses.push('+'+Math.round(Number(trait.cash)*100)+'% dinheiro');
    if(trait.item) bonuses.push('chance de item');
    return '<div class="card expedition-card"><div class="tag-row"><span class="tag '+(ready?'good':'')+'">'+(ready?'PRONTO':'EM EXPEDIÇÃO')+'</span><span class="tag">'+num(e.hours)+'h</span></div>'+
      '<h3>🐾 '+esc(e.pet_name||titleCase(e.species||'pet'))+'</h3>'+
      '<p>'+esc(titleCase(e.species||''))+' • Lv.'+num(e.level||1)+'</p>'+
      '<div class="grid two expedition-rewards"><div><small>XP previsto</small><strong>+'+num(e.pet_xp||0)+'</strong></div><div><small>Dinheiro</small><strong>'+money(e.cash_reward||0)+'</strong></div></div>'+
      '<p class="muted">'+(bonuses.length?bonuses.join(' • '):'Sem bônus especial')+'</p>'+
      '<div class="expedition-time">'+(ready?'✅ Pode resgatar agora':'⏳ Retorna em '+(h>0?h+'h ':'')+m+'min')+'</div></div>';
  }).join('')+'</div>';
}

function renderActivities(){
  const d=ui.data, ex=ui.extras||{}, sleep=d.activities&&d.activities.sleep, carp=d.activities&&d.activities.carpinar;
  const missions=d.dailyMissions||[], exp=d.petExpeditions||[], plans=ex.carpinarPlans||[];
  return renderDoubleRewardEvent()+'<div class="page-head"><div><h2>Atividades</h2><p>Missões, dormir, carpinar, aventura e expedições dos pets.</p></div></div>'+
    '<div class="grid three">'+
      '<div class="card"><h3>😴 Dormir</h3><p>'+(sleep?'Ativo até '+new Date(Number(sleep.ends_at)*1000).toLocaleString('pt-BR'):'Você está acordado.')+'</p><button class="btn '+(sleep?'danger':'primary')+'" data-sleep="'+(sleep?'wake':'start')+'">'+(sleep?'Acordar':'Dormir')+'</button></div>'+
      '<div class="card"><h3>🌱 Carpinar</h3><p>'+(carp?'Ativo • termina em '+Math.ceil((Number(carp.ends_at)-Date.now()/1000)/60)+' min':'Escolha um dos planos reais abaixo.')+'</p>'+(carp?'<button class="btn danger" data-carpinar="leave">Sair</button>':'<div class="choice-row">'+plans.map(p=>'<button class="btn" data-carpinar-hours="'+Number(p.hours)+'">'+num(p.hours)+'h</button>').join('')+'</div>')+'</div>'+
      '<div class="card"><h3>🐾 Aventura Pet</h3><p>Usa o pet ativo e as regras reais.</p><button class="btn primary" data-pet-adventure>Aventura</button><div class="expedition-form"><select data-expedition-pet><option value="">Escolha o pet</option>'+collection().map(p=>'<option value="'+p.id+'">'+esc(p.name)+' • '+esc(titleCase(p.species))+' • Lv.'+num(p.level)+'</option>').join('')+'</select><select data-expedition-hours><option value="2">2h</option><option value="4" selected>4h</option><option value="8">8h</option></select><button class="btn" data-pet-expedition>Enviar</button></div><button class="btn" data-pet-expedition-resolve>Verificar expedições</button></div>'+
    '</div>'+
    '<div class="section card"><div class="section-title"><h3>Missões diárias</h3><button class="btn good" data-missions-claim>Resgatar prontas</button></div>'+renderMissionList(missions)+'</div>'+
    '<div class="section card"><div class="section-title"><h3>Recompensas de nível</h3><button class="btn good" data-level-claim>Resgatar disponíveis</button></div>'+renderLevelRewards(ex.levelRewards,Number(d.profile&&d.profile.level||1),Number(d.profile&&d.profile.last_level_reward||0))+'</div>'+
    (currentGroup()?'<div class="section grid two"><div class="card">'+renderGroupMissionCard(ex)+'</div><div class="card">'+renderGroupEventCard(ex)+'</div></div>':'')+
    '<div class="section card"><div class="section-title"><h3>Expedições</h3><button class="btn good" data-pet-expedition-resolve>Verificar retornos</button></div>'+renderExpeditions(exp)+'</div>'+resultPanel();
}

function renderLevelRewards(rows,level,claimed){
  rows=rows||[];
  if(!rows.length) return '<div class="empty">Nenhuma recompensa de nível configurada.</div>';
  return '<div class="level-rewards">'+rows.map(r=>{
    const unlocked=Number(level)>=Number(r.milestone||0);
    const done=Number(claimed||0)>=Number(r.milestone||0);
    const items=(r.items||[]).map(i=>esc(titleCase(String(i.id||'').replaceAll('_',' ')))+' ×'+num(i.qty)).join(' • ');
    return '<div class="level-reward '+(done?'claimed':unlocked?'unlocked':'locked')+'"><div><span class="tag '+(unlocked?'good':'')+'">LV.'+num(r.milestone)+'</span><strong>'+money(r.cash||0)+'</strong><small>'+esc(items||'Somente dinheiro')+'</small></div><span class="reward-status">'+(done?'✓ Resgatado':unlocked?'🎁 Disponível':'🔒')+'</span></div>';
  }).join('')+'</div>';
}

function renderProgression(){
  const d=ui.data||{}, ex=ui.extras||{}, p=profile(), raw=d.profile||{};
  const streak=d.streak||{}, career=d.career||{}, achievements=d.achievements||[], missions=d.dailyMissions||[];
  const level=Number(raw.level||1), exp=Number(raw.exp||0);
  const claimedLevel=Number(raw.last_level_reward||raw.level_reward_claimed||0);
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
      '<div class="card"><div class="section-title"><h3>Recompensas de nível</h3><button class="btn good" data-level-claim>Resgatar disponíveis</button></div>'+renderLevelRewards(ex.levelRewards,level,claimedLevel)+'</div>'+
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

function renderPatrimonySummary(p){
  p=p||{};
  const parts=[
    ['💵 Carteira',p.cash],['🏦 Banco',p.bank],['🎒 Inventário',p.inventory_value],
    ['🚗 Carros',p.cars_value],['🏍️ Motos/Bikes',p.motorcycles_value],
    ['🏢 Negócios',p.businesses_value],['🏠 Imóvel',p.home_value]
  ];
  return '<div class="grid two patrimony-grid">'+parts.map(x=>'<div class="list-row"><span>'+x[0]+'</span><strong>'+money(x[1])+'</strong></div>').join('')+'</div>'+
    '<div class="patrimony-total"><span>Patrimônio total</span><strong>'+money(p.total)+'</strong></div>';
}
function renderGarageCard(x,kind){
  const isCar=kind==='car';
  return '<div class="card catalog-card"><h3>'+(isCar?'🚗 ':'🏍️ ')+esc(x.name||x.car_name||x.motorcycle_name||x.car_id||x.motorcycle_id)+'</h3>'+
    '<p>Valor de referência: <strong>'+money(x.price||x.price_paid||0)+'</strong></p>'+
    (x.price_paid?'<small>Pago: '+money(x.price_paid)+'</small>':'')+
    '<div class="pet-actions"><button class="btn danger" '+(isCar?'data-car-sell="'+esc(x.id||x.car_id)+'"':'data-moto-sell="'+esc(x.id||x.motorcycle_id)+'"')+'>Vender</button></div></div>';
}
function renderCltStatus(clt){
  const drivers=(clt&&clt.drivers)||[];
  if(!drivers.length) return '<div class="empty">Nenhum motorista CLT contratado.</div>';
  return '<div class="grid cards">'+drivers.map(d=>{
    const t=d.type||{}, car=d.car||null;
    return '<div class="card compact-card"><div class="tag-row"><span class="tag '+(d.active?'good':'')+'">'+(d.active?'EM TURNO':d.finished?'PRONTO PARA COLETAR':'DISPONÍVEL')+'</span><span class="tag">Slot '+num(d.slot||0)+'</span></div>'+
      '<h3>🚕 '+esc(t.name||d.driver_type||'Motorista')+'</h3>'+
      '<p>'+(car?'Carro: '+esc(car.name):'Sem carro alocado')+'</p>'+
      '<p>💰 Acumulado: <strong>'+money(d.accrued||0)+'</strong>'+(d.active?' • ⏳ '+Math.ceil(Number(d.remaining||0)/60)+' min':'')+'</p></div>';
  }).join('')+'</div>';
}
function renderRelationship(rel){
  if(!rel) return '<div class="empty">Nenhum relacionamento ativo.</div>';
  return '<div class="relationship-card"><div><small>PARCEIRO(A)</small><strong>💍 '+esc(rel.partner_name||'Jogador')+'</strong></div>'+
    '<div><small>STATUS</small><strong>Casados</strong></div></div>';
}
function renderClanSummary(clan){
  if(!clan) return '<div class="empty">Você ainda não faz parte de um clã.</div>';
  return '<div class="grid stats">'+
    statCard('NÍVEL',num(clan.level||1),'clã')+
    statCard('MEMBROS',num(clan.members||0),'jogadores')+
    statCard('XP',num(clan.xp||0),'progressão')+
    statCard('COFRE',money(clan.treasury||0),'tesouraria')+
  '</div><p class="muted">Seu cargo: <strong>'+esc(clan.role==='leader'?'Líder':'Membro')+'</strong></p>';
}
function renderClanList(clans){
  if(!clans.length) return '<div class="empty">Nenhum clã cadastrado.</div>';
  return '<div class="list">'+clans.map((x,i)=>'<div class="list-row"><div><strong>#'+(i+1)+' '+esc(x.name||'Clã')+'</strong><small>Lv.'+num(x.level||1)+' • '+num(x.members||0)+' membros • '+num(x.xp||0)+' XP</small></div><strong>'+money(x.treasury||0)+'</strong></div>').join('')+'</div>';
}

function renderEconomy(){
  const d=ui.data, p=d.profile||{}, businesses=d.businesses||[], cars=d.cars||[], bikes=d.motorcycles||[];
  const catalog=ui.catalog||{}, house=d.home, clt=d.cltUber||{};
  return '<div class="page-head"><div><h2>Economia</h2><p>Patrimônio e operações usam as mesmas tabelas e rotinas do bot.</p></div><span class="tag good">'+money(Number(p.cash||0)+Number(p.bank||0))+'</span></div>'+
    '<div class="grid stats">'+statCard('CARTEIRA',money(p.cash),'disponível')+statCard('BANCO',money(p.bank),'saldo')+statCard('CARROS',cars.length,'garagem')+statCard('MOTOS / BIKE',bikes.length,'entregas')+'</div>'+
    '<div class="section grid two">'+
      '<div class="card"><div class="section-title"><h3>Ações rápidas</h3><small>Mesmas rotinas do WhatsApp</small></div><div class="hero-actions"><button class="btn good" data-action="all">⚡ ALL</button><button class="btn primary" data-action="work">💼 Trabalhar</button><button class="btn" data-action="uber">🚗 Uber</button><button class="btn" data-action="ifood">🛵 iFood</button><button class="btn good" data-action="business.collect">🏢 Coletar negócios</button></div><div class="bank-quick"><div><label>Movimentar dinheiro</label><input class="bank-input" data-bank-amount inputmode="numeric" type="number" min="1" placeholder="Digite o valor"></div><div class="hero-actions"><button class="btn" data-deposit>🏦 Depositar</button><button class="btn" data-deposit-all>Depositar tudo</button><button class="btn" data-withdraw>💵 Sacar</button><button class="btn" data-withdraw-all>💸 Sacar tudo</button></div></div></div>'+
      '<div class="card"><div class="section-title"><h3>Patrimônio</h3><small>Mesmo cálculo do !patrimonio</small></div>'+renderPatrimonySummary(d.patrimony)+'</div>'+
    '</div>'+
    '<div class="section"><div class="section-title"><h3>Casa</h3><small>'+(house?esc(house.house_id||house.id||house.name):'Sem casa')+'</small></div><div class="grid cards">'+(catalog.houses||[]).map(x=>'<div class="card catalog-card"><h3>🏠 '+esc(x.name)+'</h3><p>'+money(x.price)+'</p><button class="btn primary" data-house-buy="'+esc(x.id)+'">Comprar</button></div>').join('')+'</div></div>'+
    '<div class="section"><div class="section-title"><h3>Garagem</h3><small>'+cars.length+' veículos</small></div><div class="grid cards">'+(cars.length?cars.map(x=>renderGarageCard(x,'car')).join(''):'<div class="empty">Garagem vazia.</div>')+'</div><div class="grid cards section">'+(catalog.cars||[]).map(x=>'<div class="card catalog-card"><h3>🚘 '+esc(x.name)+'</h3><p>'+money(x.price)+'</p><button class="btn primary" data-car-buy="'+esc(x.id)+'">Comprar</button></div>').join('')+'</div></div>'+
    '<div class="section"><div class="section-title"><h3>Motos e bicicletas</h3><small>'+bikes.length+' na garagem</small></div><div class="grid cards">'+(bikes.length?bikes.map(x=>renderGarageCard(x,'moto')).join(''):'<div class="empty">Nenhuma moto/bike.</div>')+'</div><div class="grid cards section">'+(catalog.motorcycles||[]).map(x=>'<div class="card catalog-card"><h3>🛵 '+esc(x.name)+'</h3><p>'+money(x.price)+'</p><button class="btn primary" data-moto-buy="'+esc(x.id)+'">Comprar</button></div>').join('')+'</div></div>'+
    '<div class="section"><div class="section-title"><h3>Meus negócios</h3><small>'+businesses.length+'</small></div><div class="grid cards">'+(businesses.length?businesses.map(b=>'<div class="card biz-card"><h3>'+esc(b.name||b.business_id)+'</h3><p>Lv.'+num(b.level||1)+'</p><button class="btn" data-business-upgrade="'+esc(b.business_id||b.id)+'">Upar</button></div>').join(''):'<div class="empty">Você ainda não possui negócios.</div>')+'</div><div class="grid cards section">'+(catalog.businesses||[]).map(x=>'<div class="card catalog-card"><h3>🏢 '+esc(x.name)+'</h3><p>'+money(x.price)+' • '+money(x.profitHour)+'/h</p><button class="btn primary" data-business-buy="'+esc(x.id)+'">Comprar</button></div>').join('')+'</div></div>'+
    '<div class="section card"><div class="section-title"><h3>Central Uber CLT</h3><small>Mesmo estado do !centraluber</small></div>'+renderCltStatus(clt)+'<div class="hero-actions section"><button class="btn" data-clt-hire>Contratar motorista</button><button class="btn primary" data-clt-start>Iniciar turno</button><button class="btn good" data-action="cltUber.collect">Coletar</button></div></div>'+
    '<div class="section card"><div class="section-title"><h3>Extrato recente</h3><small>Últimas 20 movimentações do mesmo jogador</small></div>'+renderTransactions(20)+'</div>'+resultPanel();
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
  const renderers={home:renderHome,character:renderCharacter,pets:renderPets,inventory:renderInventory,shop:renderShop,raids:renderRaids,boss:renderBoss,social:renderSocial,market:renderMarket,clan:renderClan,games:renderGames,activities:renderActivities,progression:renderProgression,rankings:renderRankings,economy:renderEconomy,loans:renderLoans};
  $('#content').innerHTML=(renderers[ui.page]||renderHome)();
  bind();
}

function bind(){
  document.querySelectorAll('[data-resync]').forEach(x=>x.onclick=()=>sync(false));
  document.querySelectorAll('[data-character-select]').forEach(x=>x.onclick=()=>{
    ui.characterId=x.dataset.characterSelect;
    localStorage.setItem(CHARACTER_KEY,ui.characterId);
    render();
    toast('Personagem visual alterado.');
  });
  document.querySelectorAll('[data-go-page]').forEach(x=>x.onclick=async()=>{
    ui.page=x.dataset.goPage;
    setMenu(false);
    if(['social','market','clan','games','activities','progression','rankings','loans'].includes(ui.page)) await syncExtras(false).catch(()=>null);
    render();
    window.scrollTo({top:0,left:0,behavior:'auto'});
  });
  document.querySelectorAll('[data-action]').forEach(x=>x.onclick=()=>doAction(x.dataset.action,{},{}));
  document.querySelectorAll('[data-pet-tab]').forEach(x=>x.onclick=()=>{ui.petTab=x.dataset.petTab;render();});
  document.querySelectorAll('[data-pet-team-save]').forEach(x=>x.onclick=()=>{
    const selects=[...document.querySelectorAll('[data-team-slot]')].sort((a,b)=>Number(a.dataset.teamSlot)-Number(b.dataset.teamSlot));
    const slots=selects.map(s=>Number(s.value||0));
    const principal=slots[0]||0,suporte=slots[1]||0,reserva=slots[2]||0;
    if(!principal) return toast('Escolha o pet Principal.');
    if(reserva&&!suporte) return toast('Escolha o Suporte antes da Reserva.');
    const petIds=[principal,suporte,reserva].filter(v=>Number.isInteger(v)&&v>0);
    if(new Set(petIds).size!==petIds.length) return toast('Não use o mesmo pet em dois slots.');
    doAction('pet.team',{petIds,replaceAll:true},{});
  });
  document.querySelectorAll('[data-pet-select]').forEach(x=>x.onclick=()=>doAction('pet.select',{petId:Number(x.dataset.petSelect)},{}));
  document.querySelectorAll('[data-pet-rename]').forEach(x=>x.onclick=()=>{
    const current=(collection().find(p=>p.active)||{}).name||'';
    const input=x.parentElement&&x.parentElement.querySelector('[data-pet-name]');
    const name=String(input&&input.value||'').trim();
    if(!name) return toast('Digite um nome para o pet.');
    if(name===current) return toast('Esse já é o nome do pet.');
    doAction('pet.rename',{name},{});
  });
  document.querySelectorAll('[data-pet-action]').forEach(x=>x.onclick=()=>doAction('pet.action',{action:x.dataset.petAction},{}));
  document.querySelectorAll('[data-pet-adopt]').forEach(x=>x.onclick=()=>{
    const input=x.parentElement&&x.parentElement.querySelector('[data-pet-adopt-name]');
    const name=String(input&&input.value||'').trim();
    if(!name) return toast('Digite o nome do novo pet.');
    doAction('pet.adopt',{species:x.dataset.petAdopt,name},{});
  });
  document.querySelectorAll('[data-pet-summon]').forEach(x=>x.onclick=()=>doAction('pet.summon',{materialId:x.dataset.petSummon},{}));
  document.querySelectorAll('[data-pet-heal]').forEach(x=>x.onclick=()=>doAction('pet.heal',{itemId:x.dataset.petHeal},{}));
  document.querySelectorAll('[data-pet-energy]').forEach(x=>x.onclick=()=>doAction('pet.energy',{},{}));
  document.querySelectorAll('[data-item-equip]').forEach(x=>x.onclick=()=>doAction('item.equip',{itemId:x.dataset.itemEquip},{}));
  document.querySelectorAll('[data-item-upgrade]').forEach(x=>x.onclick=()=>doAction('item.upgrade',{itemId:x.dataset.itemUpgrade},{}));
  document.querySelectorAll('[data-item-use]').forEach(x=>x.onclick=()=>doAction('item.use',{itemId:x.dataset.itemUse},{}));
  document.querySelectorAll('[data-box-open]').forEach(x=>x.onclick=()=>doAction('item.box.open',{boxId:x.dataset.boxOpen,qty:1},{}));
  document.querySelectorAll('[data-box-open-all]').forEach(x=>x.onclick=()=>doAction('item.box.open',{boxId:x.dataset.boxOpenAll,qty:Number(x.dataset.boxQty||1)},{}));
  document.querySelectorAll('[data-lucky-open]').forEach(x=>x.onclick=()=>doAction('item.lucky.open',{qty:Number(x.dataset.luckyOpen||1)},{}));
  document.querySelectorAll('[data-sell-duplicates]').forEach(x=>x.onclick=()=>doAction('item.sellDuplicates',{},{}));
  document.querySelectorAll('[data-item-sell]').forEach(x=>x.onclick=()=>doAction('item.sell',{itemId:x.dataset.itemSell,qty:1},{}));
  document.querySelectorAll('[data-item-sell-all]').forEach(x=>x.onclick=()=>doAction('item.sell',{itemId:x.dataset.itemSellAll,qty:Number(x.dataset.itemSellQty||1)},{}));
  document.querySelectorAll('[data-shop-buy]').forEach(x=>x.onclick=()=>doAction('item.buy',{itemId:x.dataset.shopBuy,qty:1},{}));
  document.querySelectorAll('[data-shop-buy-qty]').forEach(x=>x.onclick=()=>{
    const qty=Math.max(1,Math.min(9999,Number(prompt('Quantidade para comprar:','2'))||0));
    if(!qty) return;
    const unit=Number(x.dataset.shopPrice||0);
    if(unit>0 && Number((ui.data.profile||{}).cash||0)<unit*qty) return toast('Saldo insuficiente para '+qty+' unidade(s).');
    doAction('item.buy',{itemId:x.dataset.shopBuyQty,qty},{});
  });
  document.querySelectorAll('[data-raid-create]').forEach(x=>x.onclick=()=>doAction('raid.create',{level:Number(x.dataset.raidCreate),name:ui.data.profile.push_name},{}));
  document.querySelectorAll('[data-raid-join]').forEach(x=>x.onclick=()=>doAction('raid.join',{level:Number(x.dataset.raidJoin),name:ui.data.profile.push_name},{}));
  document.querySelectorAll('[data-raid-start]').forEach(x=>x.onclick=async()=>{
    const level=Number(x.dataset.raidStart);
    await doAction('raid.start',{level:level},{});
    startRaidAuto(level);
  });
  document.querySelectorAll('[data-raid-cancel]').forEach(x=>x.onclick=()=>doAction('raid.cancel',{level:Number(x.dataset.raidCancel)},{}));
  document.querySelectorAll('[data-raid-round]').forEach(x=>x.onclick=async()=>{
    const level=Number(x.dataset.raidRound);
    const result=await doAction('raid.round',{level},{});
    animateCombatImpact('raid',result,level);
  });
  document.querySelectorAll('[data-raid-auto]').forEach(x=>x.onclick=()=>toggleRaidAuto(Number(x.dataset.raidAuto)));
  document.querySelectorAll('[data-boss-start]').forEach(x=>x.onclick=()=>doAction('boss.start',{},{}));
  document.querySelectorAll('[data-boss-attack]').forEach(x=>x.onclick=async()=>{
    const result=await doAction('boss.attack',{name:ui.data.profile.push_name,usePet:true},{});
    animateCombatImpact('boss',result);
  });
  document.querySelectorAll('[data-boss-auto]').forEach(x=>x.onclick=toggleBossAuto);
  document.querySelectorAll('[data-business-upgrade]').forEach(x=>x.onclick=()=>doAction('business.upgrade',{id:x.dataset.businessUpgrade},{}));
  document.querySelectorAll('[data-deposit]').forEach(x=>x.onclick=()=>{
    const input=document.querySelector('[data-bank-amount]');
    const amount=Math.floor(Number(input&&input.value||0));
    if(amount>0) doAction('deposit',{amount},{});
    else toast('Digite um valor válido para depositar.');
  });
  document.querySelectorAll('[data-deposit-all]').forEach(x=>x.onclick=()=>{
    const amount=Number((ui.data.profile||{}).cash||0);
    if(amount>0) doAction('deposit',{amount:'total'},{});
    else toast('Você não tem dinheiro na carteira para depositar.');
  });
  document.querySelectorAll('[data-withdraw]').forEach(x=>x.onclick=()=>{
    const input=document.querySelector('[data-bank-amount]');
    const amount=Math.floor(Number(input&&input.value||0));
    if(amount>0) doAction('withdraw',{amount},{});
    else toast('Digite um valor válido para sacar.');
  });
  document.querySelectorAll('[data-withdraw-all]').forEach(x=>x.onclick=()=>{
    const amount=Number((ui.data.profile||{}).bank||0);
    if(amount>0) doAction('withdraw',{amount},{});
    else toast('Você não tem saldo no banco para sacar.');
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
  document.querySelectorAll('[data-coin-duel]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Aposta do Cara ou Coroa:','1000'));
    if(!(amount>=10)) return;
    const choice=String(prompt('Escolha: cara ou coroa','cara')||'').trim().toLowerCase();
    if(['cara','coroa'].includes(choice)) doAction('game.coinDuel.create',{targetJid:x.dataset.coinDuel,amount,choice},{});
  });
  document.querySelectorAll('[data-rps-duel]').forEach(x=>x.onclick=()=>{
    const amount=Number(prompt('Aposta do Pedra/Papel/Tesoura:','1000'));
    if(!(amount>=10)) return;
    const choice=String(prompt('Escolha: pedra, papel ou tesoura','pedra')||'').trim().toLowerCase();
    if(['pedra','papel','tesoura'].includes(choice)) doAction('game.rpsDuel.create',{targetJid:x.dataset.rpsDuel,amount,choice},{});
  });
  document.querySelectorAll('[data-coin-duel-accept]').forEach(x=>x.onclick=()=>doAction('game.coinDuel.accept',{},{}));
  document.querySelectorAll('[data-rps-duel-accept]').forEach(x=>x.onclick=()=>{
    const choice=String(prompt('Escolha: pedra, papel ou tesoura','pedra')||'').trim().toLowerCase();
    if(['pedra','papel','tesoura'].includes(choice)) doAction('game.rpsDuel.accept',{choice},{});
  });
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
  document.querySelectorAll('[data-market-announce]').forEach(x=>x.onclick=()=>{
    const itemId=x.dataset.marketAnnounce;
    const maxQty=Math.max(1,Number(x.dataset.marketMax||1));
    const ref=Math.max(0,Number(x.dataset.marketRef||0));
    const qty=Math.min(maxQty,Math.max(1,Number(prompt('Quantidade para anunciar (máx. '+maxQty+'):','1'))||1));
    const suggested=ref>0?ref*qty:1000;
    const price=Number(prompt('Preço total do anúncio:\nSugestão pela referência atual: '+money(suggested),String(suggested)));
    if(price>0) doAction('market.create',{itemId,qty,price},{});
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

  document.querySelectorAll('[data-game-coin-choice]').forEach(x=>x.onclick=()=>{
    const amount=Math.floor(Number((document.querySelector('[data-coin-amount]')||{}).value||0));
    if(amount>0) doAction('game.coinflip',{amount,choice:x.dataset.gameCoinChoice},{}); else toast('Digite uma aposta válida.');
  });
  document.querySelectorAll('[data-game-roulette-choice]').forEach(x=>x.onclick=()=>{
    const amount=Math.floor(Number((document.querySelector('[data-roulette-amount]')||{}).value||0));
    if(amount>0) doAction('game.roulette',{amount,choice:x.dataset.gameRouletteChoice},{}); else toast('Digite uma aposta válida.');
  });
  document.querySelectorAll('[data-game-rps-choice]').forEach(x=>x.onclick=()=>doAction('game.rps',{choice:x.dataset.gameRpsChoice},{}));
  document.querySelectorAll('[data-game-dungeon]').forEach(x=>x.onclick=()=>doAction('dungeon',{},{}));
  document.querySelectorAll('[data-quiz-start]').forEach(x=>x.onclick=()=>doAction('game.quiz.start',{},{}));
  document.querySelectorAll('[data-quiz-answer]').forEach(x=>x.onclick=()=>{
    const answer=String((document.querySelector('[data-quiz-input]')||{}).value||'').trim();
    if(answer) doAction('game.quiz.answer',{answer},{}); else toast('Digite sua resposta.');
  });
  document.querySelectorAll('[data-number-start]').forEach(x=>x.onclick=()=>doAction('game.number.start',{},{}));
  document.querySelectorAll('[data-number-guess]').forEach(x=>x.onclick=()=>{
    const guess=Math.floor(Number((document.querySelector('[data-number-input]')||{}).value||0));
    if(guess>0) doAction('game.number.guess',{guess},{}); else toast('Digite um número válido.');
  });
  document.querySelectorAll('[data-hangman-start]').forEach(x=>x.onclick=()=>doAction('game.hangman.start',{},{}));
  document.querySelectorAll('[data-hangman-send]').forEach(x=>x.onclick=()=>{
    const value=String((document.querySelector('[data-hangman-input]')||{}).value||'').trim();
    if(!value) return toast('Digite uma letra ou palavra.');
    if(value.length===1) doAction('game.hangman.letter',{letter:value},{});
    else doAction('game.hangman.word',{word:value},{});
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
  document.querySelectorAll('[data-carpinar]').forEach(x=>x.onclick=()=>{if(x.dataset.carpinar==='leave') doAction('carpinar.leave',{},{});});
  document.querySelectorAll('[data-carpinar-hours]').forEach(x=>x.onclick=()=>doAction('carpinar.start',{hours:Number(x.dataset.carpinarHours)},{}));
  document.querySelectorAll('[data-pet-adventure]').forEach(x=>x.onclick=()=>doAction('pet.adventure',{},{}));
  document.querySelectorAll('[data-pet-expedition]').forEach(x=>x.onclick=()=>{
    const petId=Number((document.querySelector('[data-expedition-pet]')||{}).value||0);
    const hours=Number((document.querySelector('[data-expedition-hours]')||{}).value||0);
    if(!petId) return toast('Escolha o pet da expedição.');
    if(hours>0) doAction('pet.expedition.start',{petId,hours},{});
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
      animateCombatImpact('raid',result,ui.raidLevel);
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
      const result=await doAction('boss.attack',{name:ui.data.profile.push_name,usePet:true},{quiet:true,afterSync:false});
      await sync(true);
      animateCombatImpact('boss',result);
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
$('#menuBtn').onclick=()=>setMenu(!$('#sidebar').classList.contains('open'));
$('#menuBackdrop').onclick=()=>setMenu(false);
$('#menuBackdrop').addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
document.addEventListener('keydown',e=>{if(e.key==='Escape') setMenu(false);});

document.addEventListener('visibilitychange',()=>{
  if(!document.hidden && ui.token) sync(true);
});

setInterval(()=>{
  if(!document.hidden && ui.token && !ui.syncing) sync(true);
},15000);
setInterval(()=>{
  if(!document.hidden && ui.token) refreshLiveCountdowns();
},1000);

(async function boot(){
  renderNav();
  const linked=new URLSearchParams(location.search).get('link');
  if(linked){
    $('#linkCode').value=linked;
    try{
      await exchange(linked);
      history.replaceState({},document.title,location.pathname||'/');
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
