/**
 * Town Icons (townIcons.js)
 *
 * How each size of town is drawn on the map. Every town is a shape, as on
 * the Empire Builder board — a circle for a small town, a square for a medium
 * one, a hexagon for a large one — and the bigger towns are drawn bigger too.
 *
 * Each view draws the shapes at its own size. The Plan view shows the whole
 * board at once, so its shapes are smaller, leaving room for the commodity
 * icons round them. The Build view is zoomed in, and its shapes are bigger,
 * so a town stands out from the terrain and is easy to aim track at.
 *
 * In the Build view a building stands on each shape, its base a little below
 * the shape's middle and the rest rising above it: one house on a small town,
 * a cluster of houses on a medium one, a city skyline on a large one. In the
 * Plan view the buildings are hidden (see `.is-plan-view` in map.css), so the
 * map stays clear for the commodity icons fanned round each town.
 *
 * Shapes and buildings are solid, so the track running into a town passes
 * under it rather than showing through it. The shapes are filled with
 * TOWN_COLOR, drawn as inline SVG so the color can be set here rather than
 * baked into image files.
 *
 * @module composables/map/townIcons
 */

import houseUrl from '@/assets/icons/towns/house.svg'
import housesUrl from '@/assets/icons/towns/houses.png'
import cityUrl from '@/assets/icons/towns/city.png'
import { PLAN_VIEW } from '@/composables/map/mapViews'

/**
 * The color every town shape is filled with: plum, the game's original
 * purple. It is kept apart from the app's palette, so restyling the buttons
 * and panels never recolors the towns. No player may have a color too close
 * to it, or their track would blend into the towns it runs through; the
 * player colors' tests check that (tests/config/playerColors.spec.js).
 */
export const TOWN_COLOR = '#8A4D76'

/**
 * Each shape's outline, inside a 24×24 box. The white rim keeps a town
 * standing out on dark terrain; the stylesheet (`.town-shape__fill`) draws
 * it, and townIconHtml fills the shape with TOWN_COLOR.
 */
const SHAPE_MARKUP = {
  circle: '<circle cx="12" cy="12" r="10" stroke-width="3"/>',
  square: '<rect x="2.5" y="2.5" width="19" height="19" rx="1.5" stroke-width="3"/>',
  hexagon:
    '<polygon points="12,1.5 21.09,6.75 21.09,17.25 12,22.5 2.91,17.25 2.91,6.75" stroke-width="2.5" stroke-linejoin="round"/>'
}

/**
 * Each town size's icon: its shape; the shape's width and height on the map
 * in px in the Build view (`size`) and in the Plan view (`planSize`); and
 * the building that stands on it in the Build view, with that image's width
 * and height in px. The shapes are small enough to leave the terrain
 * readable round a town and large enough to click and draw track to; the
 * buildings are about as large, so their detail can be made out. A Build
 * view shape is a quarter bigger than its Plan view one.
 */
export const TOWN_ICONS = {
  small: { shape: 'circle', size: 20, planSize: 16, buildingUrl: houseUrl, buildingSize: 21 },
  medium: { shape: 'square', size: 25, planSize: 20, buildingUrl: housesUrl, buildingSize: 25 },
  large: { shape: 'hexagon', size: 30, planSize: 24, buildingUrl: cityUrl, buildingSize: 29 }
}

/**
 * How far below the middle of its shape a building's base sits, as a share
 * of the shape's height. A little below the middle, so the building looks
 * planted in the shape while most of the shape still shows round it.
 */
const BUILDING_BASE_DROP = 0.1

/** Space between the bottom of a town's shape and its name, in px */
const NAME_GAP = 2

/**
 * Half the height of a town's name on the map, in px. The name is centered
 * on the point it is placed at, so it has to be lowered by this much more to
 * hang below the shape rather than across it. Follows the name's font size
 * and line height in map.css (`.town-tooltip`); change them together.
 */
const NAME_HALF_HEIGHT = 9

/**
 * The icon for a town of a given size. A town whose size is missing or not
 * one of the three (a damaged save) is drawn as a small town rather than
 * not at all.
 * @param {string} size - The town's size: "small", "medium" or "large"
 * @returns {Object} The size's entry in TOWN_ICONS
 */
export function townIcon(size) {
  return TOWN_ICONS[size] ?? TOWN_ICONS.small
}

/**
 * How wide and tall a town's shape is drawn in a view.
 * @param {string} size - The town's size: "small", "medium" or "large"
 * @param {string} view - The map's view, PLAN_VIEW or BUILD_VIEW (see
 *   mapViews.js); any view but the Plan view draws the Build view's size
 * @returns {number} The shape's width and height, in px
 */
export function shapeSize(size, view) {
  const icon = townIcon(size)
  return view === PLAN_VIEW ? icon.planSize : icon.size
}

/**
 * Where a town's building goes: its top-left corner, in px from the top-left
 * corner of the town's shape as the Build view draws it (the only view that
 * shows buildings). Centered across the shape, with its base a
 * little below the shape's middle. The building is taller than the half of
 * the shape it stands in, so `top` comes out negative: it rises above.
 * @param {string} size - The town's size
 * @returns {{left: number, top: number}} The building's position in px
 */
export function buildingPosition(size) {
  const { size: shapeSize, buildingSize } = townIcon(size)
  const base = shapeSize / 2 + shapeSize * BUILDING_BASE_DROP
  return { left: (shapeSize - buildingSize) / 2, top: base - buildingSize }
}

/**
 * The markup for a town's icon on the map: its shape, filled with
 * TOWN_COLOR, with its building standing on it. The building is always
 * there; the Plan view hides it with CSS.
 * @param {string} size - The town's size
 * @param {string} [view] - The view the shape is sized for (see `shapeSize`);
 *   the Build view if left out
 * @returns {string} HTML for the inside of the town's marker
 */
export function townIconHtml(size, view) {
  const icon = townIcon(size)
  const width = shapeSize(size, view)
  const { left, top } = buildingPosition(size)
  const shape = `<svg class="town-shape" viewBox="0 0 24 24" width="${width}" height="${width}" aria-hidden="true"><g class="town-shape__fill" fill="${TOWN_COLOR}">${SHAPE_MARKUP[icon.shape]}</g></svg>`
  const buildingStyle = `left:${left}px;top:${top}px;width:${icon.buildingSize}px;height:${icon.buildingSize}px`
  const building = `<img class="town-building" src="${icon.buildingUrl}" alt="" style="${buildingStyle}" draggable="false">`
  return shape + building
}

/**
 * Where a town's name goes, as a pixel offset from the town's center: just
 * below its shape, which is taller for bigger towns and in the Build view.
 * @param {string} size - The town's size
 * @param {string} view - The view the shape is sized for (see `shapeSize`)
 * @returns {Array<number>} [x, y] offset in px, y downward
 */
export function townNameOffset(size, view) {
  return [0, shapeSize(size, view) / 2 + NAME_GAP + NAME_HALF_HEIGHT]
}
