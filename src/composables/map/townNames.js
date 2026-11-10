/**
 * Town Name Layout (townNames.js)
 *
 * In the Plan view the whole region is shown at once, so towns close
 * together (Fort Collins and Greeley, say) have their names drawn over each
 * other, or over each other's dots and commodity icons. This works out a
 * place for every town's name where it covers none of those, and which names
 * have no such place and are hidden instead. A hidden name still shows when
 * the town is hovered, marked by a demand line, or holds the train (that is
 * CSS on the classes useTowns sets).
 *
 * Each name tries a few spots round its own dot, in order, and takes the
 * first one that is clear (see `NAME_SPOTS`). Names are placed one town at
 * a time, biggest towns first (see `byPriority`), so a city's name is never
 * pushed aside by a small town's: when there is not room for both, it is the
 * small town that loses its name.
 *
 * Everything here is pure arithmetic on pixel positions, so it is tested
 * without a map; useTowns measures the names on the map, hands them over,
 * and applies the result.
 *
 * Positions are in screen pixels, x to the right and y downward. A town's
 * name is placed by its center, as an offset from its town's center: the
 * form a Leaflet tooltip's `offset` takes with `direction: 'center'`.
 *
 * @module composables/map/townNames
 */

import { COMMODITY_ICON_SIZE } from '@/composables/map/commodityIcons'
import { NAME_GAP } from '@/composables/map/townIcons'

/**
 * The spots a name may go in, in the order they are tried. The commodity
 * icons fan over the top of each dot, so nothing goes above it.
 *
 * - `below`: centered under the dot, where every name went before
 * - `right` / `left`: level with the dot, beside it. A town whose icons
 *   reach down level with its dot (any town with two or more) has the name
 *   past those icons rather than over them (see `sideClearance`).
 * - `belowRight` / `belowLeft`: under the dot like `below`, but starting
 *   (or ending) under the dot's center, so it reaches out to one side. Two
 *   towns side by side can then hang their names away from each other.
 *
 * ```
 *              [icons]
 *        left     ⬢     right
 *        belowLeft│belowRight
 *               below
 * ```
 */
export const NAME_SPOTS = ['below', 'right', 'left', 'belowRight', 'belowLeft']

/** The order town sizes are placed in: big towns choose their spot first */
const SIZE_ORDER = ['large', 'medium', 'small']

/**
 * A town as the layout needs it.
 * @typedef {Object} NameTown
 * @property {string} id - The town's id (its MSA code)
 * @property {number} x - The town's center on the map, in px from the map's left
 * @property {number} y - The town's center on the map, in px from the map's top
 * @property {string} size - "small", "medium" or "large"
 * @property {number} population - Breaks ties between towns of one size
 * @property {number} dotSize - Width and height of the town's dot, in px
 * @property {Array<{x: number, y: number}>} icons - The center of each of
 *   the town's commodity icons, as offsets from the town's center (see
 *   `iconRingOffsets`)
 * @property {number} nameWidth - The name's width on the map, in px
 * @property {number} nameHeight - The name's height on the map, in px
 */

/**
 * A box on the map, in px.
 * @typedef {Object} Box
 * @property {number} left
 * @property {number} top
 * @property {number} right
 * @property {number} bottom
 */

/**
 * Places every town's name where it covers no other name, no town's dot and
 * no commodity icon, and stays inside the map. A name with no such spot is
 * left out.
 *
 * Every placed name is checked against every dot, icon and name already
 * placed. That is plenty fast for the few hundred towns a board has, and the
 * Plan view only lays its names out when it is drawn or resized.
 *
 * @param {Array<NameTown>} towns - Every town on the map
 * @param {{width: number, height: number}} area - The map's size, in px
 * @returns {Map<string, {x: number, y: number}|null>} For each town's id,
 *   where its name's center goes as an offset from the town's center, or
 *   null when the name is hidden
 */
export function layoutTownNames(towns, area) {
  // Dots and icons are drawn whether or not their town keeps its name, so
  // every one of them is in the way from the start
  const taken = towns.flatMap((town) => [
    dotBox(town),
    ...town.icons.map((icon) => iconBox(town, icon))
  ])
  const placements = new Map()

  for (const town of byPriority(towns)) {
    const spot = spotOffsets(town)
      .map((offset) => ({ offset, box: nameBox(town, offset) }))
      .find(({ box }) => isInside(box, area) && !taken.some((other) => overlaps(box, other)))
    placements.set(town.id, spot ? spot.offset : null)
    if (spot) taken.push(spot.box)
  }
  return placements
}

