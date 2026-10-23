/**
 * Towns Map Composable (useTowns.js)
 *
 * Handles rendering town markers on the Leaflet map.
 * Creates GeoJSON layers from town data with size-based icons,
 * tooltips showing town names, and popups showing industries.
 *
 * Icon sizes vary by town size class:
 * - Small: 24px
 * - Medium: 28px
 * - Large: 32px
 *
 * In the map's Plan view each town also shows what it produces: its
 * commodity icons fan out over the top of its dot (see commodityIcons.js),
 * as on the printed board. They are a separate layer, put on the map only
 * in the Plan view, so the Build view stays clear for laying track. The
 * town popup lists the same icons in either view.
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
import { PLAN_VIEW, planPopupOffset } from '@/composables/map/mapViews'
import {
  COMMODITY_ICON_SIZE,
  commodityIconUrl,
  iconRingOffsets,
  iconRingRadius
} from '@/composables/map/commodityIcons'

/**
 * The map pane the commodity icons are drawn in: above track (panes 410–430)
 * and below the town dots (Leaflet's marker pane, 600). Where a town's icons
 * spread over a neighboring town's dot, the dot stays on top, so it can
 * still be clicked for its popup.
 */
const COMMODITY_PANE = 'commodities'
const COMMODITY_PANE_Z_INDEX = 590

/**
 * Composable for managing town markers on the map.
 *
 * @returns {Object} { townsLayer, commodityLayer, addTownsToMap }
 */
export function useTowns() {
  // A shallowRef keeps the layer a plain Leaflet object rather than a Vue
  // proxy. This is the layer handed to the map store, which explains why.
  const townsLayer = shallowRef(null)

  /**
   * Every town's commodity icons, one marker per town. Kept raw for the
   * same reason as the towns layer.
   */
  const commodityLayer = shallowRef(null)

  /** The map the towns were drawn on, once they have been */
  let townsMap = null

  // get access to isDrawingActive from map store
  const mapStore = useMapStore()
  const { isDrawingActive } = storeToRefs(mapStore)

  /**
   * Shows the commodity icons in the Plan view and hides them in the Build
   * view.
   */
  function showCommodities() {
    if (!commodityLayer.value || !townsMap) return
    if (mapStore.viewMode === PLAN_VIEW) commodityLayer.value.addTo(townsMap)
    else commodityLayer.value.remove()
  }

  watch(() => mapStore.viewMode, showCommodities)

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

    console.log('GeoJSON data prepared:', geojson)

    // Create Leaflet layer from GeoJSON with custom marker rendering
    townsLayer.value = L.geoJSON(geojson, {
      // pointToLayer is called for each Point feature to create its marker
      pointToLayer: (feature, latlng) => {
        const size = feature.properties.size
        const icon = L.icon({
          iconUrl: getIconUrl(size),
          iconSize: [getIconSize(size), getIconSize(size)],
          className: 'marker'
        })

        const marker = L.marker(latlng, { icon: icon })

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
          offset: [0, 20]
        })

        // Add a click event handler to display town information
        marker.on('click', () => {
          // exit early if drawing is active
          if (isDrawingActive.value) return

          // popup options. The Plan view is fixed in place, so a popup there
          // must not pan the map to fit itself in (see `keepPopupInView`).
          const isPlanView = mapStore.viewMode === PLAN_VIEW
          const options = {
            className: 'town-popup',
            autoPan: !isPlanView
          }
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
          const popup = L.popup(options).setLatLng(latlng).setContent(townInfo).openOn(map.value)
          if (isPlanView) keepPopupInView(popup)
        })

        return marker
      }
    }).addTo(map.value)

    townsMap = map.value
    if (!townsMap.getPane(COMMODITY_PANE)) {
      townsMap.createPane(COMMODITY_PANE).style.zIndex = COMMODITY_PANE_Z_INDEX
    }
    commodityLayer.value = L.layerGroup(towns.value.map(createCommodityMarker))
    showCommodities()
  }

  /**
   * Keeps a popup opened in the Plan view inside the map. The Plan view is
   * fixed in place, so the popup cannot pan the map to fit itself in the way
   * it does in the Build view; it is moved instead (see `planPopupOffset`).
   *
   * @param {Object} popup - The town's popup, just opened
   */
  const keepPopupInView = (popup) => {
    const element = popup.getElement()
    const { offset, showTip } = planPopupOffset(
      { width: element.offsetWidth, height: element.offsetHeight },
      townsMap.latLngToContainerPoint(popup.getLatLng()),
      townsMap.getSize()
    )
    popup.options.offset = L.point(offset)
    element.classList.toggle('town-popup--no-tip', !showTip)
    popup.update()
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
  const createCommodityMarker = (town) => {
    const count = town.industries.length
    const offsets = iconRingOffsets(count, iconRingRadius(getIconSize(town.size), count))
    const half = COMMODITY_ICON_SIZE / 2
    const html = town.industries
      .map(({ name, industry }, i) => {
        const { x, y } = offsets[i]
        // Offsets are to each icon's center; the image is placed by its corner
        const style = `left:${x - half}px;top:${y - half}px;width:${COMMODITY_ICON_SIZE}px;height:${COMMODITY_ICON_SIZE}px`
        return `<img class="commodity-icon" src="${commodityIconUrl(industry)}" alt="${name}" title="${name}" style="${style}" draggable="false">`
      })
      .join('')

    return L.marker([town.lat, town.lon], {
      icon: L.divIcon({ html, className: 'commodity-ring', iconSize: [0, 0] }),
      pane: COMMODITY_PANE,
      interactive: false,
      keyboard: false,
      pmIgnore: true
    })
  }

  /**
   * Returns the icon URL for a given town size class.
   * @param {string} size - Town size: "small", "medium", or "large"
   * @returns {string} URL to the icon image
   */
  const getIconUrl = (size) => {
    switch (size) {
      case 'small':
        return new URL('@/assets/icons/towns/small.png', import.meta.url).href
      case 'medium':
        return new URL('@/assets/icons/towns/medium.png', import.meta.url).href
      case 'large':
        return new URL('@/assets/icons/towns/large.png', import.meta.url).href
      default:
        return new URL('@/assets/icons/towns/small.png', import.meta.url).href
    }
  }

  /**
   * Returns the icon pixel size for a given town size class.
   * @param {string} size - Town size: "small", "medium", or "large"
   * @returns {number} Icon size in pixels
   */
  const getIconSize = (size) => {
    switch (size) {
      case 'small':
        return 24
      case 'medium':
        return 28
      case 'large':
        return 32
    }
  }

  onUnmounted(() => {
    if (townsLayer.value) {
      townsLayer.value.clearLayers()
    }
    commodityLayer.value?.remove()
  })

  return {
    townsLayer,
    commodityLayer,
    addTownsToMap
  }
}
