/**
 * useBuildTrack Composable Tests
 *
 * Covers the composable's lifecycle against the map: whatever it puts on the
 * map when its host component mounts — event listeners and track layers — it
 * has to take off again when that component unmounts.
 *
 * The build controls used to live in a tab that mounted and unmounted as the
 * player switched tabs. Each visit added another full set of map listeners
 * and another copy of every saved section, so a section drawn afterwards was
 * charged for and recorded once per visit.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import L from 'leaflet'
import useBuildTrack from '@/composables/map/useBuildTrack'
import { usePlayerStore } from '@/stores/players'
import { useTrackStore } from '@/stores/track'
import { formatCurrency } from '@/composables/utils'

/**
 * A stand-in for the Leaflet map, with just enough surface for the
 * composable: real Leaflet events (so `on`/`off`/`fire` behave as they do in
 * the game), a record of which layers are on it, and stubs for the Geoman
 * calls made at mount.
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

  // Geoman's removal mode, reduced to the on/off state the composable controls
  let removalMode = false
  map.pm = {
    setLang: () => {},
    setGlobalOptions: () => {},
    enableDraw: () => {},
    disableDraw: () => {},
    toggleGlobalRemovalMode: () => {
      removalMode = !removalMode
    },
    disableGlobalRemovalMode: () => {
      removalMode = false
    },
    globalRemovalModeEnabled: () => removalMode,
    Draw: { Line: {} }
  }

  return map
}

/**
 * Mounts a bare component that does nothing but run the composable, the way
 * the build controls do.
 * @param {Object} map - Fake map from `createFakeMap`
 * @param {Object} [towns] - Layer group of town markers
 * @returns {Object} The mounted wrapper, plus the composable's exposed API
 */
function mountBuildTrack(map, towns = L.layerGroup()) {
  let api
  const Host = defineComponent({
    setup() {
      api = useBuildTrack({ map, towns: ref(towns) }, ref([]), formatCurrency)
      return () => null
    }
  })
  const wrapper = mount(Host)
  return { wrapper, api }
}

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

  describe('when the build controls are unmounted and mounted again', () => {
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
      api.enableRemoveMode()

      wrapper.unmount()

      expect(map.pm.globalRemovalModeEnabled()).toBe(false)
    })

    it('should clear any "not allowed" cursor left on the map', () => {
      const { wrapper } = mountBuildTrack(map)
      map.getContainer().style.cursor = 'not-allowed'

      wrapper.unmount()

      expect(map.getContainer().style.cursor).toBe('')
    })
  })
})
