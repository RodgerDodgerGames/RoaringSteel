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
 * and Escape backs out of either. Removing tears track up a leg at a time,
 * from the far end of a line. Both happen in the map's Build view: starting
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
 *
 * Stopping: Stop building, End turn and switching to the Plan view build the
 * line drawn so far; Escape throws it away. A click the player cannot pay for
 * ends the line, built back to the last vertex they can, and says why.
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
import { formatCurrency, formatShortCurrency } from '@/composables/utils'
import { gameRules } from '@/config/game'
import { makeTestGrid, CELL } from '../utils/testGrid'
import { pinPlainScale } from '../utils/boardScale'

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
  // A real element, so the cursor's style and classes behave as in the game
  const container = document.createElement('div')
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

  map.pm = {
    // Kept, like the real thing, so a drawn line can be put in the pane
    // Geoman would put it in (see `createDrawnLine`)
    globalOptions: {},
    setLang: () => {},
    setGlobalOptions: (options) => Object.assign(map.pm.globalOptions, options),
    enableDraw: () => {},
    disableDraw: () => {},
    Draw: { Line: {} }
  }

  return map
}

/** A single grid cell, enough for drawing to be allowed to start */
const pricedGrid = makeTestGrid({
  rows: 1,
  cols: 1,
  south: 40 - CELL / 2,
  west: -100 - CELL / 2,
  cell: () => ({ landCover: 1000 })
})

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
 * @param {Object|null} [grid] - Cost grid (see cellGrid.js); one with cells lets drawing start
 * @returns {Object} The mounted wrapper, plus the composable's exposed API
 */
function mountBuildTrack(map, towns = L.layerGroup([L.marker([40, -100])]), grid = pricedGrid) {
  const mapStore = useMapStore()
  mapStore.setMap(map)
  mapStore.setTownsLayer(towns)
  if (grid) useGridStore().setGrid(grid)
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
      api = useBuildTrack()
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

/**
 * Removal mode's targets on the map: the lines a click tears up track by
 * @param {Object} map - Fake map from `createFakeMap`
 * @returns {Array} The targets
 */
function removalTargets(map) {
  return map.allLayers().filter((layer) => layer.options.pane === 'trackRemoval')
}

/**
 * A line's points, as plain `[lat, lng]` pairs, for comparing
 * @param {Object} layer - A line on the map
 * @returns {Array<Array<number>>} Its points
 */
function pointsOf(layer) {
  return layer.getLatLngs().map(({ lat, lng }) => [lat, lng])
}

/** Presses Escape the way the browser would deliver it */
function pressEscape() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
}

