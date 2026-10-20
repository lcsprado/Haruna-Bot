// One-time temporary-only Alpha Bot inventory recovery from the user's WhatsApp history.
// Each row is an auditable recovery minimum, NEVER a fresh game reward.
import {db} from './db.js';
const RECOVERY=[{"name":"~LP🍀☘️","jid":"5511948523167@s.whatsapp.net","source":"19/10 15:00 materiais, 15:26 caixas, 14:48/15:17 consumíveis, 13:44 arma, 14:59 insígnias","materials":{"coroa_abissal":52,"essencia_eclipse":45,"fragmento_caos":76,"nucleo_alpha_corrompido":31,"essencia_rei_abissal":42,"fragmento_celestial":24,"nucleo_titan":37,"pergaminho_reclassificacao":2,"olho_abissal":33,"nucleo_pedra":25,"essencia_pecado_ganancia":1,"essencia_pecado_gula":1,"essencia_pecado_inveja":1,"essencia_pecado_ira":1,"essencia_pecado_luxuria":1,"essencia_pecado_preguica":1,"essencia_pecado_soberba":1,"titulo_conquistador_pecados":1},"potions":{"elixir_supremo":140,"pocao_g":209,"pocao_pet_full":93,"energetico_pet":34},"boxes":{"caixa_rara":4,"caixa_sorte":2},"equipment":{"machado_tita":10},"relics":["insignia_eclipse","insignia_guardiao_ruptura","insignia_eco_ancestral","insignia_nem_cirurgia_derrubou_lenda"],"unknown":"15h: 480 consumíveis; combinação conservadora baseada no menu de cura 14h48, Full Pet 11h35 e usos em Raids; conferir em 01/11."},{"name":"João Pedro","jid":"5511987308687@s.whatsapp.net","source":"13/10 03:55 materiais, 19/10 13:43-15:26 consumíveis/caixas, recompensas das Raids até 16:02","materials":{"fragmento_caos":60,"nucleo_alpha_corrompido":57,"essencia_rei_abissal":8,"fragmento_celestial":17,"olho_abissal":11,"nucleo_pedra":62,"essencia_eclipse":7},"potions":{"elixir_supremo":97,"pocao_pet_full":20,"pocao_pet_suprema":8,"energetico_pet":164},"boxes":{"caixa_epica":1,"caixa_rara":1,"caixa_sorte":1},"equipment":{},"relics":[],"unknown":"14h18: 288 consumíveis; energia 164 e Full 20 até 15h26, outros subtipos de listas anteriores; materiais de 13/10 são referência antiga."},{"name":"Augusto","jid":"5511982964423@s.whatsapp.net","source":"19/10 14:11 consumíveis, 14:12 materiais, 15:25 elixir e Raids até 16:02","materials":{"chave_raid_60":1,"essencia_eclipse":66,"fragmento_caos":22,"nucleo_alpha_corrompido":30,"essencia_rei_abissal":20,"fragmento_celestial":17,"nucleo_titan":25,"escama_vulcanica":4,"olho_abissal":8,"nucleo_pedra":2,"essencia_pecado_ganancia":1,"essencia_pecado_inveja":1,"essencia_pecado_ira":1,"essencia_pecado_luxuria":1,"essencia_pecado_preguica":1,"selo_poder_5pct_alpha_20261019":1},"potions":{"pocao_pet_full":22,"pocao_pet_suprema":64,"elixir_supremo":161,"pocao_pet_epica":1,"energetico_pet":45,"pocao_g":1,"pocao_pet_rara":1,"pocao_m":1,"pocao_p":1,"pocao_pet_comum":1},"boxes":{"caixa_epica":23,"caixa_rara":2,"caixa_sorte":2},"equipment":{},"relics":[],"unknown":"23 caixas épicas incluem 20 inferidas pelo total de 24 caixas às 14:11, mais três drops de Raid; subtipo a conferir."},{"name":"Kaique Rodrigues","jid":"5511939089695@s.whatsapp.net","source":"19/10 07:55 materiais, 13:15 caixas, 15:32 elixir, Raids até 16:02","materials":{"chave_raid_50":1,"coroa_abissal":63,"essencia_eclipse":98,"fragmento_caos":102,"nucleo_alpha_corrompido":5,"essencia_rei_abissal":22,"fragmento_celestial":57,"pergaminho_reclassificacao":1,"olho_abissal":72,"nucleo_pedra":33,"essencia_pecado_ganancia":1,"essencia_pecado_gula":1,"essencia_pecado_inveja":1,"essencia_pecado_ira":1,"essencia_pecado_luxuria":1,"essencia_pecado_preguica":1,"essencia_pecado_soberba":1},"potions":{"pocao_pet_suprema":6,"elixir_supremo":93,"energetico_pet":16,"pocao_g":2},"boxes":{"caixa_rara":4,"caixa_sorte":5},"equipment":{"lamina_abissal":10},"relics":[],"unknown":"07:55 materiais e consumíveis antigos; 15h32 elixir mais recente; demais usos intermediários podem afetar subtipos."}];
const marker='alpha_inventory_reconstruction_20261019_v1';
export async function restoreLostInventories20261019(){
 if(!String(process.env.ALPHA_DATASET_MODE||'').startsWith('TEMPORARY_2026_10_19'))return {skipped:'not_temporary'};
 const url=String(process.env.DATABASE_URL||'');
 if(!url.includes('ep-patient-breeze-b4oyk4lq-pooler.c-6.us-east-2.aws.neon.tech/neondb'))throw Error('[INVENTORY-RECOVERY] Refusing unexpected Neon host');
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('alpha-inventory-recovery-20261019'))");
  const m=(await client.query("SELECT canonical_project_id,canonical_branch_id FROM alpha_temp_recovery_manifest WHERE id='alpha-whatsapp-temporary-2026-10-19'")).rows[0];
  if(!m||m.canonical_project_id!=='jolly-glitter-58248440'||m.canonical_branch_id!=='br-dark-glade-avcswj4u')throw Error('[INVENTORY-RECOVERY] Missing original/temporary separation manifest');
  const applied=(await client.query('SELECT 1 FROM trevo_settings WHERE key=$1',[marker])).rowCount;
  if(applied){await client.query('ROLLBACK');return {skipped:'already_done'}}
  const allIds=[...new Set(RECOVERY.flatMap(p=>Object.keys({...p.materials,...p.potions,...p.boxes,...p.equipment,...Object.fromEntries(p.relics.map(id=>[id,1]))})))];
  const valid=new Set((await client.query('SELECT id FROM items WHERE id=ANY($1::text[])',[allIds])).rows.map(x=>x.id));
  const missing=allIds.filter(id=>!valid.has(id));
  if(missing.length)throw Error('[INVENTORY-RECOVERY] Catalog entries missing: '+missing.join(','));
  const checked=[];
  for(const p of RECOVERY){
   const user=(await client.query('SELECT jid,push_name,level FROM users WHERE jid=$1',[p.jid])).rows[0];
   if(!user||Number(user.level)<100)throw Error('[INVENTORY-RECOVERY] Player mismatch '+p.name);
   const quantities={...p.materials,...p.potions,...p.boxes,...Object.fromEntries(Object.entries(p.equipment).map(([id])=>[id,1])),...Object.fromEntries(p.relics.map(id=>[id,1]))};
   for(const [id,qty] of Object.entries(quantities)){
    if(!Number.isInteger(qty)||qty<=0||qty>100000)throw Error('[INVENTORY-RECOVERY] Invalid quantity '+id+':'+qty);
    await client.query('INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=GREATEST(inventories.quantity,EXCLUDED.quantity)',[p.jid,id,qty]);
   }
   for(const [id,level] of Object.entries(p.equipment)){
    await client.query('INSERT INTO equipment_upgrades(jid,item_id,level) VALUES($1,$2,$3) ON CONFLICT(jid,item_id) DO UPDATE SET level=GREATEST(equipment_upgrades.level,EXCLUDED.level)',[p.jid,id,level]);
   }
   checked.push({name:p.name,jid:p.jid,level:user.level,itemKinds:Object.keys(quantities).length,materials:Object.keys(p.materials).length,consumables:Object.keys(p.potions).length,boxes:Object.keys(p.boxes).length,source:p.source,uncertainty:p.unknown});
  }
  await client.query('INSERT INTO trevo_settings(key,value) VALUES($1,$2::jsonb)',[marker,JSON.stringify({type:'reconstruction_not_reward',source:'user WhatsApp transcript',sourceRange:'07/10-19/10 before old Neon quota',restoredAt:new Date().toISOString(),originalUntouched:true,players:checked,warning:'Quantities from historical snapshots or inferred box subtypes require reconciliation on Nov 1; do not merge automatically.'})]);
  await client.query('COMMIT');
  console.log('[INVENTORY-RECOVERY] APPLIED VERIFIED HISTORY',JSON.stringify(checked));
  return {restored:true,players:checked};
 }catch(e){await client.query('ROLLBACK').catch(()=>{});console.error('[INVENTORY-RECOVERY] FAILED AND ROLLED BACK',e?.message||e);throw e}
 finally{client.release()}
}
