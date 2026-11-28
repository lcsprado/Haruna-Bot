// Coleiras V2: apenas mitigação do dano recebido pelo pet; nunca bônus do dono.
const collar=(id,name,rarity,percent,price)=>Object.freeze({id,name,rarity,percent,price});
export const PET_COLLARS=Object.freeze([
 collar('coleira_couro_reforcado','Couro Reforçado','common',5,50000),
 collar('coleira_presa_ferro','Presa de Ferro','uncommon',8,100000),
 collar('coleira_escamas_aco','Escamas de Aço','rare',12,250000),
 collar('coleira_couraca_selvagem','Couraça Selvagem','epic',16,500000),
 collar('coleira_egide_primordial','Égide Primordial','legendary',20,1000000),
 collar('coleira_coracao_adamantium','Coração de Adamantium','legendary',25,0)
]);
export const MYTHIC_COLLAR=PET_COLLARS[5].id;
export const MYTHIC_COLLAR_FEE=500000;
export const MYTHIC_COLLAR_MATERIALS=Object.freeze({
 [PET_COLLARS[4].id]:1,nucleo_pedra:500,olho_abissal:300,
 essencia_rei_abissal:150,fragmento_caos:50
});
export function petCollar(id){return PET_COLLARS.find(c=>c.id===id)||null}
export function petCollarDamage(damage,id){
 const n=Math.max(0,Math.round(Number(damage)||0));
 if(n===0)return 0;
 return Math.max(1,Math.round(n*(1-(petCollar(id)?.percent||0)/100)));
}
export function petCollarEstimate(damage,id){
 const n=Math.max(0,Number(damage)||0);
 return n===0?0:Math.max(1,Math.ceil(n*(1-(petCollar(id)?.percent||0)/100)));
}
export async function seedPetCollars(db){
 for(const item of PET_COLLARS){
  await db.query(`INSERT INTO items(id,name,description,category,price,rarity,sellable,stackable)
  VALUES($1,$2,$3,'pet_collar',$4,$5,TRUE,FALSE)
  ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
  category=EXCLUDED.category,price=EXCLUDED.price,rarity=EXCLUDED.rarity,sellable=TRUE,stackable=FALSE`,
  [item.id,'Coleira — '+item.name,'Reduz '+item.percent+'% do dano recebido exclusivamente pelo pet.',item.price,item.rarity]);
 }
}
