// Equipamentos exclusivos do pool da Caixa Lendária.
export const LEGENDARY_BOX_GEAR=Object.freeze([
  {
    "id": "espada_juizo_celestial_20261030",
    "name": "Espada do Juízo Celestial",
    "category": "weapon",
    "atk": 145,
    "def": 0,
    "hp": 55,
    "spd": 0,
    "crit": 0.045
  },
  {
    "id": "lanca_arauto_eclipse_20261030",
    "name": "Lança do Arauto do Eclipse",
    "category": "weapon",
    "atk": 148,
    "def": 0,
    "hp": 0,
    "spd": 8,
    "crit": 0.035
  },
  {
    "id": "machado_trovao_astral_20261030",
    "name": "Machado do Trovão Astral",
    "category": "weapon",
    "atk": 152,
    "def": 0,
    "hp": 75,
    "spd": 0,
    "crit": 0.02
  },
  {
    "id": "armadura_serafica_20261030",
    "name": "Armadura Seráfica",
    "category": "armor",
    "atk": 0,
    "def": 168,
    "hp": 330,
    "spd": 0,
    "crit": 0.02
  },
  {
    "id": "couraca_eclipse_real_20261030",
    "name": "Couraça do Eclipse Real",
    "category": "armor",
    "atk": 0,
    "def": 172,
    "hp": 350,
    "spd": 0,
    "crit": 0.015
  },
  {
    "id": "manto_guardiao_aurora_20261030",
    "name": "Manto do Guardião da Aurora",
    "category": "armor",
    "atk": 0,
    "def": 175,
    "hp": 375,
    "spd": 0,
    "crit": 0.01
  },
  {
    "id": "elmo_tribunal_astral_20261030",
    "name": "Elmo do Tribunal Astral",
    "category": "helmet",
    "atk": 0,
    "def": 114,
    "hp": 340,
    "spd": 0,
    "crit": 0.02
  },
  {
    "id": "elmo_coroa_solar_20261030",
    "name": "Elmo da Coroa Solar",
    "category": "helmet",
    "atk": 0,
    "def": 118,
    "hp": 305,
    "spd": 0,
    "crit": 0.025
  },
  {
    "id": "elmo_vigia_primordial_20261030",
    "name": "Elmo do Vigia Primordial",
    "category": "helmet",
    "atk": 0,
    "def": 120,
    "hp": 320,
    "spd": 0,
    "crit": 0.025
  },
  {
    "id": "botas_passos_eclipse_20261030",
    "name": "Botas dos Passos do Eclipse",
    "category": "boots",
    "atk": 0,
    "def": 0,
    "hp": 60,
    "spd": 18,
    "crit": 0.015
  },
  {
    "id": "botas_vento_sagrado_20261030",
    "name": "Botas do Vento Sagrado",
    "category": "boots",
    "atk": 0,
    "def": 0,
    "hp": 30,
    "spd": 19,
    "crit": 0.02
  },
  {
    "id": "botas_fulgor_primordial_20261030",
    "name": "Botas do Fulgor Primordial",
    "category": "boots",
    "atk": 0,
    "def": 15,
    "hp": 80,
    "spd": 17,
    "crit": 0.02
  }
].map(item=>Object.freeze({...item,description:'Lendário superior exclusivo da Caixa Lendária.'})))
export const LEGENDARY_BOX_WEIGHTS=Object.freeze({existing:10,new:8})

export function pickLegendaryBoxGear(existingIds,random=Math.random){
  if(!Array.isArray(existingIds)||!existingIds.length)throw new Error('Pool lendário original ausente')
  const pool=[
    ...existingIds.map(id=>({id,weight:LEGENDARY_BOX_WEIGHTS.existing})),
    ...LEGENDARY_BOX_GEAR.map(item=>({id:item.id,weight:LEGENDARY_BOX_WEIGHTS.new}))
  ]
  const total=pool.reduce((sum,item)=>sum+item.weight,0)
  const roll=Number(random())
  if(!Number.isFinite(roll)||roll<0||roll>=1)throw new Error('Sorteio lendário inválido')
  let ticket=roll*total
  for(const item of pool){
    ticket-=item.weight
    if(ticket<0)return item.id
  }
  return pool[pool.length-1].id
}
