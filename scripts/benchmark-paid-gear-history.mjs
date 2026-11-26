import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {PAID_GEAR_HISTORY_SQL,PAID_GEAR_HISTORY_INDEXES} from '../src/neon/paid-gear-history-sql.js'
if(process.env.ALPHA_GEAR_BENCHMARK!=='isolated-ci')throw Error('Disposable PostgreSQL benchmark only')
const sql=q=>execFileSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',maxBuffer:8*1024*1024}).trim()
const baseline=`SELECT type,note,amount,split_part(note,' ',1) AS item_id FROM transactions
 WHERE split_part(note,' ',1)=ANY($2::text[])
 AND id>COALESCE((SELECT MAX(id) FROM transactions WHERE from_jid=$1 AND type IN ('owner_reset_total','owner_reset_inventory')),0)
 AND ((from_jid=$1 AND type IN ('equipment_upgrade','equipment_star_forge','equipment_star_forge_shield','equipment_star_forge_collab_fragments','equipment_shop_forge5','equipment_inventory_auto_forge'))
 OR (to_jid=$1 AND from_jid='shop' AND type IN ('sale','sale_batch'))) ORDER BY id`
const args="('fixture-player',ARRAY['garras_vazio','escudo_runico'])"
const run=(query,explain=false)=>sql('PREPARE history(text,text[]) AS '+query+'; '+(explain?'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ':'')+'EXECUTE history'+args+';')
sql(`CREATE TABLE transactions (id bigserial PRIMARY KEY,from_jid text NOT NULL,to_jid text,amount bigint NOT NULL,type text NOT NULL,note text NOT NULL DEFAULT '');
 INSERT INTO transactions(from_jid,to_jid,amount,type,note)
 SELECT 'player-'||(g%1000),'system',100,'work','shift '||g FROM generate_series(1,350000) g;
 INSERT INTO transactions(from_jid,to_jid,amount,type,note)
 SELECT 'player-'||(g%1000),'upgrade',100,'equipment_upgrade','garras_vazio COPY Lv.1->Lv.2' FROM generate_series(1,12000) g;
 INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES
 ('fixture-player','upgrade',100,'equipment_upgrade','garras_vazio COPY Lv.1->Lv.2'),
 ('fixture-player','owner',0,'owner_reset_inventory','admin inventory reset'),
 ('fixture-player','upgrade',300,'equipment_upgrade','garras_vazio COPY Lv.1->Lv.3'),
 ('fixture-player','forge',400,'equipment_star_forge_shield','escudo_runico ★1->★2; Lv.1'),
 ('shop','fixture-player',900,'sale','garras_vazio x1|paid_sale:n.3.300|remaining:0'),
 ('fixture-player','upgrade',100,'equipment_upgrade','other_item COPY Lv.1->Lv.2'),
 ('fixture-player','system',100,'work','garras_vazio fake receipt'),
 ('shop','other-player',900,'sale','garras_vazio x1');
 ANALYZE transactions;`)
const before=JSON.parse(run(baseline,true))[0], expected=run(baseline)
assert.equal(expected.split('\n').length,3)
sql(PAID_GEAR_HISTORY_INDEXES.join(';\n')+'; ANALYZE transactions;')
assert.equal(run(PAID_GEAR_HISTORY_SQL),expected)
const after=JSON.parse(run(PAID_GEAR_HISTORY_SQL,true))[0]
const blocks=p=>(p['Shared Hit Blocks']||0)+(p['Shared Read Blocks']||0)
assert.ok(blocks(after.Plan)<blocks(before.Plan)/10,JSON.stringify({before:blocks(before.Plan),after:blocks(after.Plan)}))
const names=[]
function walk(p){if(p['Index Name'])names.push(p['Index Name']);for(const child of p.Plans||[])walk(child)}
walk(after.Plan)
assert.ok(names.includes('transactions_paid_gear_debit_idx'))
assert.ok(names.includes('transactions_paid_gear_sale_idx'))
assert.ok(names.includes('transactions_paid_gear_reset_idx'))
console.log(JSON.stringify({rows:362008,resultRows:3,baselineMs:before['Execution Time'],optimizedMs:after['Execution Time'],baselineBlocks:blocks(before.Plan),optimizedBlocks:blocks(after.Plan),indexes:names},null,2))