describe('useBuildTrack', () => {
  let map
  let playerStore
  let trackStore
  let restorePrices

  beforeEach(() => {
    // These tests are about which cells are charged; a cell costs its terrain
    restorePrices = pinPlainScale()
    map = createFakeMap()
    playerStore = usePlayerStore()
    trackStore = useTrackStore()

    playerStore.addPlayer({ name: 'Ann', color: 'red', cash: 20000 })
    playerStore.startGame()
  })
  afterEach(() => restorePrices())

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

    it('should switch off removal mode the player left on, targets and all', () => {
      trackStore.addSegment(savedSegment)
      const { wrapper, api } = mountBuildTrack(map)
      api.toggleRemoveMode()

      wrapper.unmount()

      expect(api.isRemoving.value).toBe(false)
      expect(removalTargets(map)).toHaveLength(0)
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

  /**
   * While a player chooses where a line starts, the cursor turns to "not
   * allowed" over places it cannot start. It is set on the map's container,
   * so it has to be taken off again once the choosing is over.
   */
  describe('the "not allowed" cursor', () => {
    /** Far from the one major city, at [40, -100], so no line may start here */
    const awayFromCity = L.latLng(45, -90)

    /**
     * Moves the cursor over the map, the way Leaflet reports it.
     * @param {Object} latlng - Where the cursor goes
     */
    function moveCursor(latlng) {
      map.fire('mousemove', { latlng })
    }

    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('should show over a place a line cannot start', () => {
      const { api } = mountBuildTrack(map)
      api.startDrawingLine()

      moveCursor(awayFromCity)
      vi.advanceTimersByTime(100)

      expect(map.getContainer().style.cursor).toBe('not-allowed')
    })

    // The bug: it stayed up over the whole map after building stopped, until
    // the next drawing began
    it('should be cleared when building stops', async () => {
      const { api } = mountBuildTrack(map)
      api.startDrawingLine()
      await nextTick()
      moveCursor(awayFromCity)
      vi.advanceTimersByTime(100)

      api.cancelDrawing()
      await nextTick()

      expect(map.getContainer().style.cursor).toBe('')
    })

    // The check waits for the cursor to rest, so it can still be due when
    // building stops
    it('should not be put back by a check still due when building stopped', async () => {
      const { api } = mountBuildTrack(map)
      api.startDrawingLine()
      await nextTick()
      moveCursor(awayFromCity)

      api.cancelDrawing()
      await nextTick()
      vi.advanceTimersByTime(100)

      expect(map.getContainer().style.cursor).not.toBe('not-allowed')
    })

    // A click where a line cannot start begins the drawing again at once,
    // and the cursor is still over that place
    it('should stay up after a click where a line cannot start', async () => {
      const { api } = mountBuildTrack(map)
      api.startDrawingLine()
      const workingLayer = L.polyline([])
      map.fire('pm:drawstart', { workingLayer })
      await nextTick()
      moveCursor(awayFromCity)
      vi.advanceTimersByTime(100)

      workingLayer.fire('pm:vertexadded', { latlng: awayFromCity })
      await nextTick()

      expect(map.getContainer().style.cursor).toBe('not-allowed')
    })
  })

  /**
   * A line being drawn snaps only to the drawing player's own track. Geoman
   * leaves out of its snapping any layer whose `snapIgnore` option is true,
   * and snaps to a track rail with no such option.
   */
  describe('snapping', () => {
    /** Each player's section, as the track store holds it */
    const sectionOf = (ownerId) => ({ ...savedSegment, ownerId })

    /** The rail of the section drawn for a player's track */
    const railOf = (ownerId) => map.trackLayers().find((layer) => layer.segment.ownerId === ownerId)

    /** Whether Geoman would snap to a rail */
    const snapsTo = (rail) => rail.options.snapIgnore !== true

    it("should snap to the drawing player's own track, not to another player's", () => {
      trackStore.addSegment(sectionOf(1))
      trackStore.addSegment(sectionOf(2))
      const { api } = mountBuildTrack(map)

      api.startDrawingLine()

      expect(snapsTo(railOf(1))).toBe(true)
      expect(snapsTo(railOf(2))).toBe(false)
    })

    // Set to false, the option would make Geoman snap to the rail even if
    // it were otherwise kept out of Geoman's reach
    it('should leave the option off own track rather than set it to false', () => {
      trackStore.addSegment(sectionOf(1))
      const { api } = mountBuildTrack(map)

      api.startDrawingLine()

      expect(railOf(1).options).not.toHaveProperty('snapIgnore')
    })

    it('should follow whose turn it is', () => {
      playerStore.addPlayer({ name: 'Bo', color: 'blue', cash: 20000 })
      trackStore.addSegment(sectionOf(1))
      trackStore.addSegment(sectionOf(2))
      const { api } = mountBuildTrack(map)
      api.startDrawingLine()
      api.cancelDrawing()

      playerStore.setActivePlayer(2)
      api.startDrawingLine()

      expect(snapsTo(railOf(1))).toBe(false)
      expect(snapsTo(railOf(2))).toBe(true)
    })
  })

  describe('a newly built section', () => {
    /**
     * The rail goes on top of everything drawn with it. The ties share its
     * color, but a bridge's light gray deck, drawn in a pane between the two,
     * would hide the rail on every crossing if the rail sat lower.
     */
    it('should draw its rail above its ties', () => {
      mountBuildTrack(map)
      const line = createDrawnLine(map)

      map.fire('pm:create', { layer: line })

      // The fake map has no overlay pane of its own; Leaflet gives it z-index 400
      const zIndexOf = (layer) => map.getPane(layer.options.pane)?.style.zIndex ?? 400
      const decorations = map.allLayers().filter((layer) => layer !== line)
      expect(decorations).toHaveLength(1)
      decorations.forEach((decoration) =>
        expect(zIndexOf(line)).toBeGreaterThan(zIndexOf(decoration))
      )
    })
  })

  /**
   * In removal mode the far end of each line built this turn has a target
   * over it, which lights up under the cursor; clicking it tears up that
   * leg alone, and the target moves back to the line's new end. Each test
   * has a line of three points running east from a town, one cell apart.
   */
  describe('removing track by clicking the end of a line', () => {
    /** A row of three cells, each costing 1000, from the town east */
    const rowGrid = makeTestGrid({
      rows: 1,
      cols: 3,
      south: 40 - CELL / 2,
      west: -100 - CELL / 2,
      cell: () => ({ landCover: 1000 })
    })
    const points = [0, 1, 2].map((i) => ({ lat: 40, lng: -100 + i * CELL }))
    /** Ann's line, built this turn and paid for */
    const annsLine = { ownerId: 1, coordinates: points, cost: 3000, turn: 0 }

    /** Mounts with the row of cells, and removal mode switched on */
    function mountRemoving() {
      const mounted = mountBuildTrack(map, undefined, rowGrid)
      mounted.api.toggleRemoveMode()
      return mounted
    }

    it('should put a target over the last leg of a line built this turn', () => {
      trackStore.addSegment(annsLine)
      mountRemoving()

      expect(removalTargets(map)).toHaveLength(1)
      expect(pointsOf(removalTargets(map)[0])).toEqual([
        [40, points[1].lng],
        [40, points[2].lng]
      ])
    })

    it('should tear up only the last leg when its target is clicked, and refund it', async () => {
      trackStore.addSegment(annsLine)
      mountRemoving()

      removalTargets(map)[0].fire('click')
      await nextTick()

      expect(trackStore.segments[0].coordinates).toEqual(points.slice(0, 2))
      expect(trackStore.segments[0].cost).toBe(2000)
      expect(playerStore.players[0].cash).toBe(21000)
      // The rail on the map is the shortened line
      expect(map.trackLayers().map(pointsOf)).toEqual([
        [
          [40, points[0].lng],
          [40, points[1].lng]
        ]
      ])
    })

    it("should move the target back to the line's new end", async () => {
      trackStore.addSegment(annsLine)
      mountRemoving()

      removalTargets(map)[0].fire('click')
      await nextTick()

      expect(removalTargets(map)).toHaveLength(1)
      expect(pointsOf(removalTargets(map)[0])).toEqual([
        [40, points[0].lng],
        [40, points[1].lng]
      ])
    })

    it('should light a target up only while the cursor is over it', () => {
      trackStore.addSegment(annsLine)
      mountRemoving()
      const [target] = removalTargets(map)

      target.fire('mouseover')
      expect(target.options.opacity).toBeGreaterThan(0)

      target.fire('mouseout')
      expect(target.options.opacity).toBe(0)
    })

    it("should offer no target on another player's track or an earlier turn's", () => {
      trackStore.addSegment({ ...annsLine, ownerId: 2 })
      trackStore.addSegment({ ...annsLine, turn: 0 })
      useGameStore().advanceTurn()
      trackStore.addSegment({ ...annsLine, turn: 1 })
      mountRemoving()

      expect(removalTargets(map)).toHaveLength(1)
    })

    it('should say why a click is refused while a branch grows out of the end', async () => {
      trackStore.addSegment(annsLine)
      const branch = trackStore.addSegment({
        ownerId: 1,
        coordinates: [points[2], { lat: 40 + CELL, lng: points[2].lng }],
        cost: 1000,
        turn: 0
      })
      const { api } = mountRemoving()
      const lineTarget = removalTargets(map).find((target) =>
        target.getLatLngs()[0].equals(L.latLng(points[1]))
      )

      lineTarget.fire('click')
      await nextTick()

      expect(api.buildError.value).toBe('Remove your branch track first')
      expect(trackStore.segments).toHaveLength(2)
      expect(trackStore.getSegment(branch.id)).toBeDefined()
    })

    it('should take its targets off the map when switched off', () => {
      trackStore.addSegment(annsLine)
      const { api } = mountRemoving()

      api.toggleRemoveMode()

      expect(removalTargets(map)).toHaveLength(0)
    })
  })

  /**
   * A line is priced from the grid cells it crosses, while it is drawn and when
   * it is built. Each test draws along a row of cells running east from a town.
   */
  describe('pricing a line', () => {
    /** A row of five cells along the equator, costing 100, 200, ... 500 */
    const rowGrid = makeTestGrid({
      rows: 1,
      cols: 5,
      south: -CELL / 2,
      cell: (row, col) => ({ landCover: (col + 1) * 100 })
    })
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

    // It used to wait for the cursor to rest, so the price stood still for as
    // long as the cursor kept moving
    it('should keep repricing while the cursor is still moving', () => {
      const { api, hintMarker } = startLineAtTown()
      const prices = []

      // Out along the row without a pause long enough to count as a rest
      for (let i = 1; i <= 4; i++) {
        hintMarker.setLatLng(centerOf(i))
        vi.advanceTimersByTime(60)
        prices.push(api.pendingCost.value)
      }

      // Priced on the way, not only once it stopped
      expect(prices.slice(0, 3).some((price) => price > 100)).toBe(true)
      // And once it does stop, priced where it stopped
      vi.advanceTimersByTime(200)
      expect(api.pendingCost.value).toBe(1500)
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
    /** A row of five cells along the equator, each costing 100 */
    const rowGrid = makeTestGrid({
      rows: 1,
      cols: 5,
      south: -CELL / 2,
      cell: () => ({ landCover: 100 })
    })
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
      expect(api.buildError.value).toBe("Track can't go onto land outside Testland.")
      // Priced as the line now stands, without the leg taken back
      expect(api.pendingCost.value).toBe(100)
    })

    it('should say so on the cursor instead of a price while the leg leaves the region', () => {
      const { hintMarker } = startLineAtTown()

      hintMarker.setLatLng(centerOf(4))
      vi.advanceTimersByTime(200)

      expect(hintMarker.getTooltip().getContent()).toBe(
        "Track can't go onto land outside Testland."
      )
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
    const centerOf = (i) => L.latLng(0, (i + 0.5) * CELL)
    /**
     * Land, then more water cells in a row than a bridge may cross, then
     * land. The speed unit is one cell here (see `pinPlainScale`), so the
     * longest bridge is as many cells as it is speed units.
     */
    const span = gameRules.bridges.maxSpeedUnits + 1
    const grid = makeTestGrid({
      rows: 1,
      cols: span + 2,
      south: -CELL / 2,
      cell: (row, col) => {
        const isWater = col > 0 && col <= span
        return isWater ? { water: true } : { landCover: 100 }
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

      // One cell of water: the crossing's flat fee and a speed unit's worth
      // of bridge
      const { waterCrossing, perSpeedUnit } = gameRules.bridges
      const bridge = formatShortCurrency(waterCrossing + perSpeedUnit)
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

  describe("beside another player's track", () => {
    /** A four-by-five block of cells north of the equator, each costing 100 */
    const grid = makeTestGrid({ rows: 4, cols: 5, cell: () => ({ landCover: 100 }) })
    const centerOf = (row, col) => L.latLng((row + 0.5) * CELL, (col + 0.5) * CELL)
    let api

    /** Finishes a line along the given cell centers, as Geoman hands it over */
    function finishLine(...centers) {
      const line = L.polyline(centers)
      line.pm = { _shape: 'Line' }
      map.fire('pm:create', { layer: line })
    }

    beforeEach(() => {
      // Bo's line along the second row, built on an earlier turn
      trackStore.addSegment({
        ownerId: 2,
        coordinates: [centerOf(1, 0), centerOf(1, 4)],
        cost: 500,
        turn: 0
      })
      // A city on the first row for Ann's lines to start from
      ;({ api } = mountBuildTrack(map, L.layerGroup([L.marker(centerOf(0, 2))]), grid))
    })

    it('should build a line that crosses it and gets clear', () => {
      // Ends two cells — two speed units on this board — past Bo's line
      finishLine(centerOf(0, 2), centerOf(3, 2))

      expect(trackStore.segments).toHaveLength(2)
    })

    it('should not build a line that stops just past it, and say why', () => {
      // Ends one cell — one speed unit — past Bo's line: still beside it
      finishLine(centerOf(0, 2), centerOf(2, 2))

      expect(trackStore.segments).toHaveLength(1)
      expect(api.budgetNotice.value).toMatch(/beside another player's track/)
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
          useBuildTrack()
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
      const { api } = mountBuildTrack(map, L.layerGroup(), null)

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

  describe('stopping a line, and running out of money', () => {
    /** A row of five cells along the equator, each costing 1000 */
    const dearGrid = makeTestGrid({
      rows: 1,
      cols: 5,
      south: -CELL / 2,
      cell: () => ({ landCover: 1000 })
    })
    const playerId = () => playerStore.activePlayer.id
    const centerOf = (i) => L.latLng(0, (i + 0.5) * CELL)

    /**
     * Starts a line at a town in the first cell, with a stand-in for
     * Geoman's `_finishShape` that does what the real one does: hands the
     * line over in `pm:create`, unless it has only one point.
     * @returns {Object} The composable's API, the line being drawn, and the
     *   hint marker that follows the cursor
     */
    function startLineAtTown() {
      const hintMarker = L.marker(centerOf(0)).bindTooltip('')
      const workingLayer = L.polyline([])
      map.pm.Draw.Line._hintMarker = hintMarker
      map.pm.Draw.Line._finishShape = () => {
        const coords = workingLayer.getLatLngs()
        if (coords.length <= 1) return
        const line = L.polyline(coords)
        line.pm = { _shape: 'Line' }
        map.fire('pm:create', { layer: line })
      }
      const { api } = mountBuildTrack(map, L.layerGroup([L.marker(centerOf(0))]), dearGrid)
      api.startDrawingLine()
      map.fire('pm:drawstart', { workingLayer })
      place(workingLayer, centerOf(0))
      return { api, workingLayer, hintMarker }
    }

    /** Places a vertex the way Geoman does: on the line, then announced */
    function place(workingLayer, latlng) {
      workingLayer.addLatLng(latlng)
      workingLayer.fire('pm:vertexadded', { latlng })
    }

    /** The points of the one section built, as plain numbers */
    const builtPoints = () => trackStore.segments[0].coordinates.map(({ lng }) => lng)

    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('should build the line drawn so far when building is stopped', () => {
      const { api, workingLayer } = startLineAtTown()
      place(workingLayer, centerOf(1))
      place(workingLayer, centerOf(2))

      api.stopDrawing()

      expect(builtPoints()).toEqual([centerOf(0).lng, centerOf(1).lng, centerOf(2).lng])
      expect(api.isDrawingActive.value).toBe(false)
    })

    it('should build nothing, and stop, when only the start has been placed', () => {
      const { api } = startLineAtTown()

      api.stopDrawing()

      expect(trackStore.segments).toEqual([])
      expect(api.isDrawingActive.value).toBe(false)
    })

    it('should have a line to build only once a second point is placed', () => {
      const { api, workingLayer } = startLineAtTown()
      expect(api.hasLineToBuild.value).toBe(false)

      place(workingLayer, centerOf(1))
      expect(api.hasLineToBuild.value).toBe(true)

      api.stopDrawing()
      expect(api.hasLineToBuild.value).toBe(false)
    })

    it("should throw away, not build, a line still being drawn when the turn passes and the map goes to the next player's Plan view", () => {
      // Throwing in the hand mid-line ends the turn without building it, and
      // the next player, never having ended a turn, is shown the Plan view
      playerStore.addPlayer({ name: 'Bob', color: 'blue', cash: 20000 })
      const { api, workingLayer } = startLineAtTown()
      place(workingLayer, centerOf(1))
      const drawing = playerStore.activePlayer
      const next = playerStore.players.find((player) => player !== drawing)

      // What ending the turn does: the turn passes, then the map with it
      playerStore.setActivePlayer(next.id)
      useMapStore().passView(drawing, next)

      expect(trackStore.segments).toEqual([])
      expect(api.isDrawingActive.value).toBe(false)
    })

    it('should build the line drawn so far when switched to the Plan view', () => {
      const { workingLayer } = startLineAtTown()
      place(workingLayer, centerOf(1))

      useMapStore().setViewMode(PLAN_VIEW)

      expect(trackStore.segments).toHaveLength(1)
    })

    it('should throw the line away on Escape', () => {
      const { workingLayer } = startLineAtTown()
      place(workingLayer, centerOf(1))

      pressEscape()

      expect(trackStore.segments).toEqual([])
    })

    // The bug: a line that went over the allowance vanished whole, the
    // affordable part of it with it
    it('should build back to the last vertex within the allowance when a click goes over it', () => {
      // All but 3500 of the allowance already spent, leaving the cash just as
      // much: the allowance is what is said to run out
      playerStore.spendOnTrack(playerId(), gameRules.trackBudgetPerTurn - 3500)
      const { api, workingLayer } = startLineAtTown()
      place(workingLayer, centerOf(1)) // 2000
      place(workingLayer, centerOf(2)) // 3000
      place(workingLayer, centerOf(3)) // 4000: over the 3500 left

      expect(builtPoints()).toEqual([centerOf(0).lng, centerOf(1).lng, centerOf(2).lng])
      expect(trackStore.segments[0].cost).toBe(3000)
      expect(api.isDrawingActive.value).toBe(false)
      expect(api.budgetNotice.value).toBe(
        `Only ${formatCurrency(3000)} of this line was built — the rest would have gone over the ${formatCurrency(3500)} left of your ${formatCurrency(gameRules.trackBudgetPerTurn)} turn allowance.`
      )
    })

    it('should say a stopped line was built whole, so the turn can end', () => {
      const { api, workingLayer } = startLineAtTown()
      place(workingLayer, centerOf(1))

      expect(api.stopDrawing()).toBe(true)
    })

    it('should say a stopped line was cut short, so the turn stays open for the notice', () => {
      // Enough for the line as placed, not once the new leg is added; the
      // leg is pushed on without announcing it, as if Stop building came
      // straight after a click Geoman had not yet reported
      playerStore.updatePlayer(playerId(), { cash: 2500 })
      const { api, workingLayer } = startLineAtTown()
      place(workingLayer, centerOf(1))
      workingLayer.addLatLng(centerOf(2))

      expect(api.stopDrawing()).toBe(false)
      expect(api.budgetNotice.value).toMatch(/^Only/)
    })

    it('should build the line drawn so far when Remove a section is switched on', () => {
      const { api, workingLayer } = startLineAtTown()
      place(workingLayer, centerOf(1))

      api.toggleRemoveMode()

      expect(trackStore.segments).toHaveLength(1)
    })

    it('should blame the cash when that runs out before the allowance', () => {
      playerStore.updatePlayer(playerId(), { cash: 2500 })
      const { api, workingLayer } = startLineAtTown()
      place(workingLayer, centerOf(1)) // 2000
      place(workingLayer, centerOf(2)) // 3000: over the 2500 cash

      expect(trackStore.segments[0].cost).toBe(2000)
      expect(api.budgetNotice.value).toMatch(`the ${formatCurrency(2500)} cash you had`)
    })

    it('should build nothing, and say so, when the first leg is already too dear', () => {
      playerStore.updatePlayer(playerId(), { cash: 1500 })
      const { api, workingLayer } = startLineAtTown()
      place(workingLayer, centerOf(1)) // 2000

      expect(trackStore.segments).toEqual([])
      expect(api.budgetNotice.value).toMatch(/^None of this line was built/)
    })

    it('should keep the notice up until the next line starts', () => {
      playerStore.updatePlayer(playerId(), { cash: 2500 })
      const { api, workingLayer } = startLineAtTown()
      place(workingLayer, centerOf(1)) // 2000
      place(workingLayer, centerOf(2)) // 3000: over the 2500 cash, so the line ends

      expect(api.budgetNotice.value).not.toBe('')
      api.startDrawingLine()
      expect(api.budgetNotice.value).toBe('')
    })

    it('should warn on the cursor, in red, when the leg out to it is more than is left', async () => {
      playerStore.updatePlayer(playerId(), { cash: 2500 })
      const { api, hintMarker } = startLineAtTown()

      hintMarker.setLatLng(centerOf(3)) // 4000: 1500 over
      vi.advanceTimersByTime(200)
      await nextTick()

      expect(api.overBudgetBy.value).toBe(1500)
      expect(hintMarker.getTooltip().getContent()).toBe(
        `Insufficient funds: -${formatShortCurrency(1500)}`
      )
      expect(map.getContainer().classList.contains('is-over-budget')).toBe(true)
    })

    it('should take the warning down once the cursor comes back within budget', async () => {
      playerStore.updatePlayer(playerId(), { cash: 2500 })
      const { api, hintMarker } = startLineAtTown()
      hintMarker.setLatLng(centerOf(3))
      vi.advanceTimersByTime(200)
      await nextTick()

      hintMarker.setLatLng(centerOf(1))
      vi.advanceTimersByTime(200)
      await nextTick()

      expect(api.overBudgetBy.value).toBe(0)
      expect(hintMarker.getTooltip().getContent()).toMatch(/^Cost:/)
      expect(map.getContainer().classList.contains('is-over-budget')).toBe(false)
    })
  })
})
