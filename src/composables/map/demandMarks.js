/**
 * Demand Marks (demandMarks.js)
 *
 * Works out which towns to mark on the map for the demand lines a player has
 * picked out on their cards (the demand cards store's `markedLines`). Each
 * line marks two things, in the line's color:
 *
 * - its destination: a halo round the town's dot;
 * - where its commodity comes from: a halo round that commodity's icon at
 *   every town producing it.
 *
 * A town or icon wanted by several lines gets each of their colors, so the
 * halos can be stacked into rings. Pure, so it is tested without a map;
 * useTowns draws the marks.
 *
 * Towns and commodities are matched by name, since that is how a demand
 * names them.
 *
 * @module composables/map/demandMarks
 */

/**
 * The towns and commodity icons to mark for some demand lines.
 * @param {Array<{destination: string, industry: string, color: string}>} lines -
 *   The lines to show, in order
 * @param {Array<Object>} towns - Every town, with its name and industries
 * @returns {{destinations: Object<string, Array<string>>,
 *   producers: Object<string, Object<string, Array<string>>>}} The colors to
 *   halo each destination town in, by town name; and for each producing
 *   town, the colors to halo each of its commodity icons in, by town name
 *   then commodity name
 */
export function demandMarks(lines, towns) {
  const destinations = {}
  const producers = {}

  lines.forEach(({ destination, industry, color }) => {
    destinations[destination] = [...(destinations[destination] ?? []), color]

    towns
      .filter((town) => town.industries.some(({ name }) => name === industry))
      .forEach(({ name }) => {
        const icons = (producers[name] ??= {})
        icons[industry] = [...(icons[industry] ?? []), color]
      })
  })

  return { destinations, producers }
}
