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
 * and Escape backs out of either. Both happen in the map's Build view: starting
 * either switches the map to it, and switching to the Plan view ends them.
 *
 * Pricing: a line costs the grid cells it crosses, followed live as it is drawn.
 *
 * The region: track stays inside the state being played. A leg placed outside
 * it is taken back, and a finished line that leaves it is not built.
 *
 * Water: track crosses it on a bridge, whose cost the cursor shows, and a
 * crossing too long to bridge is refused like a leg out of the region.
 *
 * Track already built: a new line may cross it but not run alongside it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import L from 'leaflet'
import useBuildTrack from '@/composables/map/useBuildTrack'
import { useMapStore } from '@/stores/map'
import { BUILD_VIEW, PLAN_VIEW } from '@/composables/map/mapViews'
import { usePlayerStore } from '@/stores/players'
import { useTrackStore } from '@/stores/track'
import { useGameStore } from '@/stores/game'
import { useGridStore } from '@/stores/grid'
import { useTownsStore } from '@/stores/towns'
import { formatCurrency } from '@/composables/utils'
import { gridConfig } from '@/config/grid'
import { metersToLatitudeDegrees } from '@/composables/setup/useMapSupport'
import { gameRules } from '@/config/game'
import { nlcdCostMap } from '@/config/nlcd'

/**
 * A stand-in for the Leaflet map, with just enough surface for the
 * composable: real Leaflet events (so `on`/`off`/`fire` behave as they do in
 * the game), a record of which layers are on it, and stubs for the Geoman
 * calls the composable makes.
 *
 * Layers added here never get a `_map`, so they are never handed a renderer
 * and the track styling runs without drawing any SVG.
 *
 * @returns {Object} Fake map
 */
function createFakeMap() {
  const map = new L.Evented()
  const layers = new Set()
  const container = { style: {} }
  const panes = {}

  // Panes are only ever styled by the composable, so a bare style object will do
  map.getPane = (name) => panes[name]
  map.createPane = (name) => (panes[name] = { style: {} })

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
    // Kept, like the real thing, so a drawn line can be put in the pane
    // Geoman would put it in (see `createDrawnLine`)
    globalOptions: {},
    setLang: () => {},
    setGlobalOptions: (options) => Object.assign(map.pm.globalOptions, options),
    enableDraw: () => {},
    disableDraw: () => {},
    toggleGlobalRemovalMode: () => setRemovalMode(!removalMode),
    disableGlobalRemovalMode: () => setRemovalMode(false),
    globalRemovalModeEnabled: () => removalMode,
    Draw: { Line: {} }
  }

  return map
}

/** A single grid cell, enough for drawing to be allowed to start */
const pricedGrid = [{ id: 1, cost: 1000, centroid: { lat: 40, lng: -100 } }]

/**
 * Mounts a bare component that does nothing but run the composable, the way
 * the game view does. The map and towns go into the map store first, which is
 * where the composable looks for them when it mounts, and the grid into the
 * grid store.
 *
 * Every town marker given is also a major city in the towns store, so track
 * may be started from it (see the track builder). By default there is one,
 * where the saved section and drawn lines below start.
 *
 * @param {Object} map - Fake map from `createFakeMap`
 * @param {Object} [towns] - Layer group of town markers
 * @param {Array} [grid] - Cost grid; a non-empty one lets drawing start
 * @returns {Object} The mounted wrapper, plus the composable's exposed API
 */
