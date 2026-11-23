/**
 * Off-Map Marks Composable (useOffMapMarks.js)
 *
 * Draws the labels on the edge of the Build view that point to marked towns
 * lying off the screen: an arrow turned toward the town, and the town's name,
 * haloed in the demand line's pin color as the town is on the map. Which
 * towns get one, and where each goes, is worked out in offMapMarks.js.
 *
 * - A destination's label names the commodity wanted there: "Denver · Coal".
 * - A producer's label shows the commodity's icon before the town's name.
 *
 * Clicking a label pans the map to its town.
 *
 * The labels are only drawn in the Build view: the Plan view shows the whole
 * region, so nothing marked is ever off it. They follow the map as it pans
 * and zooms, the marked lines as the player points at and pins them, and the
 * map's size.
 *
 * They are plain elements laid over the map's container rather than Leaflet
 * markers, since they stay put on the screen while the map moves under them.
 *
 * @module composables/map/useOffMapMarks
 */

import { watch, onUnmounted } from 'vue'
import L from 'leaflet'
import { useMapStore } from '@/stores/map'
import { useDemandCardsStore } from '@/stores/demandCards'
import { useTownsStore } from '@/stores/towns'
import { BUILD_VIEW } from '@/composables/map/mapViews'
import { commodityIconUrl } from '@/composables/map/commodityIcons'
import { haloShadow, haloWidth } from '@/composables/map/useTowns'
import { edgeAnchor, layoutEdgeLabels, offMapTargets } from '@/composables/map/offMapMarks'

/** Space between a label's halo and the map's edge, in px */
const EDGE_MARGIN = 4

/** Space between the halos of neighboring labels, in px */
const LABEL_GAP = 4

/**
 * The corner Leaflet's zoom buttons take at the top left of the Build view
 * (10px in from each edge, two 30px buttons with a border): the top row of
 * labels starts right of it and the left column below it.
 */
const ZOOM_BUTTONS = { width: 48, height: 84 }

/**
 * How far up from the map's bottom edge the bottom row of labels sits, to
 * clear the legend button (bottom left) and the Credits link (bottom right)
 */
const BOTTOM_CLEARANCE = 52

/** Class on the element holding every label */
const LAYER_CLASS = 'offmap-marks'

/** Class on a label while it sits on the right side, so its arrow comes last */
const RIGHT_SIDE_CLASS = 'is-right'

/**
 * @returns {Object} { attach }: `attach` hands over the Leaflet map once it
 *   exists, and starts drawing the labels on it
 */
