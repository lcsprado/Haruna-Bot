import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const ui=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const backend=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../web/styles.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../web/sw.js',import.meta.url),'utf8');

test('Garage, events, NPCs, clan preview and live Boss survive the password release',()=>{
  for(const needle of ["['racing','🏎️','Garagem Alpha']","['events','🎉','Eventos']","['npcs','🏘️','NPCs / Comerciantes']",
    "racing:()=>renderRacing(ui)","events:renderEvents","npcs:renderNpcs","loadRacing(false)","loadEventCenter(false)"])
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

test('Cerco routes to dedicated V5/V6 engine while other RPG APIs use primary backend',()=>{
  const config=JSON.parse(readFileSync(new URL('../web/vercel.json',import.meta.url),'utf8'))
  const paths=config.rewrites
  assert.equal(paths[0].source,'/api/v1/me/clan-siege')
  assert.equal(paths[0].destination,'https://alpha-web-api-beta.onrender.com/api/v1/me/clan-siege')
  assert.equal(paths[1].source,'/api/v1/me/clan-siege/:path*')
  assert.equal(paths[1].destination,'https://alpha-web-api-beta.onrender.com/api/v1/me/clan-siege/:path*')
  assert.equal(paths[2].source,'/api/v1/:path*')
  assert.equal(paths[2].destination,'https://alpha-bot-whatsapp-m3lc.onrender.com/api/v1/:path*')
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
  assert.ok(html.includes('href="/styles.css?v=20261113-rich-web-phone-v4"'));
});
