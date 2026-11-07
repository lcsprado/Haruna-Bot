// Valores de referência do combatente CLASSE para !heroi comparar.
// O bônus original já está nos atributos persistidos; o ganho do
// balanceamento é somado apenas no combate, sem modificar equipamentos.
import {PLAYER_CLASSES} from './game-catalog.js';
import {classCombatGrowth,classLevelFromGeneralLevel} from './class-combat-balance.js';

export function classComparisonBonuses(classId,level){
  const selected=PLAYER_CLASSES[String(classId||'').toLowerCase()];
  if(!selected)return null;
  const growth=classCombatGrowth(selected.id,level);
  return Object.fromEntries(['hp','atk','def','spd'].map(key=>[
    key,Number(selected[key]||0)+Number(growth[key]||0)
  ]));
}

export function classComparisonLevel({heroLevel=1,recordedClassLevel=null,overrideLevel=null}={}){
  if(overrideLevel!==null&&overrideLevel!==undefined){
    const value=Number(overrideLevel);
    if(!Number.isInteger(value)||value<1||value>100)
      throw new RangeError('O nível comparado deve ser um inteiro entre 1 e 100.');
    return {level:value,source:'selecionado'};
  }
  if(recordedClassLevel!==null&&recordedClassLevel!==undefined)
    return {level:classLevelFromGeneralLevel(recordedClassLevel),source:'registrado'};
  return {level:classLevelFromGeneralLevel(heroLevel),source:'referencia'};
}
