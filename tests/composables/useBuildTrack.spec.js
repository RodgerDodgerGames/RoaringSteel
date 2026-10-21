/**
 * useBuildTrack Composable Tests
 *
 * Covers the composable's lifecycle against the map, and the map modes it
 * switches between.
 *
 * Lifecycle: whatever it puts on the map when its host component mounts —
 * event listeners and track layers — it has to take off again when that
 * component unmounts. The build controls used to live in a tab that mounted
 * and unmounted as the player switched tabs. Each visit added another full set
 * of map listeners and another copy of every saved section, so a section drawn
 * afterwards was charged for and recorded once per visit.
 *
 * Modes: drawing and removing both act on map clicks, so at most one may be on,
 * and Escape backs out of either.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import L from 'leaflet'
import useBuildTrack from '@/composables/map/useBuildTrack'
import { useMapStore } from '@/stores/map'
import { usePlayerStore } from '@/stores/players'
import { useTrackStore } from '@/stores/track'
import { formatCurrency } from '@/composables/utils'

/**
 * A stand-in for the Leaflet map, with just enough surface for the
 * composable: real Leaflet events (so `on`/`off`/`fire` behave as they do in
 * the game), a record of which layers are on it, and stubs for the Geoman
 * calls the composable makes.
 *
 * Layers added here never get a `_map`, so leaflet-textpath skips its SVG
 * work and the track styling runs without a renderer.
 *
 * @returns {Object} Fake map
 */
function createFakeMap() {
  const map = new L.Evented()
  const layers = new Set()
  const container = { style: {} }

  map.addLayer = (layer) => {
    layers.add(layer)
    return map
  }
  map.removeLayer = (layer) => {
    layers.delete(layer)
    return map
  }
  map.hasLayer = (layer) => layers.has(layer)
  map.getContainer = () => container

  /** @returns {Array} Every layer on the map, rail decorations included */
  map.allLayers = () => [...layers]

  /** @returns {Array} Layers on the map that draw a recorded track segment */
  map.trackLayers = () => [...layers].filter((layer) => layer.segmentId != null)

  // Geoman's removal mode, reduced to its on/off state. Like the real thing,
  // every change is announced on the map with `pm:globalremovalmodetoggled`.
  let removalMode = false
  const setRemovalMode = (enabled) => {
    removalMode = enabled
    map.fire('pm:globalremovalmodetoggled', { enabled })
  }

  map.pm = {
    setLang: () => {},
    setGlobalOptions: () => {},
    enableDraw: () => {},
    disableDraw: () => {},
    toggleGlobalRemovalMode: () => setRemovalMode(!removalMode),
    disableGlobalRemovalMode: () => setRemovalMode(false),
    globalRemovalModeEnabled: () => removalMode,
    Draw: { Line: {} }
  }

  return map
}

/**
 * Mounts a bare component that does nothing but run the composable, the way
 * the game view does. The map and towns go into the map store first, which is
 * where the composable looks for them when it mounts.
 * @param {Object} map - Fake map from `createFakeMap`
 * @param {Object} [towns] - Layer group of town markers
 * @param {Array} [grid] - Cost grid; a non-empty one lets drawing start
 * @returns {Object} The mounted wrapper, plus the composable's exposed API
 */
function mountBuildTrack(map, towns = L.layerGroup(), grid = []) {
  const mapStore = useMapStore()
  mapStore.setMap(map)
  // The store holds the ref useTowns hands it, not the bare layer group
  mapStore.setTownsLayer(ref(towns))

  let api
  const Host = defineComponent({
    setup() {
      api = useBuildTrack(ref(grid), formatCurrency)
      return () => null
    }
  })
  const wrapper = mount(Host)
  return { wrapper, api }
}

/** A single grid cell, enough for drawing to be allowed to start */
const pricedGrid = [{ id: 1, cost: 1000, centroid: { lat: 40, lng: -100 } }]

/** A saved section, as the track store holds one after a load */
const savedSegment = {
  ownerId: 1,
  coordinates: [
    { lat: 40, lng: -100 },
    { lat: 41, lng: -101 }
  ],
  cost: 1000,
  turn: 0
}

/**
 * Builds the layer Geoman hands over in `pm:create` when a player finishes
 * drawing a line.
 * @returns {Object} A line layer marked as Geoman's Line shape
 */
function createDrawnLine() {
  const layer = L.polyline([
    [40, -100],
    [41, -101]
  ])
  layer.pm = { _shape: 'Line' }
  return layer
}

/** Presses Escape the way the browser would deliver it */
function pressEscape() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
}

