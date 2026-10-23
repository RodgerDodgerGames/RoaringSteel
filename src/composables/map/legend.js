/**
 * Map Legend (legend.js)
 *
 * Works out what the map legend lists under commodities: every commodity
 * produced somewhere on this map, each once, with the icon the map shows for
 * it. A commodity no town produces never appears on the map, so it is left
 * out; the legend explains this map, not every commodity in the game.
 *
 * Pure, so it is tested without a map; MapLegend.vue draws the list.
 *
 * @module composables/map/legend
 */

import { commodityIconUrl } from '@/composables/map/commodityIcons'

/**
 * The commodities produced on the map, for the legend.
 *
 * Listed alphabetically, so a player scanning for a commodity named on a
 * demand card knows where to look. Commodities are told apart by their
 * industry code, so two towns producing the same one list it once.
 *
 * @param {Array<Object>} towns - Every town, with its industries
 *   [{ name, industry }]
 * @returns {Array<{industry: number, name: string, iconUrl: string}>} One
 *   entry per commodity, sorted by name
 */
export function legendCommodities(towns) {
  const commodities = new Map()
  towns.forEach((town) => {
    town.industries.forEach(({ name, industry }) => {
      if (!commodities.has(industry)) {
        commodities.set(industry, { industry, name, iconUrl: commodityIconUrl(industry) })
      }
    })
  })
  return [...commodities.values()].sort((a, b) => a.name.localeCompare(b.name))
}
