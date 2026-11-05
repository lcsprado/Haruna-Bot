import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ALPHA_WEB_OFFICIAL_URL,buildOfficialWebLoginUrl} from '../src/neon/web-official-link.js';

test('!web sempre aponta para o domínio público oficial, não para branch de teste',()=>{
  assert.equal(ALPHA_WEB_OFFICIAL_URL,'https://alpha-web-rpg.vercel.app/rpg');
  const url=buildOfficialWebLoginUrl('ABCDEFGH');
  const parsed=new URL(url);
  assert.equal(parsed.origin,'https://alpha-web-rpg.vercel.app');
  assert.equal(parsed.pathname,'/rpg');
  assert.equal(parsed.hash,'#code=ABCDEFGH');
  assert.doesNotMatch(url,/git-|preview|onrender\.com|koyeb\.app/i);
});
test('configurações antigas de preview não alteram o link emitido',()=>{
  const oldWeb=process.env.WEB_APP_URL,oldRender=process.env.RENDER_EXTERNAL_URL;
  try{
    process.env.WEB_APP_URL='https://alpha-web-rpg-git-feat-antiga-lcshprado.vercel.app/rpg';
    process.env.RENDER_EXTERNAL_URL='https://servico-antigo.onrender.com';
    assert.equal(buildOfficialWebLoginUrl('HJKLMPQR'),
      'https://alpha-web-rpg.vercel.app/rpg#code=HJKLMPQR');
  }finally{
    if(oldWeb==null)delete process.env.WEB_APP_URL; else process.env.WEB_APP_URL=oldWeb;
    if(oldRender==null)delete process.env.RENDER_EXTERNAL_URL; else process.env.RENDER_EXTERNAL_URL=oldRender;
  }
});
test('código permanece individual e link usa fragmento, não consulta ou caminho',()=>{
  const url=buildOfficialWebLoginUrl('ABCDEFGH');
  assert.equal(new URL(url).search,'');
  assert.equal(new URL(url).hash,'#code=ABCDEFGH');
  assert.throws(()=>buildOfficialWebLoginUrl(''),/inválido/);
  assert.throws(()=>buildOfficialWebLoginUrl('12345678'),/inválido/);
  assert.throws(()=>buildOfficialWebLoginUrl('ABCDEFGH?evil=1'),/inválido/);
});
test('o gerador real de !web chama o helper canônico (sem fallback de ambiente)',()=>{
  const source=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8');
  const start=source.indexOf('export async function createWebLinkCode');
  const end=source.indexOf('async function exchangeWebLinkCode',start);
  assert.ok(start>=0&&end>start);
  const snippet=source.slice(start,end);
  assert.match(source,/import \{buildOfficialWebLoginUrl\} from '\.\/web-official-link\.js'/);
  assert.match(snippet,/url:buildOfficialWebLoginUrl\(code\)/);
  assert.doesNotMatch(snippet,/WEB_APP_URL|RENDER_EXTERNAL_URL|url:origin/);
  const bot=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
  assert.match(bot,/if\(cmd==='web'\)/);
  assert.match(bot,/prepareWebGroupLink\(sender,chat\)/);
  assert.match(bot,/consumePendingWebGroupLink\(sender\)/);
  assert.match(bot,/createWebLinkCode\(sender,linkedGroup\)/);
  assert.match(bot,/link\.url/);
});