export function useOffMapMarks() {
  const mapStore = useMapStore()
  const demandCardsStore = useDemandCardsStore()
  const townsStore = useTownsStore()

  /** The Leaflet map, once attached */
  let map = null

  /** The element over the map holding the labels, once attached */
  let layer = null

  /**
   * The labels on the map, by target key (see `offMapTargets`). A label is
   * made when its town goes off the screen and kept while it stays off, so
   * it is not rebuilt on every step of a pan.
   * @type {Map<string, {element: HTMLElement, arrow: HTMLElement}>}
   */
  const labels = new Map()

  /**
   * Makes the label for a target. Its content never changes, since the key
   * names the town, the commodity and whether it is the destination; its
   * colors, side and arrow's turn are set as it is placed.
   * @param {Object} target - One of `offMapTargets`' entries
   * @returns {{element: HTMLElement, arrow: HTMLElement}}
   */
  function makeLabel({ kind, town, industry }) {
    const element = L.DomUtil.create('button', 'offmap-mark', layer)
    element.type = 'button'
    const purpose =
      kind === 'destination'
        ? `Deliver ${industry} to ${town.name}`
        : `${industry} from ${town.name}`
    element.title = `${purpose}: click to go there`

    const arrow = L.DomUtil.create('i', 'fas fa-arrow-right offmap-mark__arrow', element)
    arrow.setAttribute('aria-hidden', 'true')

    if (kind === 'producer') {
      const code = town.industries.find(({ name }) => name === industry)?.industry
      const icon = L.DomUtil.create('img', 'offmap-mark__icon', element)
      icon.src = commodityIconUrl(code)
      icon.alt = industry
    }

    // Built with textContent, not HTML, so no name can inject markup
    L.DomUtil.create('span', 'offmap-mark__name', element).textContent = town.name
    if (kind === 'destination') {
      L.DomUtil.create('span', 'offmap-mark__commodity', element).textContent = `· ${industry}`
    }

    // The click pans to the town and goes no further, so the map beneath
    // does not take it too (as a click to draw track from, say)
    L.DomEvent.on(element, 'click', (event) => {
      L.DomEvent.stop(event)
      map?.panTo([town.lat, town.lon])
    })

    return { element, arrow }
  }

  /**
   * Works out which labels are wanted, makes the new ones, drops the ones no
   * longer wanted, and places them all. Called on every move of the map, so
   * each town is put on the screen once per call however many lines want it.
   */
  function place() {
    if (!map) return
    const { x: width, y: height } = map.getSize()

    const points = new Map()
    const pointOf = (town) => {
      if (!points.has(town.msa))
        points.set(town.msa, map.latLngToContainerPoint([town.lat, town.lon]))
      return points.get(town.msa)
    }
    const targets =
      mapStore.viewMode === BUILD_VIEW
        ? offMapTargets(demandCardsStore.markedLines.lines, townsStore.towns, pointOf, {
            width,
            height
          })
        : []

    const wanted = new Set(targets.map(({ key }) => key))
    labels.forEach(({ element }, key) => {
      if (wanted.has(key)) return
      element.remove()
      labels.delete(key)
    })
    targets.forEach((target) => {
      if (!labels.has(target.key)) labels.set(target.key, makeLabel(target))
    })
    if (targets.length === 0) return

    // The labels are measured every time, all before any is moved, so the
    // browser lays the page out once. Measuring every time keeps them right
    // after the names' font loads, which changes their width.
    const rect = {
      left: EDGE_MARGIN,
      top: EDGE_MARGIN,
      right: width - EDGE_MARGIN,
      bottom: height - BOTTOM_CLEARANCE
    }
    const center = { x: width / 2, y: height / 2 }
    const placed = targets.map((target) => {
      const { element } = labels.get(target.key)
      const halo = haloWidth(target.colors.length)
      return {
        target,
        key: target.key,
        ...edgeAnchor(center, target.point, rect),
        width: element.offsetWidth + 2 * halo,
        height: element.offsetHeight + 2 * halo
      }
    })

    // The left and right columns stop short of the top and bottom rows, and
    // the left column of the zoom buttons too, so nothing meets in a corner
    const rowHeight = Math.max(...placed.map(({ height: h }) => h)) + LABEL_GAP
    const ranges = {
      top: [rect.left + ZOOM_BUTTONS.width, rect.right],
      bottom: [rect.left, rect.right],
      left: [Math.max(rect.top + rowHeight, ZOOM_BUTTONS.height), rect.bottom - rowHeight],
      right: [rect.top + rowHeight, rect.bottom - rowHeight]
    }
    const centers = layoutEdgeLabels(placed, { rect, ranges, gap: LABEL_GAP })

    placed.forEach(({ key, side, angle, target }) => {
      const { element, arrow } = labels.get(key)
      const { x, y } = centers.get(key)
      element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
      element.style.boxShadow = haloShadow(target.colors)
      element.classList.toggle(RIGHT_SIDE_CLASS, side === 'right')
      arrow.style.transform = `rotate(${angle}deg)`
    })
  }

  watch(() => demandCardsStore.markedLines, place)
  watch(() => mapStore.viewMode, place)
  watch(() => townsStore.towns, place)

  /**
   * Starts drawing the labels on a map.
   * @param {Object} leafletMap - The Leaflet map
   */
  function attach(leafletMap) {
    map = leafletMap
    layer = L.DomUtil.create('div', LAYER_CLASS, map.getContainer())
    // Clicks and the wheel over a label are the label's, not the map's
    L.DomEvent.disableClickPropagation(layer)
    L.DomEvent.disableScrollPropagation(layer)
    map.on('move resize zoomend', place)
    place()
  }

  // Off the map before MainMap removes it (this hook was registered first)
  onUnmounted(() => {
    map?.off('move resize zoomend', place)
    layer?.remove()
    labels.clear()
    map = null
    layer = null
  })

  return { attach }
}
