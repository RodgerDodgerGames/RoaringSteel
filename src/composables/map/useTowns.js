/**
 * Towns Map Composable (useTowns.js)
 *
 * Handles rendering town markers on the Leaflet map.
 * Creates GeoJSON layers from town data with size-based icons,
 * tooltips showing town names, and popups showing industries.
 *
 * Each size of town has its own shape and size of icon, with a building
 * standing on it in the Build view (see townIcons.js); whatever its shape,
 * the comments here call a town's icon its dot. The dots are drawn bigger in
 * the Build view than in the Plan view, so every dot, its name and its
 * commodity icons are drawn again on each change of view.
 *
 * In the map's Plan view each town also shows what it produces: its
 * commodity icons fan out over the top of its dot (see commodityIcons.js),
 * as on the printed board. They are hidden in the Build view, so it stays
 * clear for laying track. Clicking a town in the Plan view goes to the Build
 * view over it and opens its popup there, which lists the same icons.
 *
 * The demand lines the player points at or pins on their cards are marked
 * here too (see demandMarks.js): a halo round each destination's dot, and
 * round the commodity's icon at every town producing it. In the Build view
 * those icons are the only ones shown. While a line is pointed at, the rest
 * of the towns are dimmed.
 *
 * While the train of the person whose turn it is stands in a town where it
 * may load, that town's commodity icons are shown in either view, ringed,
 * and clicking one picks the load up (see the train stop store).
 *
 * Where the map looks is not decided here: useMapView fits the Plan view
 * to the region.
 *
 * @module composables/map/useTowns
 */

import { shallowRef, watch, onUnmounted } from 'vue'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'

import { storeToRefs } from 'pinia'
import { useMapStore } from '@/stores/map'
import { useDemandCardsStore } from '@/stores/demandCards'
import { useTrainStopStore } from '@/stores/trainStop'
import { PLAN_VIEW } from '@/composables/map/mapViews'
import { escapeHtml } from '@/composables/utils'
import { demandMarks } from '@/composables/map/demandMarks'
import {
  COMMODITY_ICON_SIZE,
  commodityIconUrl,
  iconRingOffsets,
  iconRingRadius
} from '@/composables/map/commodityIcons'
import { iconClearance, shapeSize, townIconHtml, townNameOffset } from '@/composables/map/townIcons'

/**
 * The map pane the commodity icons are drawn in: above track (panes 410–430)
 * and below the town dots (Leaflet's marker pane, 600). Where a town's icons
 * spread over a neighboring town's dot, the dot stays on top, so it can
 * still be clicked for its popup.
 */
const COMMODITY_PANE = 'commodities'
const COMMODITY_PANE_Z_INDEX = 590

/**
 * Class on every town dot, name and commodity icon that belongs to a marked
 * demand line. They stay at full strength while the rest are dimmed.
 */
const MARKED_CLASS = 'is-demand-marked'

/**
 * Class on each commodity icon of the town the train stands in, while it may
 * load there: the icon is ringed, and a click on it picks the load up
 */
const PICKABLE_CLASS = 'is-pickable'

/** Class on the map while a demand line is pointed at, which dims the rest */
const HOVERING_CLASS = 'is-demand-hovering'

/** Class on the map in the Plan view, which hides the towns' buildings */
const PLAN_VIEW_CLASS = 'is-plan-view'

/**
 * How far a town's commodity icons are lifted above its neighbors' while one
 * of them is marked, so no neighbor's icons cover the marked one or its halo.
 * Leaflet stacks markers by latitude; this is well past any difference that
 * makes.
 */
const MARKED_RING_Z_OFFSET = 10000

/** Width of the white rim between a marked dot or icon and its halo, in px */
const HALO_RIM = 2

/** Width of each colored ring in a halo, in px */
const HALO_RING = 3

/**
 * The CSS box-shadow that draws a halo: a white rim, then one ring per
 * color, the first color innermost, and a soft glow round the outside so the
 * halo stands out against the map.
 * @param {Array<string>} colors - The marked lines' colors, at least one
 * @returns {string} A box-shadow value
 */
