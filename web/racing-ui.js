// Garagem Alpha visual: fotos compactas com pinturas pré-renderizadas.
const models={gol:{name:'Gol Quadrado',tone:'#4caaff',shadow:'#193f92',roof:'M131 105 L174 60 L323 60 L379 105Z',window:'M155 102 L183 71 L318 71 L352 102Z',tag:'CLÁSSICO'},uno:{name:'Uno Mille',tone:'#ffce5c',shadow:'#ae5b21',roof:'M143 105 L161 48 L297 48 L344 105Z',window:'M162 102 L179 62 L292 62 L324 102Z',tag:'ARRANCADA'},corsa:{name:'Corsa Wind',tone:'#92e7ce',shadow:'#146e73',roof:'M118 106 Q165 60 214 59 L321 64 Q345 71 378 106Z',window:'M156 102 Q187 73 222 72 L308 77 L347 102Z',tag:'CURVAS'},palio:{name:'Palio Fire',tone:'#f58da4',shadow:'#9d365d',roof:'M120 107 Q158 59 208 55 L296 59 Q344 70 382 107Z',window:'M154 103 Q183 72 219 70 L297 76 Q318 85 350 103Z',tag:'VELOCIDADE'}}
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
const brl=x=>Number(x||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0})
const num=x=>Number(x||0).toLocaleString('pt-BR')
const partNames={motor:'Motor',cambio:'Câmbio',pneus:'Pneus',suspensao:'Suspensão',freios:'Freios',turbo:'Turbo'}
const partIcons={motor:'🔧',cambio:'⚙️',pneus:'🛞',suspensao:'🛠️',freios:'🛑',turbo:'💨'}
const statLabels={speed:'Velocidade',accel:'Arrancada',grip:'Aderência',brake:'Frenagem'}
const statIcons={speed:'⚡',accel:'🚀',grip:'🛞',brake:'🛑'}
const colors=['#4caaff','#ffce5c','#92e7ce','#f58da4']
function paintColor(r,car){return r.catalog.colors?.find(c=>c.id===(car?.color_id||'prata'))?.hex||null}
const clockEnd=seconds=>{const m=Math.max(0,Math.ceil((Number(seconds||0)-Date.now()/1000)/60));return m>=60?Math.floor(m/60)+'h '+m%60+'min':m+'min'}
const clockNode=seconds=>'<span data-race-timer="'+Math.floor(Number(seconds)||0)+'">'+clockEnd(seconds)+'</span>'
export function updateRacingClocks(){if(typeof document==='undefined')return;document.querySelectorAll('[data-race-timer]').forEach(el=>{el.textContent=clockEnd(el.dataset.raceTimer)})}
function carArt(model,upgrades={},large=false,colorHex=null){
 const d=models[model]||models.gol
 const colorId=Object.entries({prata:'#BFC4CC',branco:'#F3F4F6',preto:'#242A34',cinza:'#777E8A',vermelho:'#D8333F',azul:'#2979D6',verde:'#3EAD6A',amarelo:'#E8BD32',laranja:'#EF8732',roxo:'#8650C9',rosa:'#E888B7',dourado:'#CBA63A'}).find(([,hex])=>hex.toLowerCase()===String(colorHex).toLowerCase())?.[0]||'prata'
 const asset='/assets/racing/'+(models[model]?model:'gol')+'-'+colorId+'.webp'
 return '<img class="race-car-photo" src="'+asset+'" alt="'+esc(d.name)+' na cor selecionada" loading="'+(large?'eager':'lazy')+'" decoding="async">'
}
function statValues(car,catalog){
 const base=(catalog.cars||[]).find(m=>m.id===car.model_id)
 const values={...(base?.stats||{speed:0,accel:0,grip:0,brake:0})}
 for(const p of catalog.parts||[]){
  const level=Math.max(0,Number(car.upgrades?.[p.id]||0))
  for(const [key,boost] of Object.entries(p.benefit||{}))values[key]=(values[key]||0)+level*Number(boost)
 }
 return values
}
function pilotLevel(exp){
 let left=Math.max(0,Number(exp||0)),n=1
 while(n<50&&left>=100+40*(n-1)){left-=100+40*(n-1);n++}
 return n
}
function bar(value,max=100,type=''){
 const pct=Math.min(100,Math.max(0,Number(value||0)/Math.max(1,max)*100))
 return '<div class="race-meter '+type+'"><span style="width:'+pct.toFixed(1)+'%"></span></div>'
}
function carStats(car,catalog){
 const vals=statValues(car,catalog)
 return '<div class="race-stat-grid">'+Object.keys(statLabels).map(k=>
  '<div><div class="race-stat-heading"><span>'+statIcons[k]+' '+statLabels[k]+'</span><b>'+num(vals[k])+'</b></div>'+bar(vals[k],220)+'</div>').join('')+'</div>'
}
function button(label,action,payload='',disabled=false,primary=false){
 return '<button type="button" class="race-button'+(primary?' primary':'')+'" data-race-act="'+esc(action)+'" data-race-value="'+esc(payload)+'" '+(disabled?'disabled':'')+'>'+label+'</button>'
}
function carTile(model,owned,equipped,catalog){
 const d=models[model.id]||models.gol
 return '<div class="race-model-card '+(owned?'owned ':'')+(equipped?'selected':'')+'">'+
 '<div class="race-model-badge">'+esc(d.tag)+' '+(equipped?'• EM USO':owned?'• NA GARAGEM':'')+'</div>'+
 '<div class="race-car-preview">'+carArt(model.id,owned?.upgrades||{},false,paintColor({catalog},owned))+'</div><h4>'+esc(model.name)+'</h4>'+
 '<div class="race-model-spec">⚡ '+model.stats.speed+' <span>•</span> 🚀 '+model.stats.accel+' <span>•</span> 🛞 '+model.stats.grip+'</div>'+
 '<div class="race-tile-bottom"><b>'+brl(model.price)+'</b>'+
 (owned?(equipped?'<span class="race-green">✓ Equipado</span>':button('Equipar','equip',owned.id))+button('Pintura','openPaint',owned.id):button('Comprar','buy',model.id,false,true))+
 '</div></div>'
}
function formatTab(ui,tab,label){return '<button class="race-tab '+(ui.racingTab===tab?'active':'')+'" data-race-tab="'+tab+'">'+label+'</button>'}
function garagePage(ui,r){
 const cars=r.garage.cars||[],catalog=r.catalog
 const equipped=cars.find(c=>c.equipped)
 return '<div class="race-section-heading"><div><small>01 / SUA FROTA</small><h3>Minha garagem</h3></div><span class="race-subtle">'+cars.length+'/4 veículos</span></div>'+
 (cars.length?'<div class="race-fleet">'+cars.map(car=>{
  const st=racingTuning(car),p=models[car.model_id]||models.gol
  return '<article class="race-fleet-card '+(car.equipped?'equipped':'')+'"><div class="race-fleet-top"><b>'+esc(p.name)+'</b><span>'+(car.equipped?'● CARRO ATIVO':'ID #'+esc(car.id))+'</span></div>'+
  '<div class="race-fleet-visual">'+carArt(car.model_id,car.upgrades,false,paintColor(r,car))+'</div>'+carStats(car,catalog)+
  '<div class="race-progress-line"><span>🔧 Preparação <b>'+st+'/42</b></span><span>❤️ Condição <b>'+car.condition+'%</b></span></div>'+
  bar(st,42,'upgrade')+'<div class="race-fleet-actions">'+(car.pending_part?
    '<span class="race-warning">⏳ '+esc(partNames[car.pending_part]||car.pending_part)+' Nv.'+car.pending_level+' · '+clockNode(car.pending_until)+'</span>':
    car.equipped?'<span class="race-green">✓ Pronto para correr</span>':button('Equipar carro','equip',car.id,false,true))+
  button('Personalizar','openPaint',car.id)+'</div></article>'
 }).join('')+'</div>':'<div class="race-empty">🏁 <b>Sua garagem está vazia.</b><p>Escolha o primeiro carro. O dinheiro investido na preparação faz a diferença nas pistas.</p></div>')+
 '<div class="race-section-heading race-gap"><div><small>02 / CONCESSIONÁRIA</small><h3>Escolha seu projeto</h3></div></div>'+
 '<div class="race-model-grid">'+(catalog.cars||[]).map(m=>carTile(m,cars.find(c=>c.model_id===m.id),equipped?.model_id===m.id,catalog)).join('')+'</div>'+
 '<p class="race-footnote">Os quatro custam o mesmo e podem receber as 42 melhorias. Carros do Uber não participam dessas corridas.</p>'
}
function racingTuning(car){return Object.values(car?.upgrades||{}).reduce((s,l)=>s+Number(l||0),0)}
function workshopPage(ui,r){
 const cars=r.garage.cars||[],car=cars.find(c=>c.equipped),levels=r.catalog.levels||[]
 if(!car)return '<div class="race-empty"><h3>🔧 Sua oficina aguarda um carro.</h3><p>Compre e equipe um veículo na aba Garagem para começar.</p></div>'
 const tuning=racingTuning(car),pending=cars.some(c=>c.pending_part)
 const pendingCar=cars.find(c=>c.pending_part)
 return '<div class="race-section-heading"><div><small>OFICINA DE PREPARAÇÃO</small><h3>'+esc((models[car.model_id]||models.gol).name)+'</h3></div><span class="race-subtle">'+tuning+'/42 upgrades</span></div>'+
 '<div class="race-shop-hero"><div>'+carArt(car.model_id,car.upgrades,true,paintColor(r,car))+'</div><div class="race-shop-details"><b>Investimento que vira desempenho</b>'+
 '<p>Cada peça possui sete níveis. Somente uma instalação pode estar em andamento na garagem inteira.</p>'+
 (pendingCar?'<div class="race-build-status">🔧 Instalando '+esc(partNames[pendingCar.pending_part]||pendingCar.pending_part)+' Nv.'+Number(pendingCar.pending_level)+'<br><strong>⏳ '+clockNode(pendingCar.pending_until)+'</strong></div>':
 '<div class="race-green">● Oficina disponível</div>')+'</div></div>'+
 '<div class="race-part-grid">'+(r.catalog.parts||[]).map(p=>{
 const lv=Number(car.upgrades?.[p.id]||0),next=levels[lv],max=lv>=7
 return '<article class="race-part"><div class="race-part-title"><img class="race-part-image" src="/assets/racing/'+esc(p.id)+'.svg" alt="" loading="lazy"><div><b>'+esc(partNames[p.id]||p.id)+'</b><small>Nível '+lv+' / 7</small></div><span class="race-part-bonus">'+Object.entries(p.benefit||{}).map(([k,v])=>'+'+v+' '+(statLabels[k]||k)).join(' • ')+'</span></div>'+
 bar(lv,7,'upgrade')+
 (!max?'<div class="race-part-gains">'+Object.entries(p.benefit||{}).map(([k,v])=>'<span>'+esc(statLabels[k]||k)+' <b>'+num(statValues(car,r.catalog)[k])+' → '+num(statValues(car,r.catalog)[k]+Number(v))+'</b></span>').join('')+'</div>':'')+
 '<div class="race-part-action"><div>'+(max?'<span class="race-green">✓ MÁXIMO</span>':'<strong>'+brl(next?.price)+'</strong><small>⏳ '+(next?.seconds>=3600?num(next.seconds/3600)+' h':next?.seconds/60+' min')+'</small>')+'</div>'+
 (max?'':button('Melhorar','upgrade',p.id,Boolean(pending),true))+'</div></article>'
 }).join('')+'</div>'+
 '<div class="race-repair"><div><b>🧰 Revisão e reparo</b><p>Condição atual: '+car.condition+'/100. Desgaste reduz a performance e pode impedir corridas.</p>'+bar(car.condition,100,car.condition<50?'danger':'')+'</div>'+button('Reparar agora','repair','',Boolean(pending)||car.condition>=100)+'</div>'+
 '<p class="race-footnote">Preparação completa de um carro: '+brl(r.catalog.totalUpgradeCost+150000)+' (incluindo aquisição). O tempo continua passando mesmo com o aplicativo fechado.</p>'
}
function paintPage(ui,r){
 const cars=r.garage.cars||[],car=cars.find(c=>String(c.id)===String(ui.racingPaintCarId))||cars.find(c=>c.equipped)||cars[0]
 if(!car)return '<div class="race-empty"><h3>🎨 Escolha seu primeiro carro</h3><p>A pintura fica disponível após a compra.</p></div>'
 const colors=r.catalog.colors||[],selected=colors.find(c=>c.id===ui.racingPreviewColor)||colors.find(c=>c.id===car.color_id)||colors[0]
 return '<div class="race-section-heading"><div><small>PINTURA E PERSONALIZAÇÃO</small><h3>'+esc(models[car.model_id]?.name||'Carro')+'</h3></div><span class="race-subtle">ID #'+esc(car.id)+'</span></div>'+
 '<div class="race-paint-layout"><div class="race-paint-stage">'+carArt(car.model_id,car.upgrades,true,selected?.hex||paintColor(r,car))+'<strong>'+esc(selected?.name||'Prata')+'</strong><small>Prévia antes de salvar • desempenho inalterado</small></div>'+
 '<div class="race-paint-controls"><h4>Escolha seu carro</h4><div class="race-paint-cars">'+cars.map(c=>'<button type="button" class="race-paint-car '+(String(c.id)===String(car.id)?'active':'')+'" data-race-paint-car="'+esc(c.id)+'">'+esc(models[c.model_id]?.name||c.model_id)+'</button>').join('')+'</div>'+
 '<h4>12 pinturas disponíveis</h4><div class="race-swatches">'+colors.map(c=>'<button type="button" class="race-swatch '+(selected?.id===c.id?'active':'')+'" data-race-color="'+esc(c.id)+'" aria-label="'+esc(c.name)+'"><i style="background:'+esc(c.hex)+'"></i>'+esc(c.name)+'</button>').join('')+'</div>'+
 button('Salvar pintura','paint',car.id,!selected||selected.id===car.color_id||ui.racingBusy,true)+'<p>A pintura é gratuita e aparece também no WhatsApp.</p></div></div>'
}
function raceLeagues(ui,r,level,tuning){
 return '<div class="race-leagues">'+(r.catalog.tiers||[]).map(t=>{
 const unlocked=t.minTuning<=tuning&&t.minDriver<=level
 return '<button type="button" class="race-league '+(ui.racingTier===t.id?'chosen':'')+'" data-race-choice="tier" data-race-value="'+t.id+'"><span>'+esc(t.name)+'</span><b>'+brl(t.prize)+'</b><small>'+(!unlocked?'🔒 ':'')+'Peças '+t.minTuning+'/42 • Piloto Nv.'+t.minDriver+'</small></button>'
 }).join('')+'</div>'
}
function optionButtons(items,key,selected){return '<div class="race-choice-grid">'+items.map(o=>
 '<button type="button" class="race-choice '+(selected===o.id?'active':'')+'" data-race-choice="'+key+'" data-race-value="'+o.id+'">'+esc(o.name)+'</button>').join('')+'</div>'}
