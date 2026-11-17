import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {analyzeRebootSource,auditRebootSources} from '../scripts/reboot-audit.mjs';

test('identifica referências aos Pecados, collab, ganho financeiro e tabelas com linhas exatas',()=>{
  const source=[
    "import {PECADOS_HEROES} from './sete-pecados-catalog.js';",
    "const prize={cashPool:720000};",
    'CREATE TABLE IF NOT EXISTS user_businesses (jid TEXT);',
    "const harmless='sem evento';",
    "const key='fragmento_ascensao_pecados_20261024';"
  ].join('\n');
  const result=analyzeRebootSource(source,'src/neon/fixture.js');
  assert.deepEqual(result.collabLines,[1,5]);
  assert.deepEqual(result.economyLines,[2]);
  assert.deepEqual(result.tables,['user_businesses']);
});

test('auditoria só lê diretórios fonte e devolve manifesto ordenado sem DB',()=>{
  const root=mkdtempSync(join(tmpdir(),'alpha-reboot-audit-'));
  try{
    mkdirSync(join(root,'src','neon'),{recursive:true});
    mkdirSync(join(root,'web'),{recursive:true});
    writeFileSync(join(root,'src','neon','a.js'),
      "CREATE TABLE IF NOT EXISTS wallets(id text);\nconst x='pecado_ban';");
    writeFileSync(join(root,'web','app.js'),'const rewardCash=5000;');
    writeFileSync(join(root,'src','neon','ignore.txt'),'collab');
    const result=auditRebootSources(root);
    assert.equal(result.readOnly,true);
    assert.equal(result.sourceFilesScanned,2);
    assert.equal(result.collabFiles,1);
    assert.equal(result.economyFiles,1);
    assert.deepEqual(result.tablesFound,['wallets']);
    assert.deepEqual(result.files.map(f=>f.path),['src/neon/a.js','web/app.js']);
  }finally{
    rmSync(root,{recursive:true,force:true});
  }
});
