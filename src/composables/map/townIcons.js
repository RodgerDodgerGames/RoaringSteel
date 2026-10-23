/**
 * Town Icons (townIcons.js)
 *
 * How each size of town is drawn on the map. Every town is a shape, as on
 * the Empire Builder board — a circle for a small town, a square for a medium
 * one, a hexagon for a large one — and the bigger towns are drawn bigger too.
 *
 * In the Build view a building stands on each shape, its base a little below
 * the shape's middle and the rest rising above it: one house on a small town,
 * a cluster of houses on a medium one, a city skyline on a large one. In the
 * Plan view the buildings are hidden (see `.is-plan-view` in map.css), so the
 * map stays clear for the commodity icons fanned round each town.
 *
 * Shapes and buildings are solid, so the track running into a town passes
 * under it rather than showing through it. The shapes are filled with the
 * app's primary color (Bulma's `--bulma-primary`, set from `$purple` in
 * roaring-steel.scss), so changing that color changes the towns too. That is
 * why the shapes are drawn as inline SVG rather than image files: an image
 * cannot pick up a CSS color.
 *
 * @module composables/map/townIcons
 */

import houseUrl from '@/assets/icons/towns/house.svg'
import housesUrl from '@/assets/icons/towns/houses.png'
import cityUrl from '@/assets/icons/towns/city.png'

/**
 * Each shape's outline, inside a 24×24 box. The white rim keeps a town
 * standing out on dark terrain. The fill is left to the stylesheet
 * (`.town-shape__fill`), which gives it the primary color.
 */
const SHAPE_MARKUP = {
  circle: '<circle cx="12" cy="12" r="10" stroke-width="3"/>',
  square: '<rect x="2.5" y="2.5" width="19" height="19" rx="1.5" stroke-width="3"/>',
  hexagon:
    '<polygon points="12,1.5 21.09,6.75 21.09,17.25 12,22.5 2.91,17.25 2.91,6.75" stroke-width="2.5" stroke-linejoin="round"/>'
}

/**
 * Each town size's icon: its shape, the shape's width and height on the map
 * in px, and the building that stands on it in the Build view, with that
 * image's width and height in px. The shapes are small enough to leave the
 * terrain readable round a town and large enough to click and draw track to;
 * the buildings are a little larger, so their detail can be made out.
 */
export const TOWN_ICONS = {
  small: { shape: 'circle', size: 16, buildingUrl: houseUrl, buildingSize: 17 },
  medium: { shape: 'square', size: 20, buildingUrl: housesUrl, buildingSize: 20 },
  large: { shape: 'hexagon', size: 24, buildingUrl: cityUrl, buildingSize: 23 }
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
 * Where a town's building goes: its top-left corner, in px from the top-left
 * corner of the town's shape. Centered across the shape, with its base a
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
 * The markup for a town's icon on the map: its shape, filled with the
 * primary color, with its building standing on it. The building is always
 * there; the Plan view hides it with CSS, so switching views needs no
 * redrawing.
 * @param {string} size - The town's size
 * @returns {string} HTML for the inside of the town's marker
 */
export function townIconHtml(size) {
  const icon = townIcon(size)
  const { left, top } = buildingPosition(size)
  const shape = `<svg class="town-shape" viewBox="0 0 24 24" width="${icon.size}" height="${icon.size}" aria-hidden="true"><g class="town-shape__fill">${SHAPE_MARKUP[icon.shape]}</g></svg>`
  const buildingStyle = `left:${left}px;top:${top}px;width:${icon.buildingSize}px;height:${icon.buildingSize}px`
  const building = `<img class="town-building" src="${icon.buildingUrl}" alt="" style="${buildingStyle}" draggable="false">`
  return shape + building
}

/**
 * Where a town's name goes, as a pixel offset from the town's center: just
 * below its shape, which is taller for bigger towns.
 * @param {string} size - The town's size
 * @returns {Array<number>} [x, y] offset in px, y downward
 */
export function townNameOffset(size) {
  return [0, townIcon(size).size / 2 + NAME_GAP + NAME_HALF_HEIGHT]
}
