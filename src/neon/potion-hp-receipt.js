// Um mesmo HP persistido pode ter escalas diferentes: classe salva e heroi ativo.
// A mensagem da pocao deve usar a mesma escala da ficha mostrada ao jogador,
// sem misturar a cura persistida com a vida temporaria de pets em combate.
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const fmt=v=>Math.max(0,Math.round(n(v))).toLocaleString('pt-BR');
export function potionDisplayHp(potion,heroSheet=null){
  const storedMax=Math.max(1,n(potion?.maxHp)||1);
  const visualMax=heroSheet?.maxHp!=null?Math.max(1,n(heroSheet.maxHp)):storedMax;
  const convert=hp=>Math.max(0,Math.min(visualMax,Math.round(Math.max(0,n(hp))*visualMax/storedMax)));
  const before=convert(potion?.before);
  const after=convert(potion?.hp);
  return {before,after,maxHp:visualMax,healed:Math.max(0,after-before),originalStoredHeal:n(potion?.healed)};
}
export function potionHpReceipt(potion,heroSheet=null){
  const hp=potionDisplayHp(potion,heroSheet);
  return '🧪 *'+String(potion?.name||'Poção')+'* utilizada!'+
    '\n❤️ +'+fmt(hp.healed)+' HP recuperados'+
    '\n❤️ HP normal após a cura: *'+fmt(hp.after)+'/'+fmt(hp.maxHp)+'*'+
    '\n🧬 Bônus temporários de HP de pets são mostrados separadamente no combate.';
}