export function haloShadow(colors) {
  const rings = colors.map((color, i) => `0 0 0 ${HALO_RIM + HALO_RING * (i + 1)}px ${color}`)
  const outer = HALO_RIM + HALO_RING * colors.length
  return [`0 0 0 ${HALO_RIM}px #fff`, ...rings, `0 0 8px ${outer}px ${colors.at(-1)}`].join(', ')
}

/**
 * Marks or unmarks a town dot, name or commodity icon.
 * @param {HTMLElement} element - The element
 * @param {boolean} isMarked - Whether it belongs to a marked demand line
 * @param {Array<string>} [haloColors] - Colors to halo it in; none for no halo
 */
function setMark(element, isMarked, haloColors) {
  element.classList.toggle(MARKED_CLASS, isMarked)
  element.style.boxShadow = haloColors ? haloShadow(haloColors) : ''
}

/**
 * Composable for managing town markers on the map.
 *
 * @returns {Object} { townsLayer, addTownsToMap }
 */
export function useTowns() {
  // A shallowRef keeps the layer a plain Leaflet object rather than a Vue
  // proxy. This is the layer handed to the map store, which explains why.
  const townsLayer = shallowRef(null)

  /** The layer holding every town's commodity icons, once drawn */
  let commodityLayer = null

  /** Each town with the marker holding its commodity icons: [{ town, marker }] */
  let commodityMarkers = []

  /** The towns drawn, as given to `addTownsToMap` */
  let drawnTowns = []

  /** The map the towns were drawn on, once they have been */
  let townsMap = null

  // get access to isDrawingActive from map store
  const mapStore = useMapStore()
  const { isDrawingActive } = storeToRefs(mapStore)
  const demandCardsStore = useDemandCardsStore()
  const trainStopStore = useTrainStopStore()

  /**
   * The town the train can load in from the map, with the commodities it can
   * pick up there, or null. Not while track is being drawn, when a click on
   * the map belongs to the drawing.
   * @returns {{townId: string, industries: Set<string>}|null}
   */
  function pickableIcons() {
    const town = trainStopStore.loadingTown
    if (!town || isDrawingActive.value) return null
    const industries = trainStopStore.pickups
      .filter(({ hasRoom }) => hasRoom)
      .map(({ industry }) => industry)
    return { townId: town.msa, industries: new Set(industries) }
  }

  /**
   * Shows the commodity icons and town buildings the view calls for, and
   * marks the towns of the demand lines the player has picked out.
   *
   * Every commodity icon shows in the Plan view; in the Build view only the
   * icons of marked lines do. The towns' buildings are the other way round:
   * shown in the Build view, hidden in the Plan view. A town that is a marked line's destination or makes its
   * commodity keeps its dot and name clear of the dimming while the line is
   * pointed at; only the destination's dot gets a halo, since the producer's
   * halo goes on the commodity's icon.
   */
  function showMarks() {
    if (!townsMap) return
    const { isHovering, lines } = demandCardsStore.markedLines
    const { destinations, producers } = demandMarks(lines, drawnTowns)
    const isPlanView = mapStore.viewMode === PLAN_VIEW
    const pickable = pickableIcons()

    townsLayer.value.eachLayer((marker) => {
      const name = marker.feature.properties.name
      const isMarked = Boolean(destinations[name] || producers[name])
      setMark(marker.getElement(), isMarked, destinations[name])
      marker.getTooltip()?.getElement()?.classList.toggle(MARKED_CLASS, isMarked)
    })

    commodityMarkers.forEach(({ town, marker }) => {
      const isTrainHere = pickable !== null && pickable.townId === town.msa
      // One icon per industry, in the same order
      const icons = marker.getElement().querySelectorAll('.commodity-icon')
      town.industries.forEach(({ name }, i) => {
        const colors = producers[town.name]?.[name]
        const isPickable = isTrainHere && pickable.industries.has(name)
        setMark(icons[i], Boolean(colors), colors)
        icons[i].classList.toggle(PICKABLE_CLASS, isPickable)
        icons[i].title = isPickable ? `Pick up ${name}` : name
        // The train's town shows all it makes, so the player can load from it
        icons[i].hidden = !isPlanView && !colors && !isTrainHere
      })
      const isLifted = producers[town.name] || isTrainHere
      marker.setZIndexOffset(isLifted ? MARKED_RING_Z_OFFSET : 0)
    })

    townsMap.getContainer().classList.toggle(HOVERING_CLASS, isHovering)
    townsMap.getContainer().classList.toggle(PLAN_VIEW_CLASS, isPlanView)
  }

  watch(() => demandCardsStore.markedLines, showMarks)
  // Keyed on what can be loaded where, so the marks are not redrawn for
  // every change to the train or the hand that leaves that alone
  watch(() => {
    const pickable = pickableIcons()
    return pickable ? `${pickable.townId}|${[...pickable.industries].join('|')}` : ''
  }, showMarks)

  /**
   * Picks up the load whose icon was clicked, if it is one of the train's
   * town's. The click goes no further, so the map beneath does not take it
   * too (as a click to draw track from, say).
   * @param {MouseEvent} event - A click in the commodity icons' pane
   */
  function onCommodityClick(event) {
    const icon = event.target.closest?.(`.commodity-icon.${PICKABLE_CLASS}`)
    if (!icon) return
    L.DomEvent.stop(event)
    trainStopStore.pickUp(icon.dataset.industry)
  }
  watch(
    () => mapStore.viewMode,
    () => {
      drawForView()
      showMarks()
    }
  )

  /**
   * Draws every town's dot, name and commodity icons at the current view's
   * sizes (see `shapeSize`). A new icon is a new element, so the marks are
   * gone from it: `showMarks` has to follow.
   */
  function drawForView() {
    if (!townsMap) return
    const view = mapStore.viewMode
    townsLayer.value.eachLayer((marker) => {
      const size = marker.feature.properties.size
      marker.setIcon(townDivIcon(size, view))
      const tooltip = marker.getTooltip()
      if (tooltip) {
        tooltip.options.offset = L.point(townNameOffset(size, view))
        tooltip.update()
      }
    })
    commodityMarkers.forEach(({ town, marker }) => marker.setIcon(commodityDivIcon(town, view)))
  }

  /**
   * A town's dot, sized for a view. The marker is the size of the town's
   * shape, so the shape is what sits on the town's spot; its building
   * overflows above it.
   * @param {string} size - The town's size
   * @param {string} view - The map's view
   * @returns {Object} Leaflet DivIcon
   */
  function townDivIcon(size, view) {
    const width = shapeSize(size, view)
    return L.divIcon({
      html: townIconHtml(size, view),
      iconSize: [width, width],
      className: 'marker'
    })
  }

  /**
   * Adds town markers, and their commodity icons, to the map.
   *
   * @param {Ref<Object>} map - Reactive reference to Leaflet map instance
   * @param {Ref<Array>} towns - Reactive reference to array of town objects
   */
  const addTownsToMap = (map, towns) => {
    if (!map || !map.value) {
      // Check if map is available and initialized
      console.error('Map instance is not available')
      return
    }

    // Convert town data to GeoJSON format for Leaflet
    // Each town becomes a Point feature with its properties (name, size, industries)
    const geojson = {
      type: 'FeatureCollection',
      features: towns.value.map((town) => {
        // Separate coordinates from other properties
        const { lon, lat, ...properties } = town
        return {
          type: 'Feature',
          properties: properties, // name, size, industries, msa, etc.
          geometry: {
            type: 'Point',
            coordinates: [lon, lat] // GeoJSON uses [lng, lat] order
          }
        }
      })
    }

    // Create Leaflet layer from GeoJSON with custom marker rendering
    townsLayer.value = L.geoJSON(geojson, {
      // pointToLayer is called for each Point feature to create its marker
      pointToLayer: (feature, latlng) => {
        const size = feature.properties.size
        const marker = L.marker(latlng, { icon: townDivIcon(size, mapStore.viewMode) })

        // Towns are part of the board, so no map tool may delete them. Geoman's
        // removal mode — switched on to tear up track — otherwise takes any
        // layer that is clicked, and a clicked town vanished until a reload.
        // `allowRemoval` rather than `pmIgnore`: ignoring the marker outright
        // would also stop track from snapping to the town.
        marker.pm.setOptions({ allowRemoval: false })

        // Bind a tooltip to display the town's name
        marker.bindTooltip(feature.properties.name.split('-')[0], {
          permanent: true, // Make the tooltip always visible
          direction: 'center',
          className: 'town-tooltip',
          offset: townNameOffset(size, mapStore.viewMode)
        })

        // Add a click event handler to display town information
        marker.on('click', () => {
          // exit early if drawing is active
          if (isDrawingActive.value) return

          // Choosing a town for the train: the click is the choice, not a
          // request for the town's popup
          if (mapStore.townPicker) {
            mapStore.townPicker.onPick(feature.properties)
            return
          }

          // In the Plan view a click is a request to build there: the map
          // goes to the Build view over the town, and the popup opens there.
          // (The switch happens at once, so the popup opens on the Build view.)
          if (mapStore.viewMode === PLAN_VIEW) mapStore.showInBuildView([latlng.lat, latlng.lng])

          const options = { className: 'town-popup' }
          // industry content, each with the icon the Plan view shows for it
          const indContent =
            feature.properties.industries.length > 0
              ? feature.properties.industries
                  .map(
                    (industry) =>
                      `<li><img class="town-popup__icon" src="${commodityIconUrl(industry.industry)}" alt="">${industry.name}</li>`
                  )
                  .join('')
              : '<li>None</li>'
          const townInfo = `<div class="has-text-centered mb-3">
      <div class="title is-4 has-text-dark mb-2">${feature.properties.name}</div>
      <span class="has-text-grey-dark">Size: ${feature.properties.size}</span></div>
      <ul>Industries:${indContent}</ul>
      `
          L.popup(options).setLatLng(latlng).setContent(townInfo).openOn(map.value)
        })

        return marker
      }
    }).addTo(map.value)

    townsMap = map.value
    if (!townsMap.getPane(COMMODITY_PANE)) {
      const pane = townsMap.createPane(COMMODITY_PANE)
      pane.style.zIndex = COMMODITY_PANE_Z_INDEX
      L.DomEvent.on(pane, 'click', onCommodityClick)
    }
    drawnTowns = towns.value
    commodityMarkers = drawnTowns.map((town) => ({ town, marker: createCommodityMarker(town) }))
    commodityLayer = L.layerGroup(commodityMarkers.map(({ marker }) => marker)).addTo(townsMap)
    showMarks()
  }

  /**
   * Makes the marker that holds one town's commodity icons, fanned over the
   * top of the town's dot. Each icon names its commodity on hover.
   *
   * The marker itself is zero-sized and takes no clicks, and sits in a pane
   * below the town dots, so every dot still opens its popup. Geoman is told
   * to ignore it: it is not something track can snap to or a player can
   * remove.
   *
   * @param {Object} town - Town with lat, lon, size and industries
   * @returns {Object} Leaflet marker
   */
  const createCommodityMarker = (town) =>
    L.marker([town.lat, town.lon], {
      icon: commodityDivIcon(town, mapStore.viewMode),
      pane: COMMODITY_PANE,
      interactive: false,
      keyboard: false,
      pmIgnore: true
    })

  /**
   * A town's commodity icons, fanned round its dot as a view draws the dot,
   * clear of its building in the Build view (see `iconClearance`).
   * @param {Object} town - Town with size and industries
   * @param {string} view - The map's view
   * @returns {Object} Leaflet DivIcon
   */
  function commodityDivIcon(town, view) {
    const count = town.industries.length
    const offsets = iconRingOffsets(count, iconRingRadius(iconClearance(town.size, view), count))
    const half = COMMODITY_ICON_SIZE / 2
    const html = town.industries
      .map(({ name, industry }, i) => {
        const { x, y } = offsets[i]
        // Offsets are to each icon's center; the image is placed by its corner
        const style = `left:${x - half}px;top:${y - half}px;width:${COMMODITY_ICON_SIZE}px;height:${COMMODITY_ICON_SIZE}px`
        const label = escapeHtml(name)
        return `<img class="commodity-icon" src="${commodityIconUrl(industry)}" alt="${label}" title="${label}" data-industry="${label}" style="${style}" draggable="false">`
      })
      .join('')
    return L.divIcon({ html, className: 'commodity-ring', iconSize: [0, 0] })
  }

  onUnmounted(() => {
    if (townsLayer.value) {
      townsLayer.value.clearLayers()
    }
    commodityLayer?.remove()
  })

  return {
    townsLayer,
    addTownsToMap
  }
}
