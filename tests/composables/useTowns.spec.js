/**
 * useTowns Composable Tests
 *
 * Town markers are part of the board, not something a player builds, so no
 * map tool may delete them. Geoman's removal mode — switched on by the
 * "Remove" button for tearing up track — offers up every layer on the map
 * unless told otherwise. Clicking a town while it was on used to take the town
 * off the map until the page was reloaded.
 *
 * Each town's commodity icons are shown in the map's Plan view only, so the
 * Build view stays clear for laying track.
 *
 * These tests run against a real Leaflet map with Geoman attached, because
 * the behavior under test is Geoman's own removal mode.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import L from 'leaflet'
import { useTowns } from '@/composables/map/useTowns'
import { useMapStore } from '@/stores/map'
import { BUILD_VIEW, PLAN_VIEW } from '@/composables/map/mapViews'

/** Two towns, enough to give the map bounds to fit */
const towns = [
  { name: 'Denver-Aurora', size: 'large', industries: [], lat: 39.74, lon: -104.99 },
  { name: 'Pueblo', size: 'small', industries: [], lat: 38.25, lon: -104.61 }
]

describe('useTowns', () => {
  let container
  let map

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    map = ref(L.map(container).setView([39, -105], 6))
  })

  afterEach(() => {
    map.value.remove()
    container.remove()
  })

  /**
   * Draws the test towns onto the map.
   * @returns {Array} The town markers
   */
  function drawTowns() {
    const { townsLayer, addTownsToMap } = useTowns()
    addTownsToMap(map, ref(towns))
    return townsLayer.value.getLayers()
  }

  describe('commodity icons', () => {
    it('should be shown in the Plan view', () => {
      const { commodityLayer, addTownsToMap } = useTowns()
      addTownsToMap(map, ref(towns))

      expect(map.value.hasLayer(commodityLayer.value)).toBe(true)
    })

    it('should be hidden in the Build view, and back in the Plan view', async () => {
      const mapStore = useMapStore()
      const { commodityLayer, addTownsToMap } = useTowns()
      addTownsToMap(map, ref(towns))

      mapStore.setViewMode(BUILD_VIEW)
      await nextTick()
      expect(map.value.hasLayer(commodityLayer.value)).toBe(false)

      mapStore.setViewMode(PLAN_VIEW)
      await nextTick()
      expect(map.value.hasLayer(commodityLayer.value)).toBe(true)
    })

    it('should be drawn hidden when the towns are drawn in the Build view', () => {
      useMapStore().setViewMode(BUILD_VIEW)
      const { commodityLayer, addTownsToMap } = useTowns()
      addTownsToMap(map, ref(towns))

      expect(map.value.hasLayer(commodityLayer.value)).toBe(false)
    })
  })

  describe('in removal mode', () => {
    it('should leave a clicked town on the map', () => {
      const [town] = drawTowns()

      map.value.pm.enableGlobalRemovalMode()
      town.fire('click')

      expect(map.value.hasLayer(town)).toBe(true)
    })

    it('should still protect towns after the global options are changed', () => {
      // The build composable sets Geoman's global options once the towns are
      // drawn, and Geoman pushes those onto every layer already on the map
      const [town] = drawTowns()
      map.value.pm.setGlobalOptions({ snappable: true, snapDistance: 50 })

      map.value.pm.enableGlobalRemovalMode()
      town.fire('click')

      expect(map.value.hasLayer(town)).toBe(true)
    })
  })
})
