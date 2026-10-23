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
 * Demand lines the player points at or pins on their cards mark their towns:
 * a halo round the destination's dot, and round the commodity's icon at each
 * town producing it, which the Build view then shows on its own.
 *
 * These tests run against a real Leaflet map with Geoman attached, because
 * the behavior under test is Geoman's own removal mode.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import L from 'leaflet'
import { useTowns } from '@/composables/map/useTowns'
import { useMapStore } from '@/stores/map'
import { useDemandCardsStore } from '@/stores/demandCards'
import { usePlayerStore } from '@/stores/players'
import { BUILD_VIEW, PLAN_VIEW } from '@/composables/map/mapViews'

/** Two towns, Pueblo producing two commodities */
const towns = [
  { name: 'Denver-Aurora', size: 'large', industries: [], lat: 39.74, lon: -104.99 },
  {
    name: 'Pueblo',
    size: 'small',
    industries: [
      { name: 'Coal Mining', industry: 2121 },
      { name: 'Iron and Steel Mills and Ferroalloy Manufacturing', industry: 3311 }
    ],
    lat: 38.25,
    lon: -104.61
  }
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

  /** Every commodity icon on the map, by the commodity it shows */
  function commodityIcons() {
    const icons = [...container.querySelectorAll('.commodity-icon')]
    return Object.fromEntries(icons.map((img) => [img.alt, img]))
  }

  /** Whether each of Pueblo's two commodity icons is hidden */
  const iconsHidden = () => Object.values(commodityIcons()).map((img) => img.hidden)

  describe('commodity icons', () => {
    it('should all be shown in the Plan view', () => {
      drawTowns()

      expect(iconsHidden()).toEqual([false, false])
    })

    it('should be hidden in the Build view, and back in the Plan view', async () => {
      const mapStore = useMapStore()
      drawTowns()

      mapStore.setViewMode(BUILD_VIEW)
      await nextTick()
      expect(iconsHidden()).toEqual([true, true])

      mapStore.setViewMode(PLAN_VIEW)
      await nextTick()
      expect(iconsHidden()).toEqual([false, false])
    })

    it('should be drawn hidden when the towns are drawn in the Build view', () => {
      useMapStore().setViewMode(BUILD_VIEW)
      drawTowns()

      expect(iconsHidden()).toEqual([true, true])
    })
  })

  describe('marking demand lines', () => {
    let demandCardsStore

    /** Ann's turn; her one card asks for coal at Denver */
    beforeEach(() => {
      usePlayerStore().setPlayers([{ id: 1, name: 'Ann', isTurn: true }])
      demandCardsStore = useDemandCardsStore()
      demandCardsStore.setDeck({
        drawPile: [],
        hands: {
          1: [
            {
              id: 1,
              demands: [
                { destination: 'Denver-Aurora', industry: 'Coal Mining', payoff: 9000 },
                { destination: 'Pueblo', industry: 'Tourism', payoff: 5000 },
                { destination: 'Denver-Aurora', industry: 'Wheat', payoff: 7000 }
              ]
            }
          ]
        }
      })
    })

    /** The dot of the town with the given name */
    function dotOf(markers, name) {
      return markers.find((marker) => marker.feature.properties.name === name).getElement()
    }

    it("should halo a pinned line's destination and the commodity where it is produced", async () => {
      const markers = drawTowns()

      demandCardsStore.togglePin(1, 0)
      await nextTick()

      expect(dotOf(markers, 'Denver-Aurora').classList).toContain('is-demand-marked')
      expect(dotOf(markers, 'Denver-Aurora').style.boxShadow).not.toBe('')
      expect(commodityIcons()['Coal Mining'].classList).toContain('is-demand-marked')
      expect(commodityIcons()['Coal Mining'].style.boxShadow).not.toBe('')
      // The producing town's other commodity is left as it was
      const steel = commodityIcons()['Iron and Steel Mills and Ferroalloy Manufacturing']
      expect(steel.classList).not.toContain('is-demand-marked')
    })

    it('should take the halos off when the line is unpinned', async () => {
      const markers = drawTowns()
      demandCardsStore.togglePin(1, 0)
      await nextTick()

      demandCardsStore.togglePin(1, 0)
      await nextTick()

      expect(dotOf(markers, 'Denver-Aurora').classList).not.toContain('is-demand-marked')
      expect(dotOf(markers, 'Denver-Aurora').style.boxShadow).toBe('')
      expect(commodityIcons()['Coal Mining'].style.boxShadow).toBe('')
    })

    it('should show just the marked commodity in the Build view', async () => {
      useMapStore().setViewMode(BUILD_VIEW)
      drawTowns()

      demandCardsStore.togglePin(1, 0)
      await nextTick()

      expect(commodityIcons()['Coal Mining'].hidden).toBe(false)
      expect(commodityIcons()['Iron and Steel Mills and Ferroalloy Manufacturing'].hidden).toBe(
        true
      )
    })

    it('should dim the rest of the map while a line is pointed at, and only then', async () => {
      drawTowns()

      demandCardsStore.hoverLine(1, 0)
      await nextTick()
      expect(container.classList).toContain('is-demand-hovering')

      demandCardsStore.endHover()
      await nextTick()
      expect(container.classList).not.toContain('is-demand-hovering')
    })

    it("should keep a producing town's dot and name clear of the dimming", async () => {
      const markers = drawTowns()

      demandCardsStore.hoverLine(1, 0)
      await nextTick()

      expect(dotOf(markers, 'Pueblo').classList).toContain('is-demand-marked')
      // Pueblo produces the coal, but is not where it is going
      expect(dotOf(markers, 'Pueblo').style.boxShadow).toBe('')
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