describe('useBuildTrack', () => {
  let map
  let playerStore
  let trackStore

  beforeEach(() => {
    map = createFakeMap()
    playerStore = usePlayerStore()
    trackStore = useTrackStore()

    playerStore.addPlayer({ name: 'Ann', color: 'red', cash: 20000 })
    playerStore.startGame()
  })

  describe('when the host is unmounted and mounted again', () => {
    it('should record a newly drawn section once', () => {
      mountBuildTrack(map).wrapper.unmount()
      mountBuildTrack(map)

      map.fire('pm:create', { layer: createDrawnLine() })

      expect(trackStore.segments).toHaveLength(1)
    })

    it('should draw each saved section once', () => {
      trackStore.addSegment(savedSegment)

      mountBuildTrack(map).wrapper.unmount()
      mountBuildTrack(map)

      expect(map.trackLayers()).toHaveLength(1)
    })
  })

  describe('when unmounted', () => {
    it('should stop responding to sections drawn on the map', () => {
      mountBuildTrack(map).wrapper.unmount()

      map.fire('pm:create', { layer: createDrawnLine() })

      expect(trackStore.segments).toHaveLength(0)
    })

    it('should leave no track or rails on the map', () => {
      trackStore.addSegment(savedSegment)
      const { wrapper } = mountBuildTrack(map)
      map.fire('pm:create', { layer: createDrawnLine() })

      wrapper.unmount()

      expect(map.allLayers()).toHaveLength(0)
    })

    it('should keep the sections in the track store for the next mount to draw', () => {
      trackStore.addSegment(savedSegment)

      mountBuildTrack(map).wrapper.unmount()

      expect(trackStore.segments).toHaveLength(1)
    })

    it('should stop listening for clicks on town markers', () => {
      const town = L.marker([40, -100])
      mountBuildTrack(map, L.layerGroup([town])).wrapper.unmount()

      expect(town.listens('click')).toBe(false)
    })

    it('should switch off removal mode the player left on', () => {
      const { wrapper, api } = mountBuildTrack(map)
      api.toggleRemoveMode()

      wrapper.unmount()

      expect(map.pm.globalRemovalModeEnabled()).toBe(false)
    })

    it('should clear any "not allowed" cursor left on the map', () => {
      const { wrapper } = mountBuildTrack(map)
      map.getContainer().style.cursor = 'not-allowed'

      wrapper.unmount()

      expect(map.getContainer().style.cursor).toBe('')
    })

    it('should stop answering Escape', () => {
      const { wrapper, api } = mountBuildTrack(map, L.layerGroup(), pricedGrid)
      api.startDrawingLine()
      wrapper.unmount()
      // Unmounting cancelled the drawing; put the flag back to see whether a
      // leftover key listener would clear it again
      useMapStore().setIsDrawingActive(true)

      pressEscape()

      expect(useMapStore().isDrawingActive).toBe(true)
    })
  })

  describe('removal mode', () => {
    it('should report removal mode as on once it is toggled on', () => {
      const { api } = mountBuildTrack(map)

      api.toggleRemoveMode()

      expect(api.isRemoving.value).toBe(true)
    })

    it('should report removal mode as off once it is toggled off again', () => {
      const { api } = mountBuildTrack(map)

      api.toggleRemoveMode()
      api.toggleRemoveMode()

      expect(api.isRemoving.value).toBe(false)
    })

    it('should follow removal mode switched off from outside the controls', () => {
      const { api } = mountBuildTrack(map)
      api.toggleRemoveMode()

      map.pm.disableGlobalRemovalMode()

      expect(api.isRemoving.value).toBe(false)
    })

    it('should stop a drawing in progress when switched on', () => {
      const { api } = mountBuildTrack(map, L.layerGroup(), pricedGrid)
      api.startDrawingLine()

      api.toggleRemoveMode()

      expect(api.isDrawingActive.value).toBe(false)
    })

    it('should be switched off when a drawing starts', () => {
      const { api } = mountBuildTrack(map, L.layerGroup(), pricedGrid)
      api.toggleRemoveMode()

      api.startDrawingLine()

      expect(api.isRemoving.value).toBe(false)
    })
  })

  describe('pressing Escape', () => {
    it('should stop a drawing in progress', () => {
      const { api } = mountBuildTrack(map, L.layerGroup(), pricedGrid)
      api.startDrawingLine()

      pressEscape()

      expect(api.isDrawingActive.value).toBe(false)
    })

    it('should switch removal mode off', () => {
      const { api } = mountBuildTrack(map)
      api.toggleRemoveMode()

      pressEscape()

      expect(api.isRemoving.value).toBe(false)
    })
  })
})
