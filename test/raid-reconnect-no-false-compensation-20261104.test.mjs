import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
const marker='// Retomar Raids existentes apos reconexao nao e evidencia de deadlock.';
const begin=source.indexOf(marker);
const end=source.indexOf("const raidReply=(text)=>sock.sendMessage(row.chat_jid,{text})",begin);
assert.ok(begin>=0 && end>begin,'bloco de recuperação da Raid encontrado');
const recovery=source.slice(begin,end);

test('reconexao nunca paga nem anuncia 10 mil sem deadlock comprovado',()=>{
  assert.doesNotMatch(recovery,/UPDATE wallets|INSERT INTO transactions|raid_interruption_compensation|deadlockEpicCompensated|COMPENSAÇÃO DA RAID|cash=cash\+10000/);
  assert.doesNotMatch(source,/O banco interrompeu a luta por deadlock\. Cada participante recebeu/);
  assert.match(recovery,/for\(const row of rows\)/);
});

test('recuperacao altera somente expiração e preserva o estado das rodadas',()=>{
  assert.match(recovery,/jsonb_set\(state,'\{expiresAt\}',to_jsonb\(\$1::bigint\),true\)/);
  assert.match(recovery,/state->>'status'='active'/);
  assert.match(recovery,/COALESCE\(\(state->>'expiresAt'\)::bigint,0\)<=\$4/);
  assert.doesNotMatch(recovery,/state=\$1::jsonb|JSON\.stringify\(raid\)/);
});

test('Raid permanece recuperavel sem consumir nova chave ou conceder credito',()=>{
  const after=source.slice(end,end+700);
  assert.match(after,/runRaidCombat\(row\.chat_jid,Number\(raid\.level\),raidReply\)/);
  assert.match(after,/RAID RETOMADA AUTOMATICAMENTE/);
  assert.match(source,/const isDeadlock=err\?\.code==='40P01'/);
});