import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const ui=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const backend=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../web/styles.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../web/sw.js',import.meta.url),'utf8');

test('Garage, events, clan preview and live Boss survive the password release without retired NPCs',()=>{
  for(const needle of ["['racing','🏎️','Garagem Alpha']","['events','🎉','Eventos']",
    "racing:()=>renderRacing(ui)","events:renderEvents","loadRacing(false)","loadEventCenter(false)"])
    assert.ok(ui.includes(needle),'UI is missing: '+needle);
  for(const file of ['racing-ui.js','clan-siege-ui.js','version.json'])
    assert.ok(existsSync(new URL('../web/'+file,import.meta.url)),'Missing rich UI module: '+file);
  for(const path of ['/api/v1/me/racing','/api/v1/me/event-center','/api/v1/me/boss-live','/api/v1/me/pet-team-preview','/api/v1/me/relics'])
    assert.ok(backend.includes(path),'Backend missing endpoint: '+path);
  for(const action of ['racing.buy','racing.equip','racing.paint','racing.upgrade','racing.repair','racing.solo','racing.challenge','racing.accept','racing.cancel'])
    assert.ok(backend.includes("case '"+action+"'"),'Missing racing action: '+action);
  assert.ok(css.includes('.race'),'Garage visual CSS not restored');
  assert.ok(manifest.includes('/racing-ui.js'),'PWA not caching garage assets');
});
test('NPCs removidos não retornam na navegação nem em compras Web',()=>{
  assert.ok(!ui.includes("['npcs','🏘️','NPCs / Comerciantes']"));
  assert.ok(!ui.includes('npcs:renderNpcs'));
  assert.ok(!ui.includes("data-npc-buy"));
  assert.ok(!ui.includes("api('/api/v1/me/npcs')"));
  assert.ok(!ui.includes("doAction('npc.buy'"));
  assert.ok(ui.includes("if(page==='npcs')page='shop'"),'Links antigos devem abrir Loja Alpha');
  for(const key of ['renderClanSiegePreview(ui)','loadSiege(true)','checkWebBuild()'])
    assert.ok(ui.includes(key),'Não mexer na interface do Cerco: '+key);
});


