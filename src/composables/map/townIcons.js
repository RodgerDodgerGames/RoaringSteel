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
 * so a town stands out from the terrain and is easy to aim track at. In both
 * views a town is the bare shape, with nothing drawn on it, and its
 * commodity icons fan out just clear of it.
 *
 * Shapes are solid, so the track running into a town passes under it rather
 * than showing through it. The shapes are filled with
 * TOWN_COLOR, drawn as inline SVG so the color can be set here rather than
 * baked into image files.
 *
 * @module composables/map/townIcons
 */

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
 * Each town size's icon: its shape, and the shape's width and height on the
 * map in px in the Build view (`size`) and in the Plan view (`planSize`).
 * The shapes are small enough to leave the terrain readable round a town and
 * large enough to click and draw track to. The Build view's shapes step up
 * by 6px a size, a little more than the Plan view's 4px, so the three sizes
 * are easy to tell apart when zoomed in.
 */
export const TOWN_ICONS = {
  small: { shape: 'circle', size: 20, planSize: 16 },
  medium: { shape: 'square', size: 26, planSize: 20 },
  large: { shape: 'hexagon', size: 32, planSize: 24 }
}

/**
 * Space between a town's shape and its name, in px. The Plan view's name
 * layout (townNames.js) keeps the same gap on every side it puts a name.
 */
export const NAME_GAP = 2

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
 * The markup for a town's icon on the map: its shape, filled with
 * TOWN_COLOR.
 * @param {string} size - The town's size
 * @param {string} [view] - The view the shape is sized for (see `shapeSize`);
 *   the Build view if left out
 * @returns {string} HTML for the inside of the town's marker
 */
export function townIconHtml(size, view) {
  const width = shapeSize(size, view)
  return `<svg class="town-shape" viewBox="0 0 24 24" width="${width}" height="${width}" aria-hidden="true"><g class="town-shape__fill" fill="${TOWN_COLOR}">${SHAPE_MARKUP[townIcon(size).shape]}</g></svg>`
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
