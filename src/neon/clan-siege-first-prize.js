// Premio exclusivo da primeira vitoria no Cerco ao Castelo do grupo AlphaBot.
// Executar com o MESMO client/transacao que conclui a partida; nenhuma entrega fora da transacao.
export const FIRST_SIEGE_INSIGNIA_ID='insignia_primeiros_conquistadores_20261102';
export const FIRST_SIEGE_INSIGNIA=Object.freeze({
  id:FIRST_SIEGE_INSIGNIA_ID,
  name:'👑 Insígnia dos Primeiros Conquistadores',
  description:'Relíquia Evento Único da primeira Guerra de Clãs do AlphaBot. +7% dano Boss/Raid; +3 p.p. CRIT Boss/Raid; -2% dano recebido em Raid. Sem PvP. Apenas os 2 vencedores.',
  effect:'👑 +7% dano e +3 p.p. CRIT Boss/Raid; -2% dano recebido em Raid (sem PvP)',
  boss:0.07,raidAttack:0.07,bossCrit:0.03,raidCrit:0.03,raid:0.02
});

export async function grantFirstSiegeInsignias(client,match){
  const winner=String(match?.winner_clan_id||'');
  const chat=String(match?.chat_jid||'');
  if(!winner||!chat||!match?.id) return null; // empate nunca consome a edicao historica
  // Trava o direito ao trofeu por grupo. O PRIMARY KEY nunca permite segunda concessao.
  const claim=await client.query(
    'INSERT INTO alpha_siege_first_victory(chat_jid,match_id,winner_clan_id,awarded_at) VALUES($1,$2,$3,$4) ON CONFLICT(chat_jid) DO NOTHING RETURNING chat_jid',
    [chat,match.id,winner,Date.now()]
  );
  if(claim.rowCount!==1)return null;
  const members=(await client.query(
    'SELECT jid FROM alpha_siege_roster WHERE match_id=$1 AND clan_id=$2 ORDER BY jid',
    [match.id,winner]
  )).rows;
  if(members.length!==2||new Set(members.map(x=>x.jid)).size!==2){
    throw new Error('Premiacao do Cerco bloqueada: campeoes precisam ser exatamente dois.');
  }
  await client.query(
    'INSERT INTO items(id,name,description,category,price,rarity,sellable,stackable) VALUES($1,$2,$3,$4,0,$5,FALSE,FALSE) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,price=0,rarity=EXCLUDED.rarity,sellable=FALSE,stackable=FALSE',
    [FIRST_SIEGE_INSIGNIA.id,FIRST_SIEGE_INSIGNIA.name,FIRST_SIEGE_INSIGNIA.description,'special','event']
  );
  for(const member of members){
    // Nunca duplica um item que ja foi entregue manualmente ou em outra reexecucao.
    await client.query(
      'INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1) ON CONFLICT(jid,item_id) DO UPDATE SET quantity=GREATEST(inventories.quantity,1)',
      [member.jid,FIRST_SIEGE_INSIGNIA_ID]
    );
    await client.query(
      'INSERT INTO bound_inventory_items(jid,item_id,source_key,quantity) VALUES($1,$2,$3,1) ON CONFLICT(jid,item_id,source_key) DO NOTHING',
      [member.jid,FIRST_SIEGE_INSIGNIA_ID,'clan-siege:first-win:'+chat]
    );
  }
  return {id:FIRST_SIEGE_INSIGNIA_ID,name:FIRST_SIEGE_INSIGNIA.name,count:2};
}
