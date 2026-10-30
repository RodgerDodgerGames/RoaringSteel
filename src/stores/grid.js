/**
 * Grid Store (grid.js)
 *
 * Generates and manages the square grid laid over the game map.
 * Each grid cell holds terrain data that affects railroad building costs:
 * - Elevation: Higher elevation differences = more expensive to build
 * - Land Cover: Different terrain types have different building costs
 *
 * The grid is used during gameplay to calculate the cost of laying track
 * across different terrain types. Costs are calculated using a focal
 * operation that considers neighboring cell elevations.
 *
 * The grid is a `CellGrid` (see composables/map/cellGrid.js): rows and
 * columns of cells with their terrain in typed arrays. It is kept out of
 * Vue's reactivity on purpose — a shallow ref, holding an object marked raw
 * — because it is only ever replaced whole, never changed in place, and
 * reading it through reactive proxies made pricing a line many times slower.
 * Anything watching `grid` still hears when a new grid replaces the old.
 *
 * @module stores/grid
 */

import { defineStore } from 'pinia'
import { ref, shallowRef, computed, markRaw } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { useElevationTiles } from '../composables/setup/useElevationTiles'
import { useLandCoverAPI } from '../composables/setup/useLandCoverAPI'
import {
  metersToLatitudeDegrees,
  metersToLongitudeDegrees
} from '../composables/setup/useMapSupport'
import { WATER_LAND_COVER } from '@/composables/map/water'
import {
  createCellGrid,
  setCell,
  cellAt,
  rowOf,
  colOf,
  isEmptyGrid,
  packGrid,
  unpackGrid
} from '@/composables/map/cellGrid'
import { gridApiConfig } from '@/config/grid'
import { isRefusal, refusalMessage } from '@/composables/utils'

/**
 * Whether a cell, with its terrain filled in, belongs on the board.
 *
 * It needs both a height and a land cover. The NLCD has no land cover beyond
 * the US border or out at sea, so those cells drop out here.
 *
 * Water at or below sea level is the sea, and drops out too, as it always
 * has: the sea is not part of the board. A lake stays — it is water above sea
 * level — and is bridged like any other water. (The rare lake below sea
 * level, such as the Salton Sea, cannot be told from the sea this way and
 * drops out with it.) Land stays at any height, including at sea level or
 * below it (coastal Louisiana, Death Valley).
 *
 * @param {number|null} elevation - The cell's height, in meters
 * @param {number|null} landCover - The cell's land cover cost
 * @returns {boolean} True if the cell is kept
 */
function isUsableCell(elevation, landCover) {
  if (!Number.isFinite(elevation) || landCover == null) return false
  return !(landCover === WATER_LAND_COVER && elevation <= 0)
}