test('uma única interface oficial: versão de assets sincronizada e NPC aposentado',()=>{
  const metadata=JSON.parse(readFileSync(new URL('../web/version.json',import.meta.url),'utf8'));
  const version=metadata.assetVersion;
  assert.equal(version,'alpha-web-reboot-20261124-fortress-v2');
  assert.ok(ui.includes("const WEB_ASSET_ID='"+version+"'"),'App e metadados precisam ser a mesma versão');
  assert.ok(html.includes('src="/app.js?v=20261124-fortress-v2"'),'HTML deve invalidar JS antigo');
  assert.ok(html.includes('href="/styles.css?v=20261124-fortress-v2"'),'HTML deve invalidar CSS antigo');
  assert.ok(manifest.includes("const CACHE='alpha-rpg-pwa-20261124-fortress-v2'"),'PWA deve invalidar cache antigo');
  const nav=ui.slice(ui.indexOf('const navItems = ['),ui.indexOf('];',ui.indexOf('const navItems = [')));
  assert.ok(nav.includes("['clan','🛡️','Clã']"),'Clã precisa continuar disponível');
  assert.ok(nav.includes("['racing','🏎️','Garagem Alpha']"),'Garagem precisa continuar disponível');
  assert.doesNotMatch(nav,/npcs|NPC|Comerciantes/,'Funcionalidade aposentada não pode voltar pela navegação');
  assert.doesNotMatch(ui,/function renderNpcs\(/);
  assert.doesNotMatch(ui,/async function loadNpcShops\(/);
});

test('restoring richer interface does not bypass phone/password authentication',()=>{
  for(const id of ['passwordLoginForm','loginPhone','verifiedPhoneHint','registerForm','recoverForm','linkForm'])
    assert.ok(html.includes('id="'+id+'"'),'Login form missing: '+id);
  for(const route of ['/api/v1/auth/login','/api/v1/auth/register','/api/v1/auth/recover','/api/v1/auth/code/status'])
    assert.ok(ui.includes(route),'UI missing secure route: '+route);
  assert.ok(backend.includes('JOIN web_password_accounts'),'Web sessions must be password-linked');
  assert.ok(ui.includes("phone:$('#loginPhone').value"),'Phone must replace editable username login');
  assert.ok(!html.includes('registerUsername'),'Registration must bind only the WhatsApp verified phone');
  assert.ok(!html.includes('loginUsername'),'Username must not be used for login');
  assert.ok(backend.includes('getWebCodeMode'),'WhatsApp code must be checked');
  assert.ok(!ui.includes("api('/api/v1/auth/exchange'"),'UI still uses insecure code-only session creation');
  assert.ok(!ui.includes("ui.token=tokenFromLink"),'UI accepts bearer token via URL query');
});

test('Cerco V5/V6 e demais APIs usam a mesma sessao Web no backend ativo',()=>{
  const config=JSON.parse(readFileSync(new URL('../web/vercel.json',import.meta.url),'utf8'))
  const paths=config.rewrites
  assert.equal(paths.filter(x=>x.source.includes('/api/v1/me/clan-siege')).length,0)
  assert.equal(paths[0].source,'/api/v1/:path*')
  assert.equal(paths[0].destination,'https://alpha-bot-whatsapp.onrender.com/api/v1/:path*')
  assert.equal(JSON.stringify(config).includes('alpha-web-api-beta.onrender.com'),false)
  const api=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
  assert.ok(api.indexOf("url.pathname==='/api/v1/me/clan-siege'")>api.indexOf('const session=await authSession(req)'))
  const siegeUi=readFileSync(new URL('../web/clan-siege-ui.js',import.meta.url),'utf8')
  for(const needle of ['myTurn','nextTurns','rulesVersion','fortress-upgrade','data-siege-preview','data-siege-target'])
    assert.ok(siegeUi.includes(needle),'Cerco V5/V6 interaction missing: '+needle)
  assert.equal(ui.includes("const WEB_BUILD_ID='alpha-siege-v5-20261108'"),true)
})

test('login and game stay styled when a mobile WebView cannot load external CSS',()=>{
  const source=readFileSync(new URL('../web/styles.css',import.meta.url),'utf8');
  const match=html.match(/<style id="alpha-inline-styles">\s*([\s\S]*?)\s*<\/style>/);
  assert.ok(match,'Full stylesheet must be embedded in HTML as a WebView-safe fallback');
  assert.equal(match[1].trim(),source.trim(),'Inline CSS fallback is stale: synchronize with web/styles.css');
  for(const marker of ['.hidden{display:none!important}', '.login-overlay{', '.login-card{', '.app{', '@media(max-width:820px)']){
    assert.ok(match[1].includes(marker),'Lost login/layout fallback: '+marker);
  }
  assert.ok(html.includes('href="/styles.css?v=20261124-fortress-v2"'));
});

test('new !web link cannot restore a previous cached session without a password',()=>{
  const start=ui.indexOf('if(linked){',ui.indexOf('(async function boot(){'))
  const end=ui.indexOf('if(ui.token){',start)
  assert.ok(start>0&&end>start,'Boot route with linked WhatsApp code missing')
  const linkedBranch=ui.slice(start,end)
  for(const required of ["ui.token='';","localStorage.removeItem(TOKEN_KEY);","localStorage.removeItem(SWITCH_PENDING_KEY);","await openWebCode(linked)"]){
    assert.ok(linkedBranch.includes(required),'Missing anti-session-reuse guard: '+required)
  }
  assert.ok(linkedBranch.indexOf("ui.token='';")<linkedBranch.indexOf('await openWebCode(linked)'),
    'Cached session must be removed BEFORE the code-status request')
  assert.ok(ui.includes("const WEB_ASSET_ID='alpha-web-reboot-20261124-fortress-v2'"),
    'Version must invalidate old cached PWA Javascript')
  const hashStart=ui.indexOf("window.addEventListener('hashchange'")
  const hashGuard=ui.slice(hashStart,ui.indexOf('(async function boot(){',hashStart))
  assert.ok(hashStart>=0&&hashGuard.includes("localStorage.removeItem(TOKEN_KEY);")&&hashGuard.includes('showLogin();')&&hashGuard.includes('location.reload();'))
  assert.ok(hashGuard.indexOf("localStorage.removeItem(TOKEN_KEY);")<hashGuard.indexOf('location.reload();'))
})

test('backend rejects old code-only sessions and marks new sessions as password verified',()=>{
  const accounts=readFileSync(new URL('../src/neon/web-password-accounts.js',import.meta.url),'utf8')
  assert.match(backend,/ALTER TABLE web_sessions ADD COLUMN IF NOT EXISTS auth_method TEXT NOT NULL DEFAULT 'legacy'/)
  assert.match(backend,/s\.auth_method=\\'password\\'/)
  assert.match(backend,/json\(res,410,\{ok:false,error:/)
  assert.match(accounts,/web_sessions\(token_hash,jid,chat_jid,expires_at,created_at,last_seen_at,auth_method\)/)
  assert.match(accounts,/VALUES\(\$1,\$2,\$3,\$4,\$5,\$5,'password'\)/)
})
test('Inventário Web mostra níveis individuais e envia a origem exata do upgrade',()=>{
  const source=ui.slice(ui.indexOf('function inventoryEquipmentCopies('),ui.indexOf('function inventoryCard('));
  assert.ok(source.length>0);
  const split=new Function(source+'; return inventoryEquipmentCopies')();
  const item={item_id:'garras_vazio',category:'weapon',quantity:2,equipped:true,equipment_level:5,upgrade_distribution:[{level:5,quantity:1},{level:2,quantity:1}]};
  const before=split(item);
  assert.equal(before.equipped[0].equipment_level,5);
  assert.equal(before.available[0].equipment_level,2);
  const after=split({...item,equipment_level:10,upgrade_distribution:[{level:10,quantity:1},{level:5,quantity:1}]});
  assert.equal(after.equipped[0].equipment_level,10);
  assert.equal(after.available[0].equipment_level,5);
  const identical=split({...item,upgrade_distribution:[{level:5,quantity:2}]});
  assert.equal(identical.available[0].quantity,1);
  const sale=split({...item,quantity:3,sellable_quantity:2,upgrade_distribution:[{level:5,quantity:1},{level:3,quantity:1},{level:2,quantity:1}]});
  assert.equal(sale.available.find(c=>c.equipment_level===3).sellable_quantity,0);
  assert.equal(sale.available.find(c=>c.equipment_level===2).quantity,1);
  assert.equal(sale.equipped[0].equipment_level,5);
  const forged=split({...item,upgrade_distribution:[{level:9,quantity:1,stars:5},{level:10,quantity:1}]});
  assert.equal(forged.equipped[0].sourceKind,'star');
  assert.equal(forged.available[0].sourceKind,'normal');
  assert.ok(ui.includes('sourceLevel:Number(x.dataset.sourceLevel)'));
  assert.ok(ui.includes('sourceKind:x.dataset.sourceKind'));
  assert.ok(backend.includes("body.sourceKind==='star'?'star':'normal'"));
});

test('Inventário exibe atributos reais de cada cópia sem confundir o nível base',()=>{
  const source=ui.slice(ui.indexOf('function inventoryEquipmentCopies('),ui.indexOf('function inventoryCard('));
  const split=new Function(source+';return inventoryEquipmentCopies')();
  const item={item_id:'garras_vazio',category:'weapon',quantity:3,equipped:true,equipment_level:10,upgrade_distribution:[{level:10,quantity:2,stats:{level:10,stars:1,atk:128}},{level:5,quantity:1,stats:{level:5,stars:1,atk:78}}]};
  const copies=split(item);
  assert.equal(copies.equipped[0].equipment_stats.atk,128);
  assert.equal(copies.available.find(c=>c.equipment_level===10).equipment_stats.atk,128);
  assert.equal(copies.available.find(c=>c.equipment_level===5).equipment_stats.atk,78);
  const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
  assert.ok(db.includes('stats:equipmentStatsAtLevel(r.item_id,t.level,t.stars||1)'));
  assert.ok(ui.includes('Atributos-base (Lv.1)'));
  const markupSource=ui.slice(ui.indexOf('function inventoryLeveledStatsMarkup('),ui.indexOf('function inventorySaleLimit('));
  const markup=new Function('num',markupSource+';return inventoryLeveledStatsMarkup')(String);
  assert.match(markup(copies.equipped[0],true),/Lv\.10.*128 ATK/);
  assert.match(markup(copies.available.find(c=>c.equipment_level===5)),/Lv\.5.*78 ATK/);
});