function racesPage(ui,r){
 const car=r.garage.cars?.find(c=>c.equipped),level=pilotLevel(r.garage.profile?.xp),tuning=racingTuning(car)
 const chosenTier=(r.catalog.tiers||[]).find(t=>t.id===ui.racingTier)||r.catalog.tiers?.[0]
 const able=Boolean(car&&!car.pending_part&&Number(car.condition)>=35&&tuning>=chosenTier.minTuning&&level>=chosenTier.minDriver)
 const roster=(ui.data?.group?.roster||[]).filter(m=>m.jid&&m.jid!==ui.data?.identity?.jid)
 return '<div class="race-section-heading"><div><small>03 / PISTAS E DISPUTAS</small><h3>Escolha sua corrida</h3></div><span class="race-subtle">⏱️ Recarga 10 min</span></div>'+
 '<div class="race-panel"><div class="race-panel-header"><h4>🏁 Modo carreira</h4><span>Piloto Nv.'+level+' • '+tuning+'/42</span></div>'+
 '<p>Vença rivais controlados pelo bot, evolua o piloto e abra novas categorias. A preparação continua sendo o fator decisivo.</p>'+
 '<div class="race-mini-title">1. Escolha sua liga</div>'+raceLeagues(ui,r,level,tuning)+
 '<div class="race-mini-title">2. Escolha a pista</div>'+optionButtons(r.catalog.tracks||[],'track',ui.racingTrack)+
 '<div class="race-mini-title">3. Estilo de pilotagem</div>'+optionButtons(r.catalog.strategies||[],'strategy',ui.racingStrategy)+
 (!car?'<p class="race-warning">Você precisa comprar e equipar um carro antes de correr.</p>':car.pending_part?'<p class="race-warning">Carro na oficina: '+clockNode(car.pending_until)+'</p>':car.condition<35?'<p class="race-warning">Repare seu carro: a condição está abaixo de 35%.</p>':'')+
 '<button class="race-start" type="button" data-race-act="solo" '+(able?'':'disabled')+'>🏁 INICIAR CORRIDA <span>'+brl(chosenTier?.prize||0)+' em caso de vitória</span></button></div>'+
 '<div class="race-panel race-pvp"><div class="race-panel-header"><h4>⚔️ Desafie outro piloto</h4><span>Sem aposta</span></div>'+
 '<p>Corridas PvP usam os carros reais de cada jogador. Os dois recebem XP e desgaste. A classificação registra a vitória.</p>'+
 (ui.data?.identity?.groupLinked?'<label class="race-form-label" for="race-target">Escolha um piloto do seu grupo</label><select id="race-target" data-race-target>'+
 '<option value="">Selecione um jogador</option>'+roster.map(m=>'<option value="'+esc(m.jid)+'" '+(ui.racingTarget===m.jid?'selected':'')+'>'+esc(m.push_name||m.jid.split('@')[0])+'</option>').join('')+'</select>'+
 button('⚔️ Enviar desafio','challenge','',!ui.racingTarget||!able,true):
 '<p class="race-warning">Conecte o Alpha Web a um grupo com !web para disputar corridas PvP.</p>')+
 (r.challenges?.length?'<div class="race-pending"><b>Desafios pendentes</b>'+r.challenges.map(c=>{
 const mine=c.challenger===ui.data?.identity?.jid
 return '<div><span>'+esc(mine?'Aguardando adversário':(c.challenger_name||'Jogador')+' desafiou você')+' • '+clockNode(c.expires_at)+'</span>'+
 (mine?button('Cancelar','cancel',''):button('Aceitar','accept','',!able,true))+'</div>'
 }).join('')+'</div>':'')+
 '</div>'+
 (ui.racingLast&&ui.racingLast.type==='solo'?'<div class="race-result '+(ui.racingLast.value.won?'win':'loss')+'">'+
 '<small>RESULTADO DA ÚLTIMA CORRIDA</small><h3>'+(ui.racingLast.value.won?'🏆 VITÓRIA!':'🏁 DERROTA')+'</h3>'+
 '<p>Seu carro: '+Number(ui.racingLast.value.own).toFixed(1)+' pts • Rival: '+Number(ui.racingLast.value.rival).toFixed(1)+' pts</p>'+
 '<div>💰 '+brl(ui.racingLast.value.cash)+' &nbsp; ✨ +'+num(ui.racingLast.value.xp)+' XP</div></div>':'')
}
function rankPage(ui,r){
 const profile=r.garage.profile||{}
 const top=(r.ranking||[]).slice(0,12)
 return '<div class="race-section-heading"><div><small>04 / COMPETIÇÃO</small><h3>Hall da velocidade</h3></div></div>'+
 '<div class="race-driver-card"><span>👨‍✈️ SEU PILOTO</span><h3>Nível '+pilotLevel(profile.xp||0)+'</h3><p>'+num(profile.xp||0)+' XP acumulados</p>'+
 '<div class="race-driver-stats"><span>🏆 '+num(profile.wins||0)+' vitórias</span><span>🏁 '+num(profile.races||0)+' disputas</span><span>💸 '+brl(profile.spent||0)+' investidos</span></div></div>'+
 '<div class="race-panel"><div class="race-panel-header"><h4>🏆 Ranking dos pilotos</h4><span>Vitórias e experiência</span></div>'+
 (top.length?top.map((p,i)=>'<div class="race-leader-row"><span class="race-leader-rank">'+(i<3?['🥇','🥈','🥉'][i]:'#'+(i+1))+'</span><div><b>'+esc(p.push_name||'Piloto')+'</b><small>Nível '+pilotLevel(p.xp)+'</small></div><span>'+num(p.wins)+' V / '+num(p.losses)+' D</span></div>').join(''):'<p class="race-subtle">Ainda não há pilotos classificados.</p>')+'</div>'+
 '<div class="race-panel"><div class="race-panel-header"><h4>📜 Últimas corridas</h4></div>'+
 ((r.history||[]).length?r.history.map(x=>'<div class="race-leader-row"><span>'+(x.won?'🏆':'🏁')+'</span><div><b>'+(x.won?'Vitória':'Derrota')+' • '+esc(x.tier_id)+'</b><small>'+esc(x.track_id)+' • '+num(x.reward_xp)+' XP</small></div><span>'+brl(x.reward_cash)+'</span></div>').join(''):'<p class="race-subtle">Nenhuma corrida ainda.</p>')+'</div>'
}
export function renderRacing(ui){
 const r=ui.racing
 if(ui.racingLoading&&!r)return '<div class="race-loading"><span>🏎️</span><h3>Abrindo a Garagem Alpha...</h3><p>Buscando seus carros e a oficina.</p></div>'
 if(!r)return '<div class="race-loading"><span>🏎️</span><h3>Garagem indisponível</h3><p>Não foi possível consultar o servidor de corridas.</p><button class="race-button primary" data-race-act="refresh">Tentar novamente</button></div>'
 const equipped=r.garage.cars?.find(c=>c.equipped)
 const model=equipped?.model_id||'gol'
 const display=(models[model]||models.gol).name
 const level=pilotLevel(r.garage.profile?.xp)
 const tuning=racingTuning(equipped)
 return '<div class="race-shell">'+
 '<header class="race-hero"><div class="race-hero-glow"></div><div class="race-hero-copy"><small>ALPHA RACING · GARAGEM OFICIAL</small><h2>CONSTRUA.<br><em>PREPARE.</em><br>VENÇA.</h2><p>Quatro carros, 42 melhorias e uma regra: desempenho de verdade custa investimento.</p>'+
 '<div class="race-hero-tags"><span>👨‍✈️ PILOTO NV.'+level+'</span><span>🔧 '+tuning+'/42</span><span>🏆 '+num(r.garage.profile?.wins||0)+' VITÓRIAS</span></div></div>'+
 '<div class="race-hero-showroom"><div class="race-hero-track"></div>'+carArt(model,equipped?.upgrades,true,paintColor(r,equipped))+'<div class="race-hero-car-name">'+esc(display)+'<span>'+(equipped?'SEU CARRO EQUIPADO':'COMECE SUA GARAGEM')+'</span></div></div></header>'+
 '<nav class="race-tabs" aria-label="Seções da Garagem Alpha">'+
 formatTab(ui,'garage','🚗 Meus Carros')+formatTab(ui,'workshop','🔧 Oficina')+formatTab(ui,'paint','🎨 Pintura')+
 formatTab(ui,'races','🏁 Corridas')+formatTab(ui,'rank','📜 Histórico / Ranking')+'</nav>'+
 '<div class="race-inner">'+(ui.racingTab==='workshop'?workshopPage(ui,r):ui.racingTab==='paint'?paintPage(ui,r):ui.racingTab==='races'?racesPage(ui,r):ui.racingTab==='rank'?rankPage(ui,r):garagePage(ui,r))+
 '<div class="race-bottom"><span>🏎️ ALPHA RACING</span><button class="race-text-link" type="button" data-race-act="refresh">↻ Atualizar garagem</button><small>Sincronizado com o WhatsApp • Sem corridas automáticas no navegador</small></div></div></div>'
}
export function bindRacing(ui,{action,refresh,render}){
 document.querySelectorAll('[data-race-tab]').forEach(e=>e.onclick=()=>{
  ui.racingTab=e.dataset.raceTab;render()
 })
 document.querySelectorAll('[data-race-paint-car]').forEach(e=>e.onclick=()=>{ui.racingPaintCarId=e.dataset.racePaintCar;ui.racingPreviewColor='';render()})
 document.querySelectorAll('[data-race-color]').forEach(e=>e.onclick=()=>{ui.racingPreviewColor=e.dataset.raceColor;render()})
 document.querySelectorAll('[data-race-choice]').forEach(e=>e.onclick=()=>{
  const key=e.dataset.raceChoice
  if(key==='tier')ui.racingTier=e.dataset.raceValue
  if(key==='track')ui.racingTrack=e.dataset.raceValue
  if(key==='strategy')ui.racingStrategy=e.dataset.raceValue
  render()
 })
 document.querySelectorAll('[data-race-target]').forEach(e=>e.onchange=()=>{
  ui.racingTarget=e.value
  render()
 })
 document.querySelectorAll('[data-race-act]').forEach(e=>e.onclick=async()=>{
  if(ui.racingBusy)return
  const op=e.dataset.raceAct,arg=e.dataset.raceValue
  if(op==='refresh')return refresh(true)
  if(op==='openPaint'){ui.racingPaintCarId=arg;ui.racingPreviewColor='';ui.racingTab='paint';render();return}
  const cfg={buy:['racing.buy',{modelId:arg}],equip:['racing.equip',{carId:arg}],upgrade:['racing.upgrade',{partId:arg}],
   paint:['racing.paint',{carId:arg,colorId:ui.racingPreviewColor}],
   repair:['racing.repair',{}],solo:['racing.solo',{tier:ui.racingTier,track:ui.racingTrack,strategy:ui.racingStrategy}],
   challenge:['racing.challenge',{targetJid:ui.racingTarget,track:ui.racingTrack,strategy:ui.racingStrategy}],
   accept:['racing.accept',{strategy:ui.racingStrategy}],cancel:['racing.cancel',{}]}
  if(!cfg[op])return
  if(op==='buy'&&!confirm('Comprar '+(models[arg]?.name||'o carro')+' por '+brl(150000)+'?'))return
  if(op==='upgrade'){
   const c=ui.racing?.garage?.cars?.find(x=>x.equipped)
   const lv=Number(c?.upgrades?.[arg]||0),next=ui.racing?.catalog?.levels?.[lv]
   if(!next||!confirm('Instalar '+(partNames[arg]||arg)+' nível '+next.level+' por '+brl(next.price)+'? A oficina ficará ocupada.'))return
  }
  await action(...cfg[op],op)
 })
}
