/**
 * Town Icons (townIcons.js)
 *
 * How each size of town is drawn on the map. As on the Empire Builder board,
 * the shape says how big a town is at a glance — a circle for a small town, a
 * square for a medium one, a hexagon for a large one — and the bigger towns
 * are drawn bigger too.
 *
 * The icons are solid, with a white rim, so the track running into a town
 * passes under it rather than showing through it, and the town still stands
 * out against dark terrain.
 *
 * @module composables/map/townIcons
 */

import smallIconUrl from '@/assets/icons/towns/small.svg'
import mediumIconUrl from '@/assets/icons/towns/medium.svg'
import largeIconUrl from '@/assets/icons/towns/large.svg'

/**
 * Each town size's icon: the image, and its width and height on the map in
 * px. Small enough to leave the terrain readable around a town, large enough
 * to click and to draw track to.
 */
export const TOWN_ICONS = {
  small: { url: smallIconUrl, size: 12 },
  medium: { url: mediumIconUrl, size: 15 },
  large: { url: largeIconUrl, size: 20 }
}

/** Space between the bottom of a town's icon and its name, in px */
const NAME_GAP = 2

/**
 * Half the height of a town's name on the map, in px. The name is centered
 * on the point it is placed at, so it has to be lowered by this much more to
 * hang below the icon rather than across it. Follows the name's font size
 * and line height in map.css (`.town-tooltip`); change them together.
 */
const NAME_HALF_HEIGHT = 9

/**
 * The icon for a town of a given size. A town whose size is missing or not
 * one of the three (a damaged save) is drawn as a small town rather than
 * not at all.
 * @param {string} size - The town's size: "small", "medium" or "large"
 * @returns {{url: string, size: number}} The icon's image and its size in px
 */
export function townIcon(size) {
  return TOWN_ICONS[size] ?? TOWN_ICONS.small
}

/**
 * Where a town's name goes, as a pixel offset from the town's center: just
 * below its icon, which is taller for bigger towns.
 * @param {string} size - The town's size
 * @returns {Array<number>} [x, y] offset in px, y downward
 */
export function townNameOffset(size) {
  return [0, townIcon(size).size / 2 + NAME_GAP + NAME_HALF_HEIGHT]
}
