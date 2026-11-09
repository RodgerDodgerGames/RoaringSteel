/**
 * useMapView Composable Tests
 *
 * The Plan view shows the whole region and cannot be moved; the Build view
 * can be moved, but only within its zoom range and not far past the region,
 * and it reopens wherever the player left it.
 *
 * These run against a real Leaflet map, because what is under test is how
 * the map responds to the player.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import L from 'leaflet'
import { useMapView } from '@/composables/map/useMapView'
import { useMapStore } from '@/stores/map'
import { useGameStore } from '@/stores/game'
import { useGridStore } from '@/stores/grid'
import { BUILD_VIEW, PLAN_VIEW, panLimits, buildZoomRange } from '@/composables/map/mapViews'
import { cellSizeFor } from '@/composables/boardScale'
import { makeTestGrid, CELL_METERS } from '../utils/testGrid'

/** A Colorado-shaped rectangle: 37–41°N, 109–102°W */
const colorado = {
  type: 'Feature',
  properties: { NAME: 'Colorado', STATE: '08' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-109, 37],
        [-102, 37],
        [-102, 41],
        [-109, 41],
        [-109, 37]
      ]
    ]
  }
}

/** Its box, as [[south, west], [north, east]] */
const coloradoBox = [
  [37, -109],
  [41, -102]
]
const coloradoBounds = L.latLngBounds(coloradoBox)

/**
 * The Build view's zoom range for the cells Colorado's grid will be cut into.
 * With the grid settings at the time of writing, cells are about 1.3 km and
 * the range is 8 to 9; it moves whenever those settings change.
 */
const coloradoRange = buildZoomRange(cellSizeFor([-109, 37, -102, 41]) / 1000, 39)

describe('useMapView', () => {
  let container
  let map
  let wrapper
  let mapStore
  let mapView

  beforeEach(() => {
    useGameStore().setRegion(colorado)
    mapStore = useMapStore()

    // happy-dom does no layout, so the map is told its size the way a
    // browser would report it
    container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 1000 })
    Object.defineProperty(container, 'clientHeight', { value: 700 })
    document.body.appendChild(container)
    map = L.map(container).setView([40, -100], 3)

    const Host = defineComponent({
      setup() {
        mapView = useMapView()
        return () => null
      }
    })
    wrapper = mount(Host)
    mapView.attach(map)
  })

  afterEach(() => {
    wrapper.unmount()
    map.remove()
    container.remove()
  })

  /**
   * Moves the map the way a player dragging or zooming it would. Leaflet
   * moves by whole pixels, so the center lands within about 0.002° of the one
   * asked for at zoom 8.
   */
  function moveTo(center, zoom) {
    map.setView(center, zoom, { animate: false })
  }

  describe('the Plan view', () => {
    it('should be the view the map opens in', () => {
      expect(mapStore.viewMode).toBe(PLAN_VIEW)
    })

    it('should show the whole region', () => {
      expect(map.getBounds().contains(coloradoBounds)).toBe(true)
    })

    it('should fill the map with the region, not show it small', () => {
      // The zoom at which the region, with its 16px border, exactly fits.
      // Left to whole zoom levels, the map could be up to half as big.
      const fitZoom = map.getBoundsZoom(coloradoBounds, false, L.point(32, 32))
      expect(map.getZoom()).toBeCloseTo(fitZoom, 5)
    })

    it('should not let the player drag or zoom the map', () => {
      expect(map.dragging.enabled()).toBe(false)
      expect(map.scrollWheelZoom.enabled()).toBe(false)
      expect(map.doubleClickZoom.enabled()).toBe(false)
      expect(map.zoomControl._map).toBeFalsy()
    })

    it('should put the whole region back if something moves the map', () => {
      // A drag's glide or zoom left over from the Build view can still land
      // after the switch to the Plan view
      map.panBy([300, 0], { animate: false })

      expect(map.getBounds().contains(coloradoBounds)).toBe(true)
    })

    it('should not record its fitting as where the Build view was', () => {
      mapView.refit()

      expect(mapStore.mapZoom).toBeNull()
    })
  })

  describe('the Build view', () => {
    /** The zoom the Plan view fitted the region at */
    let planZoom

    beforeEach(() => {
      planZoom = map.getZoom()
      mapStore.setViewMode(BUILD_VIEW)
    })

    it('should open closer than the Plan view, over the middle of the region', () => {
      // One level closer, unless that is further out than the Build view goes
      expect(map.getZoom()).toBe(Math.max(Math.floor(planZoom) + 1, coloradoRange.min))
      expect(map.getZoom()).toBeGreaterThan(planZoom)
      expect(map.getCenter().lat).toBeCloseTo(39, 5)
      expect(map.getCenter().lng).toBeCloseTo(-105.5, 5)
    })

    it('should let the player drag and zoom the map', () => {
      expect(map.dragging.enabled()).toBe(true)
      expect(map.scrollWheelZoom.enabled()).toBe(true)
      expect(map.zoomControl._map).toBe(map)
    })

    it("should hold zoom to the range for the region's cells", () => {
      expect(map.getMinZoom()).toBe(coloradoRange.min)
      expect(map.getMaxZoom()).toBe(coloradoRange.max)

      map.setZoom(18, { animate: false })

      expect(map.getZoom()).toBe(coloradoRange.max)
    })

    it('should take the zoom range from the cells of the grid in play', () => {
      // A grid of 10 km cells, as a game saved before cells followed the
      // board has
      useGridStore().setGrid(makeTestGrid({ rows: 2, cols: 2, south: 37, west: -109 }))
      mapStore.setViewMode(PLAN_VIEW)
      mapStore.setViewMode(BUILD_VIEW)

      expect(map.getMaxZoom()).toBe(buildZoomRange(CELL_METERS / 1000, 39).max)
    })

    it('should stop panning a little past the edge of the region', () => {
      expect(map.options.maxBounds).toEqual(L.latLngBounds(panLimits(coloradoBox)))
    })

    // These move to the Build view's closest zoom, which depends on the cell
    // size the grid settings give Colorado, rather than to a fixed level
    // that a change to those settings could put out of range

    it('should reopen where the player left it', () => {
      moveTo([38.3, -104.6], coloradoRange.max)

      mapStore.setViewMode(PLAN_VIEW)
      mapStore.setViewMode(BUILD_VIEW)

      expect(map.getZoom()).toBe(coloradoRange.max)
      expect(map.getCenter().lat).toBeCloseTo(38.3, 2)
      expect(map.getCenter().lng).toBeCloseTo(-104.6, 2)
    })

    it('should record where it is for the save', () => {
      moveTo([38.3, -104.6], coloradoRange.max)

      expect(mapStore.mapZoom).toBe(coloradoRange.max)
      expect(mapStore.mapCenter[0]).toBeCloseTo(38.3, 2)
    })

    it('should open a game loaded from the top bar in the Plan view', () => {
      moveTo([38.3, -104.6], 9)

      // What loading a save does: every store is reset, the region first and
      // the map's view after it, then the save's region is put back
      const gameStore = useGameStore()
      gameStore.reset()
      mapStore.reset()
      gameStore.setGameState({ region: colorado, turn: 0 })

      expect(map.getBounds().contains(coloradoBounds)).toBe(true)
      expect(map.dragging.enabled()).toBe(false)
    })

    it('should give the region back whole when switched to the Plan view', () => {
      moveTo([38.3, -104.6], 9)

      mapStore.setViewMode(PLAN_VIEW)

      expect(map.getBounds().contains(coloradoBounds)).toBe(true)
      expect(map.dragging.enabled()).toBe(false)
    })
  })
})
