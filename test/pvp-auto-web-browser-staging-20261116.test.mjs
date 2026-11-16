import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const safe=(()=>{
 try{
  const u=new URL(process.env.DATABASE_URL||'');
  return process.env.ALPHA_PVP_WEB_STAGING==='1' &&
   ['localhost','127.0.0.1'].includes(u.hostname) &&
   u.pathname==='/alpha_pvp_web_stage';
 }catch{return false}
})();
test('real Alpha Web UI login on localhost, without any Render or Vercel production routing',{skip:!safe},async t=>{
 const {chromium}=await import('playwright');
 const {db,initDatabase,initCommunityPack,ensureUser}=await import('../src/neon/db.js');
 const {initPlayableHeroes}=await import('../src/neon/playable-heroes.js');
 const {initAwakening}=await import('../src/neon/awakening.js');
 const {initEnchantments}=await import('../src/neon/enchantments-alpha.js');
 const {handleWebApi,createWebLinkCode}=await import('../src/neon/web-api.js');
 const {registerWebPassword}=await import('../src/neon/web-password-accounts.js');
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../web');
 const exts={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',
  css:'text/css; charset=utf-8',svg:'image/svg+xml',png:'image/png',webp:'image/webp',
  jpg:'image/jpeg',webmanifest:'application/manifest+json'};
 const forbiddenSource=await readFile(path.join(root,'vercel.json'),'utf8');
 assert.match(forbiddenSource,/onrender\.com/);
 assert.ok(!process.env.ALPHA_RENDER_API_URL,'No real Render URL permitted');
 const server=createServer(async(req,res)=>{
  try{
   if(await handleWebApi(req,res))return;
   const reqPath=new URL(req.url||'/', 'http://localhost').pathname;
   const file=reqPath==='/'||reqPath==='/rpg'||reqPath==='/rpg/'?'index.html':
    reqPath.replace(/^\/rpg\//,'').replace(/^\//,'');
   if(!/^[\w./-]+$/.test(file)||file.includes('..')){res.writeHead(404);res.end();return;}
   const full=path.resolve(root,file);
   if(!full.startsWith(root+path.sep)&&full!==path.join(root,'index.html')){res.writeHead(403);res.end();return;}
   const data=await readFile(full);
   res.writeHead(200,{'content-type':exts[file.split('.').at(-1)]||'application/octet-stream',
    'cache-control':'no-store','x-pvp-staging-only':'true'});
   res.end(data);
  }catch(err){
   res.writeHead(500,{'content-type':'text/plain'});
   res.end('Staging-only error');
  }
 });
 let browser;
 const errors=[];
 try{
  await initDatabase();
  await initCommunityPack();
  await initPlayableHeroes();
  await initAwakening();
  await initEnchantments();
  // The synthetic phone is only a DB identity. No WhatsApp connection or message occurs.
  const jid='5511999000777@s.whatsapp.net';
  await ensureUser(jid,'Pessoa de teste');
  const issued=await createWebLinkCode(jid);
  assert.ok(issued.code);
  await registerWebPassword(db,{code:issued.code,password:'Staging-Test-2026-Only!'});

  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({serviceWorkers:'block'});
  const external=[];
  page.on('request',r=>{
   const url=r.url();
   if(url.startsWith('http')&&!url.startsWith(origin))external.push(url);
  });
  page.on('pageerror',err=>errors.push(String(err?.message||err)));
  await page.goto(origin+'/rpg',{waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('#passwordLoginForm').isVisible(),true);
  const health=await page.evaluate(async()=>{
   const r=await fetch('/api/v1/health');
   return {status:r.status,body:await r.json()};
  });
  assert.equal(health.status,200);
  assert.equal(health.body.ok,true);
  const anon=await page.evaluate(async()=>{
   const r=await fetch('/api/v1/me/bootstrap');
   return r.status;
  });
  assert.equal(anon,401);
  await page.locator('#loginPhone').fill('11999000777');
  await page.locator('#loginPassword').fill('invalid-password-2026');
  await page.locator('#passwordLoginForm button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#linkError')?.textContent.trim().length>0,{timeout:10000});
  assert.equal(await page.evaluate(()=>Boolean(localStorage.getItem('alphaWebTokenV1'))),false);
  await page.locator('#loginPassword').fill('Staging-Test-2026-Only!');
  await page.locator('#passwordLoginForm button[type=submit]').click();
  await page.waitForFunction(()=>Boolean(localStorage.getItem('alphaWebTokenV1')),{timeout:20000});
  const token=await page.evaluate(()=>localStorage.getItem('alphaWebTokenV1'));
  assert.ok(token.length>=24);
  const me=await page.evaluate(async()=>{
   const token=localStorage.getItem('alphaWebTokenV1');
   const r=await fetch('/api/v1/me/pet-team-preview',{headers:{Authorization:'Bearer '+token}});
   return {status:r.status,body:await r.json()};
  });
  assert.equal(me.status,200);
  assert.equal(me.body.ok,true);
  const auth=await page.evaluate(async()=>{
   const token=localStorage.getItem('alphaWebTokenV1');
   const r=await fetch('/api/v1/auth/logout',{method:'POST',
    headers:{Authorization:'Bearer '+token}});
   return r.status;
  });
  assert.equal(auth,200);
  const invalidated=await page.evaluate(async()=>{
   const token=localStorage.getItem('alphaWebTokenV1');
   return (await fetch('/api/v1/me/pet-team-preview',{headers:{Authorization:'Bearer '+token}})).status;
  });
  assert.equal(invalidated,401);
  assert.deepEqual(external.filter(u=>u.includes('/api/v1/')),[],'No external production API requests');
  assert.ok(!errors.some(x=>/Uncaught|SyntaxError|ReferenceError/.test(x)),errors.join('\n'));
  console.info('ALPHA_WEB_STAGING_SMOKE: Chromium login, private API, logout, CORS = OK; origin=localhost; no Render calls');
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
  await db.end();
 }
});