/**
 * The towns in the order their names are placed: large, then medium, then
 * small, and within a size the bigger population first. A size outside the
 * three goes with the small towns, as it is drawn (see `townIcon`). The id
 * settles any tie, so the same board always lays out the same way.
 * @param {Array<NameTown>} towns - The towns
 * @returns {Array<NameTown>} A sorted copy
 */
export function byPriority(towns) {
  const rank = (town) => {
    const index = SIZE_ORDER.indexOf(town.size)
    return index === -1 ? SIZE_ORDER.length - 1 : index
  }
  return [...towns].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (b.population ?? 0) - (a.population ?? 0) ||
      String(a.id).localeCompare(String(b.id))
  )
}

/**
 * Where a town's name goes in each of `NAME_SPOTS`, in order: the offset of
 * the name's center from the town's center.
 * @param {NameTown} town - The town
 * @returns {Array<{x: number, y: number}>} One offset per spot
 */
export function spotOffsets(town) {
  const halfWidth = town.nameWidth / 2
  // Under the dot, with the usual gap between them
  const belowY = town.dotSize / 2 + NAME_GAP + town.nameHeight / 2
  const offsets = {
    below: { x: 0, y: belowY },
    right: { x: sideClearance(town, 1) + NAME_GAP + halfWidth, y: 0 },
    left: { x: -(sideClearance(town, -1) + NAME_GAP + halfWidth), y: 0 },
    belowRight: { x: halfWidth, y: belowY },
    belowLeft: { x: -halfWidth, y: belowY }
  }
  return NAME_SPOTS.map((spot) => offsets[spot])
}

/**
 * How far to one side of a town's center a name level with the dot has to
 * start to clear the dot, and any of the town's own icons that reach down
 * level with the name. With two or more icons, the fan's first and last
 * icons sit due left and due right of the dot (see `iconRingOffsets`), so
 * the name goes past them.
 * @param {NameTown} town - The town
 * @param {number} side - 1 for the right, -1 for the left
 * @returns {number} Distance from the town's center, in px
 */
export function sideClearance(town, side) {
  const halfIcon = COMMODITY_ICON_SIZE / 2
  // An icon is level with the name when their heights overlap
  const reach = town.icons
    .filter((icon) => icon.x * side > 0 && Math.abs(icon.y) < town.nameHeight / 2 + halfIcon)
    .map((icon) => Math.abs(icon.x) + halfIcon)
  return Math.max(town.dotSize / 2, ...reach)
}

/**
 * The box a town's dot covers.
 * @param {NameTown} town - The town
 * @returns {Box} The box
 */
function dotBox(town) {
  return boxAround(town.x, town.y, town.dotSize, town.dotSize)
}

/**
 * The box one of a town's commodity icons covers.
 * @param {NameTown} town - The town
 * @param {{x: number, y: number}} icon - The icon's center, from the town's center
 * @returns {Box} The box
 */
function iconBox(town, icon) {
  return boxAround(town.x + icon.x, town.y + icon.y, COMMODITY_ICON_SIZE, COMMODITY_ICON_SIZE)
}

/**
 * The box a town's name covers with its center at an offset from the town's.
 * @param {NameTown} town - The town
 * @param {{x: number, y: number}} offset - The name's center, from the town's center
 * @returns {Box} The box
 */
function nameBox(town, offset) {
  return boxAround(town.x + offset.x, town.y + offset.y, town.nameWidth, town.nameHeight)
}

/**
 * A box of a given size centered on a point.
 * @param {number} x - The center's x
 * @param {number} y - The center's y
 * @param {number} width - The box's width
 * @param {number} height - The box's height
 * @returns {Box} The box
 */
function boxAround(x, y, width, height) {
  return { left: x - width / 2, top: y - height / 2, right: x + width / 2, bottom: y + height / 2 }
}

/**
 * Whether two boxes overlap. Boxes that only touch along an edge do not:
 * a name right up against a dot still covers none of it.
 * @param {Box} a - One box
 * @param {Box} b - The other
 * @returns {boolean} True when they overlap
 */
function overlaps(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

/**
 * Whether a box lies wholly inside the map, so a name put there is not cut
 * off at the map's edge.
 * @param {Box} box - The box
 * @param {{width: number, height: number}} area - The map's size
 * @returns {boolean} True when it fits
 */
function isInside(box, area) {
  return box.left >= 0 && box.top >= 0 && box.right <= area.width && box.bottom <= area.height
}