export const useGridStore = defineStore('gridStore', () => {
  /** The grid (see cellGrid.js), or null before one is built or loaded */
  const grid = shallowRef(null)

  /** Flag indicating if grid generation is complete */
  const isGridGenerated = ref(false)

  /** Loading state for elevation data fetching */
  const isLoadingElevation = ref(false)

  /** Loading state for land cover data fetching */
  const isLoadingLandCover = ref(false)

  /** Progress tracking for elevation fetching */
  const elevationProgress = ref({ completed: 0, total: 0 })

  /** Progress tracking for land cover fetching */
  const landCoverProgress = ref({ completed: 0, total: 0 })

  /** Current phase of grid generation ('' when idle) */
  const currentPhase = ref('')

  /** Player-facing message when generation fails, otherwise null */
  const error = ref(null)

  /**
   * Combined progress percentage across both fetch phases.
   *
   * Progress is counted in requests — elevation tiles and land cover
   * pictures — but a request count alone does not track the wait the player
   * sees, because the two are shaped differently: elevation is many small
   * tiles, land cover a few large pictures. Each phase is weighted by the
   * wall time it is expected to cost, so the bar moves at a roughly even rate
   * throughout.
   */
  const progressPercent = computed(() => {
    const totalMs =
      estimatedElevationMs(elevationProgress.value.total) +
      estimatedLandCoverMs(landCoverProgress.value.total)
    if (totalMs === 0) return 0

    const doneMs =
      estimatedElevationMs(elevationProgress.value.completed) +
      estimatedLandCoverMs(landCoverProgress.value.completed)

    // Floor, not round: 397 of 399 rounds to 100% and reads as a finished
    // setup, which is exactly how a stalled run disguised itself as a hang (#85).
    // Only a genuinely complete run should ever show 100.
    return Math.min(100, Math.floor((doneMs / totalMs) * 100))
  })

  /**
   * Wall time a number of elevation tiles is expected to cost, in ms: each
   * takes about `elevationRequestMs`, `elevationConcurrency` at a time.
   */
  function estimatedElevationMs(tileCount) {
    return (tileCount * gridApiConfig.elevationRequestMs) / gridApiConfig.elevationConcurrency
  }

  /** The same for land cover pictures */
  function estimatedLandCoverMs(imageCount) {
    return (imageCount * gridApiConfig.landCoverRequestMs) / gridApiConfig.landCoverConcurrency
  }

  const { planElevations } = useElevationTiles()
  const { landCoverYearFor, planLandCover } = useLandCoverAPI()

  /**
   * `useLocalStorage` registers storage listeners and a deep watcher that
   * nothing here disposes of. Binding once per state rather than once per
   * attempt keeps a retry loop from stacking up live bindings to the same key.
   */
  const cacheBindings = new Map()

  function cachedGridFor(stateFipsCode) {
    const key = `cachedGrid_${stateFipsCode}`
    if (!cacheBindings.has(key)) {
      cacheBindings.set(key, useLocalStorage(key, {}))
    }
    return cacheBindings.get(key)
  }

  /**
   * Generates a grid of cells covering the specified bounds.
   * Fetches elevation and land cover data for each cell, then calculates costs.
   * Uses localStorage caching to avoid redundant API calls.
   *
   * The cache holds the year of land cover the grid was drawn from: the year
   * the server served, which is the closest it has to the year asked for.
   * Each new game asks the server which year that is now, one small request,
   * and uses the cache only when it is the same year. So a game whose data
   * window has moved on builds its grid again, as does one where the server
   * has since added a year closer to the one asked for, or a cache from
   * before the year was recorded.
   *
   * If the server cannot say — it is down, or the player is offline — the
   * cached grid is used as it is, whatever year it was drawn from, as the
   * towns are when the Census Bureau is down.
   *
   * @param {string} stateFipsCode - State FIPS code for cache key
   * @param {Array<number>} bounds - Bounding box [minLng, minLat, maxLng, maxLat]
   * @param {number} cellSize - Grid cell size in meters
   * @param {number} landCoverYear - The year to take land cover from: the
   *   middle year of the game's data window (see dataWindow.js)
   * @returns {Promise<boolean>} True when a usable grid was produced
   */
  async function generateGrid(stateFipsCode, bounds, cellSize, landCoverYear) {
    elevationProgress.value = { completed: 0, total: 0 }
    landCoverProgress.value = { completed: 0, total: 0 }
    currentPhase.value = 'initializing'
    error.value = null
    isGridGenerated.value = false

    // `useLocalStorage` automatically binds `grid` to `localStorage`
    const cachedGrid = cachedGridFor(stateFipsCode)

    // A cache from before grids were packed holds a list of cells instead,
    // which does not unpack; it is built again like any other missing cache
    const { landCoverYear: cachedYear, grid: packedCache } = cachedGrid.value
    const cached = unpackGrid(packedCache)
    const hasCachedCells = !isEmptyGrid(cached)

    /** Plays with the cached grid */
    function loadCachedGrid() {
      grid.value = markRaw(cached)
      isGridGenerated.value = true
      currentPhase.value = ''
      return true
    }

    // The year of land cover the server will draw: the one asked for, or the
    // closest it has
    let servedYear
    try {
      servedYear = await landCoverYearFor(landCoverYear)
    } catch (e) {
      console.error('Error looking up land cover years:', e)
      if (hasCachedCells) return loadCachedGrid()
      return fail(
        isRefusal(e)
          ? refusalMessage('The land cover server', 'its years', e)
          : 'Could not reach the land cover server. Check your connection and retry.'
      )
    }

    // check if grid already exists in cache, drawn from the same year
    if (cachedYear === servedYear && hasCachedCells) return loadCachedGrid()

    // cell size is in meters so convert to degrees
    // find mean latitude
    // bounds is in [minX, minY, maxX, maxY]
    const meanLat = (bounds[3] + bounds[1]) / 2
    const lngCellSize = metersToLongitudeDegrees(cellSize, meanLat)
    const latCellSize = metersToLatitudeDegrees(cellSize)

    const rows = Math.floor((bounds[3] - bounds[1]) / latCellSize)
    const cols = Math.floor((bounds[2] - bounds[0]) / lngCellSize)

    // The center of every cell in the rectangle, row by row from the south,
    // in the order the grid numbers its cells (see cellGrid.js): the terrain
    // that comes back for location k is cell k's. The grid itself is only
    // published to `grid` once the data is in, so nothing already there — a
    // grid restored from a save, say — can mix with the new one.
    const locations = []
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        locations.push({
          lat: bounds[1] + (i + 0.5) * latCellSize,
          lng: bounds[0] + (j + 0.5) * lngCellSize
        })
      }
    }

    if (locations.length === 0) {
      return fail('That region is too small to build a grid from. Try selecting a larger area.')
    }

    // Work out both downloads before starting either, so the progress bar
    // knows the size of the whole job from the first moment. Planning is only
    // arithmetic, but if it ever throws, setup must still end on its error
    // screen with a retry, not hang on the progress bar.
    let elevationPlan
    let landCoverPlan
    try {
      elevationPlan = planElevations(locations, cellSize)
      landCoverPlan = planLandCover(locations, cellSize, servedYear)
    } catch (e) {
      console.error('Error planning terrain downloads:', e)
      return fail('Could not plan the terrain downloads for this region.')
    }
    elevationProgress.value = { completed: 0, total: elevationPlan.requestCount }
    landCoverProgress.value = { completed: 0, total: landCoverPlan.requestCount }

    // Fetch elevation for all locations
    let elevations
    isLoadingElevation.value = true
    currentPhase.value = 'elevation'
    try {
      elevations = await elevationPlan.fetch((completed, total) => {
        elevationProgress.value = { completed, total }
      })
    } catch (e) {
      console.error('Error fetching elevation data:', e)
      return fail('Could not load elevation data for this region. Check your connection and retry.')
    } finally {
      isLoadingElevation.value = false
    }

    // A tile that fails leaves its cells null rather than throwing, so a run
    // that lost most of its tiles still looks like a success here and would
    // be cached permanently. The tiles cover the whole world, sea included,
    // so every null is a failed download. A zero is a real reading.
    const failedElevations = elevations.filter((elevation) => elevation == null).length
    if (failedElevations === elevations.length) {
      return fail('No elevation data came back for this region. Check your connection and retry.')
    }
    if (failedElevations / elevations.length > gridApiConfig.maxElevationFailureRate) {
      return fail(
        `Elevation data was missing for ${failedElevations} of ${elevations.length} cells. Check your connection and retry.`
      )
    }

    // Fetch land cover for all locations
    let landCover
    isLoadingLandCover.value = true
    currentPhase.value = 'landcover'
    try {
      landCover = await landCoverPlan.fetch((completed, total) => {
        landCoverProgress.value = { completed, total }
      })
    } catch (e) {
      console.error('Error fetching land cover data:', e)
      return fail(
        'Could not load land cover data for this region. Check your connection and retry.'
      )
    } finally {
      isLoadingLandCover.value = false
    }

    // Judged on the cells whose pictures failed, not on every cell without
    // land cover: a region reaching over the border or out to sea has cells
    // the NLCD rightly has nothing for.
    if (landCover.failed / locations.length > gridApiConfig.maxLandCoverFailureRate) {
      return fail(
        `Land cover data was missing for ${landCover.failed} of ${locations.length} cells. Check your connection and retry.`
      )
    }

    // Every cell with the terrain it needs goes on the board; the rest are
    // left as holes
    const built = createCellGrid({
      rows,
      cols,
      south: bounds[1],
      west: bounds[0],
      latStep: latCellSize,
      lngStep: lngCellSize
    })
    locations.forEach((_, index) => {
      const elevation = elevations[index]
      const cover = landCover.costs[index]
      if (isUsableCell(elevation, cover)) setCell(built, index, { elevation, landCover: cover })
    })

    if (isEmptyGrid(built)) {
      return fail('No terrain data came back for this region. Check your connection and retry.')
    }

    const dropped = locations.length - built.count
    if (dropped > 0) {
      console.warn(
        `Dropped ${dropped} of ${locations.length} grid cells with incomplete terrain data.`
      )
    }

    // calculate total cost for grid
    currentPhase.value = 'calculating'
    focalOpElevation(built)
    grid.value = markRaw(built)

    // save grid to cache, with the year it was drawn from
    cachedGrid.value = { landCoverYear: servedYear, grid: packGrid(built) }

    isGridGenerated.value = true
    currentPhase.value = ''
    return true
  }

  /**
   * Records a generation failure and leaves the store in a clean idle state.
   * The phase is cleared so the progress UI can swap to the error message
   * instead of sitting on a bar that has stopped moving.
   *
   * @param {string} message - Player-facing explanation
   * @returns {false}
   */
  function fail(message) {
    console.error('Grid generation failed:', message)
    error.value = message
    currentPhase.value = ''
    isGridGenerated.value = false
    return false
  }

  /**
   * Clears a previous failure without discarding the grid.
   * Used when the player retries so the progress UI can leave the error state
   * before the next attempt reaches `generateGrid`.
   */
  function clearError() {
    error.value = null
  }

  /**
   * Resets the grid store to initial state.
   */
  function reset() {
    grid.value = null
    isGridGenerated.value = false
    isLoadingElevation.value = false
    isLoadingLandCover.value = false
    elevationProgress.value = { completed: 0, total: 0 }
    landCoverProgress.value = { completed: 0, total: 0 }
    currentPhase.value = ''
    error.value = null
  }

  /**
   * Sets the whole grid (used for loading saved games).
   * @param {Object} cellGrid - A grid (see cellGrid.js)
   */
  function setGrid(cellGrid) {
    if (cellGrid) {
      grid.value = markRaw(cellGrid)
      isGridGenerated.value = true
      error.value = null
    }
  }

  return {
    grid,
    isGridGenerated,
    isLoadingElevation,
    isLoadingLandCover,
    elevationProgress,
    landCoverProgress,
    currentPhase,
    progressPercent,
    error,
    generateGrid,
    clearError,
    reset,
    setGrid
  }

  /**
   * Works out what track through each cell costs: its land cover, plus how
   * steep the ground around it is.
   *
   * Steepness comes from a focal operation over the 3x3 neighborhood: the
   * height differences between the cell and each of its up to eight
   * neighbors on the board, added up. A cell at the edge of the board, or
   * beside a hole, has fewer neighbors and so less added.
   *
   * @param {Object} built - The grid being built, every cell's elevation and
   *   land cover filled in; its costs are written in place
   */
  function focalOpElevation(built) {
    const { elevation, landCover, cost, present } = built
    for (let index = 0; index < present.length; index++) {
      if (!present[index]) continue
      const row = rowOf(built, index)
      const col = colOf(built, index)
      let elevationCost = 0

      // dr/dc represent delta row/column (-1, 0, +1)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue // Skip the center cell (self)
          const neighbor = cellAt(built, row + dr, col + dc)
          // Steeper elevation changes = higher building cost
          if (neighbor !== -1) elevationCost += Math.abs(elevation[index] - elevation[neighbor])
        }
      }

      // Total cost = terrain difficulty (land cover) + slope difficulty (elevation changes)
      cost[index] = elevationCost + landCover[index]
    }
  }
})
