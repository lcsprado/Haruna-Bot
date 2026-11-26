// V2: apenas caixas epicas. A chance de equipamento direto nao muda.
export const V2_EPIC_BOX_FIRST_CHANCE=Object.freeze({30:.20,40:.30,50:.40,60:.50,65:.55,70:.65})
export function v2EpicRaidBoxChance({level,rankIndex,share=0,petDrop=0,enabled=false}={}){
 if(!enabled)return null
 const base=V2_EPIC_BOX_FIRST_CHANCE[level]
 if(base===undefined)return null
 const pet=Math.max(0,Number(petDrop)||0)
 const contribution=Math.max(0,Math.min(1,Number(share)||0))
 if(rankIndex===0)return Math.min(base+.10,base+pet*.50)
 // Mantem o peso relativo de colaboracao e pet dos demais colocados,
 // ajustando a faixa junto com a do primeiro para evitar inversao de premios.
 return Math.min(.45,.08+contribution*.45+pet*.25)*(base/.55)
}
