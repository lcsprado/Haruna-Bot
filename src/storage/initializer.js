import { configureDatabase } from './connection.js'
import { createSchema } from './definitions.js'
import { logger } from '#helpers/logger.js'

const EXTRA_SHOP_ITEMS = [
  { id: 'katana_shadow', name: 'Katana Sombria', description: 'ATK +85', category: 'weapon', price: 32000, rarity: 'epic', sellable: true, stackable: false, data: { atk: 85 } },
  { id: 'axe_berserker', name: 'Machado do Berserker', description: 'ATK +100', category: 'weapon', price: 48000, rarity: 'epic', sellable: true, stackable: false, data: { atk: 100 } },
  { id: 'blade_abyss', name: 'Lâmina do Abismo', description: 'ATK +120', category: 'weapon', price: 75000, rarity: 'legendary', sellable: true, stackable: false, data: { atk: 120 } },
  { id: 'scythe_souls', name: 'Foice das Almas', description: 'ATK +145', category: 'weapon', price: 110000, rarity: 'legendary', sellable: true, stackable: false, data: { atk: 145 } },
  { id: 'sword_celestial', name: 'Espada Celestial', description: 'ATK +175', category: 'weapon', price: 160000, rarity: 'legendary', sellable: true, stackable: false, data: { atk: 175 } },

  { id: 'armor_obsidian', name: 'Armadura de Obsidiana', description: 'DEF +50 · HP +75', category: 'armor', price: 30000, rarity: 'epic', sellable: true, stackable: false, data: { def: 50, hp: 75 } },
  { id: 'armor_draconic', name: 'Armadura Dracônica', description: 'DEF +70 · HP +120', category: 'armor', price: 47000, rarity: 'epic', sellable: true, stackable: false, data: { def: 70, hp: 120 } },
  { id: 'armor_abyss', name: 'Armadura do Abismo', description: 'DEF +90 · HP +175', category: 'armor', price: 70000, rarity: 'legendary', sellable: true, stackable: false, data: { def: 90, hp: 175 } },
  { id: 'armor_celestial', name: 'Armadura Celestial', description: 'DEF +115 · HP +240', category: 'armor', price: 105000, rarity: 'legendary', sellable: true, stackable: false, data: { def: 115, hp: 240 } },
  { id: 'armor_demon_king', name: 'Armadura do Rei Demônio', description: 'DEF +145 · HP +320', category: 'armor', price: 150000, rarity: 'legendary', sellable: true, stackable: false, data: { def: 145, hp: 320 } },
]

export async function initializeDatabase() {
  try {
    configureDatabase()
    createSchema()

    // Mantém os itens extras disponíveis mesmo em bancos já existentes.
    const { itemModel } = await import('#storage/models/item.js')
    itemModel.bulkUpsert(EXTRA_SHOP_ITEMS)

    logger.info({ extraShopItems: EXTRA_SHOP_ITEMS.length }, 'Database initialized')
  } catch (err) {
    logger.fatal({ err }, 'Database initialization failed')
    throw err
  }
}
