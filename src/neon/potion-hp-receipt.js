import {profilePvpHp} from './profile-pvp-hp.js';

// A vida persistente continua sendo a normal: bônus de pet só entram no combate.
// O recibo da cura precisa mostrar a mesma escala que o !perfil e o !batalhar.
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

export function potionPvpProjection(potion,heroSheet=null,{petHpRate=0,teamHpRate=0}={}){
  const normal=potionDisplayHp(potion,heroSheet);
  const args={maxHp:normal.maxHp,petHpRate,teamHpRate};
  const before=profilePvpHp({...args,hp:normal.before});
  const after=profilePvpHp({...args,hp:normal.after});
  return {normal,pvp:after,healedPvp:Math.max(0,after.hp-before.hp),
    bonusMax:Math.max(0,after.maxHp-normal.maxHp)};
}

export function potionHpReceipt(potion,heroSheet=null,bonuses={}){
  const {normal,pvp,healedPvp,bonusMax}=potionPvpProjection(potion,heroSheet,bonuses);
  const prefix='🧪 *'+String(potion?.name||'Poção')+'* utilizada!';
  if(bonusMax>0){
    return prefix+
      '\n❤️ +'+fmt(healedPvp)+' HP recuperados na escala do PvP'+
      '\n❤️ HP no PvP: *'+fmt(pvp.hp)+'/'+fmt(pvp.maxHp)+'*'+
      '\n❤️ HP normal após a cura: *'+fmt(normal.after)+'/'+fmt(normal.maxHp)+'* (+'+fmt(normal.healed)+' HP normal)'+
      '\n🧬 Bônus temporários de HP de pets/equipe: +'+fmt(bonusMax)+' HP máximo; aplicados apenas em combate.';
  }
  return prefix+
    '\n❤️ +'+fmt(normal.healed)+' HP recuperados'+
    '\n❤️ HP no PvP: *'+fmt(pvp.hp)+'/'+fmt(pvp.maxHp)+'*'+
    '\n❤️ HP normal após a cura: *'+fmt(normal.after)+'/'+fmt(normal.maxHp)+'*'+
    '\n🧬 Bônus temporários de HP de pets são mostrados separadamente no combate.';
}
