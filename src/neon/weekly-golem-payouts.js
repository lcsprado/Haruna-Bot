// Bônus de dinheiro e XP exclusivo do Superboss semanal a partir de 30/10/2026.
// A edição antiga, os drops, as insígnias, o dano e o HP não são alterados.
// Esta função é pura: nenhuma consulta extra ou atualização durante os ataques.
const TOP_FIVE_BONUSES=Object.freeze([
  Object.freeze({cash:4_000_000,xp:68_000}),
  Object.freeze({cash:3_250_000,xp:56_000}),
  Object.freeze({cash:2_475_000,xp:43_500}),
  Object.freeze({cash:1_650_000,xp:35_500}),
  Object.freeze({cash:1_275_000,xp:27_000})
]);
const NONE=Object.freeze({cash:0,xp:0});
const CONTRIBUTOR_BONUSES=Object.freeze([
  Object.freeze({threshold:250_000,cash:900_000,xp:20_000}),
  Object.freeze({threshold:100_000,cash:600_000,xp:12_000}),
  Object.freeze({threshold:10_000,cash:250_000,xp:5_000})
]);
export function weeklyGolemPayoutIncrease({weekendKey,position,damage}={}){
  const key=String(weekendKey||'');
  const realDamage=Number(damage);
  const rank=Number(position);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(key)||key<'2026-10-30'||
    !Number.isFinite(realDamage)||realDamage<10_000||
    !Number.isInteger(rank)||rank<1)return NONE;
  if(rank<=5)return TOP_FIVE_BONUSES[rank-1];
  const band=CONTRIBUTOR_BONUSES.find(tier=>realDamage>=tier.threshold);
  return band?{cash:band.cash,xp:band.xp}:NONE;
}