function mountBuildTrack(map, towns = L.layerGroup([L.marker([40, -100])]), grid = pricedGrid) {
  const mapStore = useMapStore()
  mapStore.setMap(map)
  mapStore.setTownsLayer(towns)
  useGridStore().setGrid(grid)
  useTownsStore().setTowns(
    towns.getLayers().map((marker, i) => ({
      name: `City ${i}`,
      msa: String(i),
      lat: marker.getLatLng().lat,
      lon: marker.getLatLng().lng,
      size: 'large',
      industries: []
    }))
  )

  let api
  const Host = defineComponent({
    setup() {
      api = useBuildTrack(formatCurrency)
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
 *
 * Geoman puts the finished line in the pane named by its global
 * `panes.layerPane` option (Leaflet's overlay pane when none is set),
 * whatever pane the line's own options asked for, so the fake does the same.
 *
 * @param {Object} map - Fake map from `createFakeMap`
 * @returns {Object} A line layer marked as Geoman's Line shape
 */
function createDrawnLine(map) {
  const layer = L.polyline([
    [40, -100],
    [41, -101]
  ])
  layer.options.pane = map.pm.globalOptions.panes?.layerPane || 'overlayPane'
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

      map.fire('pm:create', { layer: createDrawnLine(map) })

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

      map.fire('pm:create', { layer: createDrawnLine(map) })

      expect(trackStore.segments).toHaveLength(0)
    })

    it('should leave no track or rails on the map', () => {
      trackStore.addSegment(savedSegment)
      const { wrapper } = mountBuildTrack(map)
      map.fire('pm:create', { layer: createDrawnLine(map) })

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

    it('should be switched off when the turn passes to another player', async () => {
      playerStore.addPlayer({ name: 'Bob', color: 'blue', cash: 20000 })
      const { api } = mountBuildTrack(map)
      api.toggleRemoveMode()

      playerStore.setActivePlayer(2)
      await nextTick()

      expect(api.isRemoving.value).toBe(false)
    })

    it('should be switched off once the last removable section is gone', async () => {
      const section = trackStore.addSegment(savedSegment)
      const { api } = mountBuildTrack(map)
      api.toggleRemoveMode()

      trackStore.removeSegment(section.id)
      await nextTick()

      expect(api.isRemoving.value).toBe(false)
    })

    it('should stay on while there is still something to remove', async () => {
      const first = trackStore.addSegment(savedSegment)
      trackStore.addSegment(savedSegment)
      const { api } = mountBuildTrack(map)
      api.toggleRemoveMode()

      trackStore.removeSegment(first.id)
      await nextTick()

      expect(api.isRemoving.value).toBe(true)
    })
  })

  /**
   * Track is drawn as three lines — rail, casing and ties — and a click in
   * removal mode lands on whichever is under the cursor. Every one of them has
   * to act on the whole section, or a click on the edge of the track would
   * tear up only part of the drawing and leave the rest behind.
   */
  describe('track built or loaded without the map', () => {
    it('should draw a section built through the track builder', async () => {
      mountBuildTrack(map)

      trackStore.addSegment(savedSegment)
      await nextTick()

      expect(map.trackLayers()).toHaveLength(1)
    })

    it("should replace the drawn track with a loaded game's", async () => {
      trackStore.addSegment(savedSegment)
      mountBuildTrack(map)

      // A loaded game numbers its sections from 1 too, so its section 1 is
      // not the old game's section 1
      trackStore.setTrack([
        {
          ...savedSegment,
          id: 1,
          coordinates: [
            { lat: 40, lng: -100 },
            { lat: 39, lng: -99 }
          ]
        }
      ])
      await nextTick()

      expect(map.trackLayers()).toHaveLength(1)
      expect(map.trackLayers()[0].getLatLngs()[1]).toMatchObject({ lat: 39, lng: -99 })
    })

    it('should not draw a line drawn on the map a second time', async () => {
      mountBuildTrack(map)
      // On the map already, as Geoman leaves a line it has just finished
      const line = createDrawnLine(map)
      map.addLayer(line)

      map.fire('pm:create', { layer: line })
      await nextTick()

      expect(map.trackLayers()).toEqual([line])
    })
  })

  describe('where a line may start', () => {
    it('should not build a line that starts away from a major city or own track', () => {
      // No town markers, so no major cities
      mountBuildTrack(map, L.layerGroup())

      map.fire('pm:create', { layer: createDrawnLine(map) })

      expect(trackStore.segments).toHaveLength(0)
    })
  })

  describe('a newly built section', () => {
    /**
     * The rail is the thinnest of the three lines, so if it is not on top the
     * casing and ties cover it and the player's color never shows.
     */
    it('should draw its rail above its casing and ties', () => {
      mountBuildTrack(map)
      const line = createDrawnLine(map)

      map.fire('pm:create', { layer: line })

      // The fake map has no overlay pane of its own; Leaflet gives it z-index 400
      const zIndexOf = (layer) => map.getPane(layer.options.pane)?.style.zIndex ?? 400
      const decorations = map.allLayers().filter((layer) => layer !== line)
      expect(decorations).toHaveLength(2)
      decorations.forEach((decoration) =>
        expect(zIndexOf(line)).toBeGreaterThan(zIndexOf(decoration))
      )
    })
  })

  describe('removing a section by clicking one of its lines', () => {
    /** The pane each of a section's three lines is drawn in */
    const linePanes = { rail: 'trackRails', casing: 'trackCasing', ties: 'trackTies' }

    /**
     * Finds the one line of the given kind on the map.
     * @param {Object} map - Fake map
     * @param {string} kind - 'rail', 'casing' or 'ties'
     * @returns {Object} The layer
     */
    function lineOfKind(map, kind) {
      return map.allLayers().find((layer) => layer.options.pane === linePanes[kind])
    }

    /**
     * Clicks a line in removal mode the way Geoman handles it: the clicked
     * layer comes off the map, then the removal is announced on the map.
     * @param {Object} map - Fake map
     * @param {Object} layer - The line clicked
     */
    function removeByClick(map, layer) {
      map.removeLayer(layer)
      map.fire('pm:remove', { layer })
    }

    it.each(['rail', 'casing', 'ties'])(
      'should tear up the whole section when its %s is clicked',
      (kind) => {
        trackStore.addSegment(savedSegment)
        mountBuildTrack(map)

        removeByClick(map, lineOfKind(map, kind))

        expect(trackStore.segments).toHaveLength(0)
        expect(map.allLayers()).toHaveLength(0)
      }
    )

    it.each(['rail', 'casing', 'ties'])(
      "should redraw another player's section once when its %s is clicked",
      (kind) => {
        // Owned by a player other than Ann, whose turn it is
        trackStore.addSegment({ ...savedSegment, ownerId: 2 })
        mountBuildTrack(map)

        removeByClick(map, lineOfKind(map, kind))

        expect(trackStore.segments).toHaveLength(1)
        // One rail, one casing and one set of ties: nothing lost, nothing doubled
        expect(map.allLayers().map((layer) => layer.options.pane)).toEqual(
          expect.arrayContaining(Object.values(linePanes))
        )
        expect(map.allLayers()).toHaveLength(3)
      }
    )
  })

  /**
   * A line is priced from the grid cells it crosses, while it is drawn and when
   * it is built. Each test draws along a row of cells running east from a town.
   */
  describe('pricing a line', () => {
    /** Degrees one grid cell spans, east-west and north-south at the equator */
    const CELL = metersToLatitudeDegrees(gridConfig.cellSize)
    /** A row of five cells along the equator, costing 100, 200, ... 500 */
    const rowGrid = [100, 200, 300, 400, 500].map((cost, i) => ({
      id: `0-${i}`,
      centroid: { lat: 0, lng: (i + 0.5) * CELL },
      cost
    }))
    /** The center of cell `i` of the row */
    const centerOf = (i) => L.latLng(0, (i + 0.5) * CELL)

    /**
     * Starts a line at a town in the first cell, the way Geoman does it: the
     * drawing starts, then the first vertex is placed and announced.
     * @returns {Object} The composable's API and the hint marker that follows the cursor
     */
    function startLineAtTown() {
      const hintMarker = L.marker(centerOf(0)).bindTooltip('')
      map.pm.Draw.Line._hintMarker = hintMarker
      const { api } = mountBuildTrack(map, L.layerGroup([L.marker(centerOf(0))]), rowGrid)
      api.startDrawingLine()

      const workingLayer = L.polyline([])
      map.fire('pm:drawstart', { workingLayer })
      workingLayer.addLatLng(centerOf(0))
      workingLayer.fire('pm:vertexadded', { latlng: centerOf(0) })

      return { api, hintMarker }
    }

    /**
     * Moves the cursor, and waits out the debounce on repricing it.
     * @param {Object} hintMarker - The marker Geoman moves with the cursor
     * @param {Object} latlng - Where the cursor goes
     */
    function moveCursor(hintMarker, latlng) {
      hintMarker.setLatLng(latlng)
      vi.advanceTimersByTime(200)
    }

    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('should charge for the cell the line starts in', () => {
      const { api } = startLineAtTown()

      expect(api.pendingCost.value).toBe(100)
    })

    // The bug: each cell the cursor entered was added to the price and never
    // taken off, so pulling a leg out and back left it costing the far end
    it('should cost less again once the cursor comes back toward the start', () => {
      const { api, hintMarker } = startLineAtTown()

      moveCursor(hintMarker, centerOf(4))
      expect(api.pendingCost.value).toBe(1500)

      moveCursor(hintMarker, centerOf(1))
      expect(api.pendingCost.value).toBe(300)
    })

    it('should charge the cells under the finished line, however the cursor wandered', () => {
      const { hintMarker } = startLineAtTown()
      moveCursor(hintMarker, centerOf(4))
      moveCursor(hintMarker, centerOf(2))

      const line = L.polyline([centerOf(0), centerOf(2)])
      line.pm = { _shape: 'Line' }
      map.fire('pm:create', { layer: line })

      expect(trackStore.segments[0].cost).toBe(600)
    })
  })

  describe('keeping track inside the region', () => {
    /** Degrees one grid cell spans along the equator */
    const CELL = metersToLatitudeDegrees(gridConfig.cellSize)
    /** A row of five cells along the equator, each costing 100 */
    const rowGrid = [0, 1, 2, 3, 4].map((i) => ({
      id: `0-${i}`,
      centroid: { lat: 0, lng: (i + 0.5) * CELL },
      cost: 100
    }))
    const centerOf = (i) => L.latLng(0, (i + 0.5) * CELL)
    /** A region covering the first three cells of the row, and not the last two */
    const region = {
      type: 'Feature',
      properties: { NAME: 'Testland' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, -CELL],
            [3 * CELL, -CELL],
            [3 * CELL, CELL],
            [0, CELL],
            [0, -CELL]
          ]
        ]
      }
    }

    /**
     * Starts a line at a town in the first cell, as Geoman does, with Geoman's
     * undo for the last vertex standing by.
     * @returns {Object} The API, the line being drawn and the cursor's marker
     */
    function startLineAtTown() {
      useGameStore().setRegion(region)
      const hintMarker = L.marker(centerOf(0)).bindTooltip('')
      const workingLayer = L.polyline([])
      map.pm.Draw.Line._hintMarker = hintMarker
      map.pm.Draw.Line._removeLastVertex = vi.fn(() =>
        workingLayer.setLatLngs(workingLayer.getLatLngs().slice(0, -1))
      )
      const { api } = mountBuildTrack(map, L.layerGroup([L.marker(centerOf(0))]), rowGrid)
      api.startDrawingLine()

      map.fire('pm:drawstart', { workingLayer })
      placeVertex(workingLayer, centerOf(0))
      return { api, workingLayer, hintMarker }
    }

    /** Places a vertex on the line, as Geoman does on a click */
    function placeVertex(workingLayer, latlng) {
      workingLayer.addLatLng(latlng)
      workingLayer.fire('pm:vertexadded', { latlng })
    }

    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('should keep a vertex placed inside the region', () => {
      const { api, workingLayer } = startLineAtTown()

      placeVertex(workingLayer, centerOf(2))

      expect(workingLayer.getLatLngs()).toHaveLength(2)
      expect(api.buildError.value).toBe('')
    })

    it('should take back a vertex placed outside the region, and say why', () => {
      const { api, workingLayer } = startLineAtTown()

      placeVertex(workingLayer, centerOf(4))

      expect(workingLayer.getLatLngs()).toHaveLength(1)
      expect(api.buildError.value).toBe("Track can't go outside Testland.")
      // Priced as the line now stands, without the leg taken back
      expect(api.pendingCost.value).toBe(100)
    })

    it('should say so on the cursor instead of a price while the leg leaves the region', () => {
      const { hintMarker } = startLineAtTown()

      hintMarker.setLatLng(centerOf(4))
      vi.advanceTimersByTime(200)

      expect(hintMarker.getTooltip().getContent()).toBe("Track can't go outside Testland.")
    })

    it('should not build or charge for a finished line that leaves the region', () => {
      const { api } = startLineAtTown()
      const cashBefore = playerStore.activePlayer.cash

      const line = L.polyline([centerOf(0), centerOf(4)])
      line.pm = { _shape: 'Line' }
      map.fire('pm:create', { layer: line })

      expect(trackStore.segments).toHaveLength(0)
      expect(playerStore.activePlayer.cash).toBe(cashBefore)
      expect(api.buildError.value).toMatch(/outside Testland/)
    })

    it('should build a finished line that stays inside the region', () => {
      startLineAtTown()

      const line = L.polyline([centerOf(0), centerOf(2)])
      line.pm = { _shape: 'Line' }
      map.fire('pm:create', { layer: line })

      expect(trackStore.segments).toHaveLength(1)
    })
  })

  describe('bridging water', () => {
    const CELL = metersToLatitudeDegrees(gridConfig.cellSize)
    const centerOf = (i) => L.latLng(0, (i + 0.5) * CELL)
    /** Land, then more water cells in a row than a bridge may cross, then land */
    const span = gameRules.bridges.maxCells + 1
    const grid = Array.from({ length: span + 2 }, (_, i) => {
      const isWater = i > 0 && i <= span
      return {
        id: `0-${i}`,
        centroid: { lat: 0, lng: (i + 0.5) * CELL },
        landCover: isWater ? nlcdCostMap[11] : 150,
        cost: isWater ? 10000 : 100
      }
    })

    function startLineAtTown() {
      const hintMarker = L.marker(centerOf(0)).bindTooltip('')
      const workingLayer = L.polyline([])
      map.pm.Draw.Line._hintMarker = hintMarker
      map.pm.Draw.Line._removeLastVertex = vi.fn(() =>
        workingLayer.setLatLngs(workingLayer.getLatLngs().slice(0, -1))
      )
      const { api } = mountBuildTrack(map, L.layerGroup([L.marker(centerOf(0))]), grid)
      api.startDrawingLine()
      map.fire('pm:drawstart', { workingLayer })
      workingLayer.addLatLng(centerOf(0))
      workingLayer.fire('pm:vertexadded', { latlng: centerOf(0) })
      return { api, workingLayer, hintMarker }
    }

    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it("should show how much of a leg's cost is a bridge", () => {
      const { hintMarker } = startLineAtTown()

      hintMarker.setLatLng(centerOf(1))
      vi.advanceTimersByTime(200)

      const bridge = formatCurrency(gameRules.bridges.costPerCell)
      expect(hintMarker.getTooltip().getContent()).toContain(`Cost: ${bridge} (bridge ${bridge})`)
    })

    it('should warn on the cursor that a line may not be finished on water', () => {
      const { hintMarker } = startLineAtTown()

      hintMarker.setLatLng(centerOf(1))
      vi.advanceTimersByTime(200)

      expect(hintMarker.getTooltip().getContent()).toMatch(/a bridge has to reach land/)
    })

    it('should take back a leg that makes a crossing begun on an earlier leg too long', () => {
      const { workingLayer } = startLineAtTown()
      const place = (latlng) => {
        workingLayer.addLatLng(latlng)
        workingLayer.fire('pm:vertexadded', { latlng })
      }

      // Partway over the water: a crossing as long as a bridge may be
      place(centerOf(span - 1))
      // On to land, over one more water cell: the crossing is now too long,
      // though this leg alone crosses no more water than allowed
      place(centerOf(span + 1))

      expect(workingLayer.getLatLngs()).toHaveLength(2)
    })

    it('should take back a leg that crosses more water than a bridge can', () => {
      const { api, workingLayer } = startLineAtTown()

      workingLayer.addLatLng(centerOf(span + 1))
      workingLayer.fire('pm:vertexadded', { latlng: centerOf(span + 1) })

      expect(workingLayer.getLatLngs()).toHaveLength(1)
      expect(api.buildError.value).toMatch(/Too much water to bridge/)
    })
  })

  describe('beside track already built', () => {
    const CELL = metersToLatitudeDegrees(gridConfig.cellSize)
    /** A three-by-five block of cells north of the equator, each costing 100 */
    const grid = [0, 1, 2].flatMap((row) =>
      [0, 1, 2, 3, 4].map((col) => ({
        id: `${row}-${col}`,
        centroid: { lat: (row + 0.5) * CELL, lng: (col + 0.5) * CELL },
        cost: 100
      }))
    )
    const centerOf = (row, col) => L.latLng((row + 0.5) * CELL, (col + 0.5) * CELL)

    /** Finishes a line along the given cell centers, as Geoman hands it over */
    function finishLine(...centers) {
      const line = L.polyline(centers)
      line.pm = { _shape: 'Line' }
      map.fire('pm:create', { layer: line })
    }

    beforeEach(() => {
      // Bo's line along the middle row, built on an earlier turn
      trackStore.addSegment({
        ownerId: 2,
        coordinates: [centerOf(1, 0), centerOf(1, 4)],
        cost: 500,
        turn: 0
      })
      // A city on the top row for Ann's lines to start from
      mountBuildTrack(map, L.layerGroup([L.marker(centerOf(0, 2))]), grid)
    })

    it('should build a line that crosses it', () => {
      finishLine(centerOf(0, 2), centerOf(2, 2))

      expect(trackStore.segments).toHaveLength(2)
    })

    it('should not build a line that runs alongside it', () => {
      finishLine(centerOf(1, 0), centerOf(1, 4))

      expect(trackStore.segments).toHaveLength(1)
    })
  })

  describe('when the map never finished setting up', () => {
    /**
     * Mounts with nothing in the map store, as happens when the map component
     * fails part way through its own setup.
     * @returns {Object} The mounted wrapper
     */
    function mountWithoutMap() {
      const Host = defineComponent({
        setup() {
          useBuildTrack(formatCurrency)
          return () => null
        }
      })
      return mount(Host)
    }

    it('should mount and unmount without throwing', () => {
      expect(() => mountWithoutMap().unmount()).not.toThrow()
    })
  })

  describe('the map view', () => {
    it('should switch to the Build view when a drawing starts', () => {
      const { api } = mountBuildTrack(map, L.layerGroup(), pricedGrid)

      api.startDrawingLine()

      expect(useMapStore().viewMode).toBe(BUILD_VIEW)
    })

    it('should stay in the Plan view when there is no grid to price a drawing', () => {
      const { api } = mountBuildTrack(map, L.layerGroup(), [])

      api.startDrawingLine()

      expect(useMapStore().viewMode).toBe(PLAN_VIEW)
    })

    it('should switch to the Build view when removal mode is switched on', () => {
      const { api } = mountBuildTrack(map)

      api.toggleRemoveMode()

      expect(useMapStore().viewMode).toBe(BUILD_VIEW)
    })

    it('should stop a drawing in progress when switched to the Plan view', () => {
      const { api } = mountBuildTrack(map, L.layerGroup(), pricedGrid)
      api.startDrawingLine()

      useMapStore().setViewMode(PLAN_VIEW)

      expect(api.isDrawingActive.value).toBe(false)
    })

    it('should switch removal mode off when switched to the Plan view', () => {
      const { api } = mountBuildTrack(map)
      api.toggleRemoveMode()

      useMapStore().setViewMode(PLAN_VIEW)

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
