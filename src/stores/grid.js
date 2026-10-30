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
  isEmptyGrid
} from '@/composables/map/cellGrid'
import { getGrid, getGridYears, putGrid } from '@/composables/database'
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

/**
 * Of the years a state's grid is kept for, the one closest to the year asked
 * for; between two equally close, the later. Used when the land cover server
 * cannot say which year it would serve.
 *
 * @param {Array<number>} keptYears - The years grids are kept for
 * @param {number} year - The year asked for
 * @returns {number|undefined} The closest, or undefined if none is kept
 */
function closestYear(keptYears, year) {
  return keptYears.reduce((best, kept) => {
    if (best === undefined) return kept
    const distance = Math.abs(kept - year)
    const bestDistance = Math.abs(best - year)
    if (distance < bestDistance) return kept
    if (distance === bestDistance && kept > best) return kept
    return best
  }, undefined)
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
   * What the grid in play was built from, or null while there is none:
   * `{ state, bounds, cellSize, landCoverYear }` — the state's FIPS code,
   * its bounding box, the cell size in meters and the year of land cover
   * drawn. Autosaves record this in place of the grid itself, which is kept
   * apart in the browser's database; a load finds the grid again by it (see
   * `gridForSave`).
   */
  const source = ref(null)

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
   * Starts the progress shown while a grid is found or built: nothing
   * downloaded yet, and no error from an earlier attempt.
   */
  function startProgress() {
    elevationProgress.value = { completed: 0, total: 0 }
    landCoverProgress.value = { completed: 0, total: 0 }
    currentPhase.value = 'initializing'
    error.value = null
  }

  /**
   * Puts a new game on a grid of cells covering the specified bounds.
   *
   * Each grid built is kept in the browser's database (see database.js),
   * with the year of land cover it was drawn from: the year the server
   * served, which is the closest it has to the year asked for. Each new game
   * asks the server which year that is now, one small request, and uses a
   * kept grid only when it was drawn from that same year. So a game whose
   * data window has moved on builds its grid again, as does one where the
   * server has since added a year closer to the one asked for. Grids of
   * other years are kept too, for the saved games played on them.
   *
   * If the server cannot say — it is down, or the player is offline — the
   * kept grid whose year is closest to the one asked for is used, as the
   * towns are when the Census Bureau is down.
   *
   * @param {string} stateFipsCode - State FIPS code the grid is kept under
   * @param {Array<number>} bounds - Bounding box [minLng, minLat, maxLng, maxLat]
   * @param {number} cellSize - Grid cell size in meters
   * @param {number} landCoverYear - The year to take land cover from: the
   *   middle year of the game's data window (see dataWindow.js)
   * @returns {Promise<boolean>} True when a usable grid was produced
   */
  async function generateGrid(stateFipsCode, bounds, cellSize, landCoverYear) {
    startProgress()
    isGridGenerated.value = false

    /** Plays with a kept grid */
    const playKept = (record) =>
      setGrid(record.grid, {
        state: stateFipsCode,
        bounds,
        cellSize,
        landCoverYear: record.landCoverYear
      })

    // The year of land cover the server will draw: the one asked for, or the
    // closest it has
    let servedYear
    try {
      servedYear = await landCoverYearFor(landCoverYear)
    } catch (e) {
      console.error('Error looking up land cover years:', e)
      const year = closestYear(await keptYears(stateFipsCode, cellSize), landCoverYear)
      const closest = year === undefined ? undefined : await keptGrid(stateFipsCode, cellSize, year)
      if (closest) return playKept(closest)
      return fail(
        isRefusal(e)
          ? refusalMessage('The land cover server', 'its years', e)
          : 'Could not reach the land cover server. Check your connection and retry.'
      )
    }

    const sameYear = await keptGrid(stateFipsCode, cellSize, servedYear)
    if (sameYear) return playKept(sameYear)

    const built = await buildGrid(bounds, cellSize, servedYear)
    if (!built) return false
    const gridSource = { state: stateFipsCode, bounds, cellSize, landCoverYear: servedYear }
    await keepGrid(gridSource, built)
    return setGrid(built, gridSource)
  }

  /**
   * The grid a saved game was played on, found by what the save recorded
   * about it (see `source`): the kept grid for the same state, cell size and
   * year or, if this browser has none, the same grid built again from the
   * same year of land cover. Building it again shows the same progress as
   * setting up a new game, and fails the same way, with `error` set.
   *
   * The grid is handed back rather than put in play: the game being
   * replaced is still on screen until the load has everything it needs, so a
   * load that fails here leaves that game as it was.
   *
   * @param {Object} gridSource - What the save recorded (see `source`)
   * @returns {Promise<Object|false>} The grid (see cellGrid.js), or false if
   *   it could not be built
   */
  async function gridForSave(gridSource) {
    const { state, bounds, cellSize, landCoverYear } = gridSource
    // Looked for before any progress is shown, so a quick load from the
    // kept grid does not flash the progress modal
    const kept = await keptGrid(state, cellSize, landCoverYear)
    if (kept) return kept.grid

    startProgress()
    const built = await buildGrid(bounds, cellSize, landCoverYear)
    if (built) await keepGrid(gridSource, built)
    return built
  }

  /**
   * Builds a grid of cells covering the specified bounds: fetches elevation
   * and land cover for each cell, then works out what track through each
   * costs. Reports its progress as it goes, and on failure sets `error`.
   *
   * @param {Array<number>} bounds - Bounding box [minLng, minLat, maxLng, maxLat]
   * @param {number} cellSize - Grid cell size in meters
   * @param {number} year - The year of land cover to draw, one the server has
   * @returns {Promise<Object|false>} The grid (see cellGrid.js), or false
   */
  async function buildGrid(bounds, cellSize, year) {
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
    // that comes back for location k is cell k's. The grid is built apart
    // from `grid` and handed back, so nothing already in play — a grid
    // restored from a save, say — can mix with the new one.
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
      landCoverPlan = planLandCover(locations, cellSize, year)
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
    currentPhase.value = ''
    return built
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
    source.value = null
  }

  /**
   * Puts a grid in play: one just built or kept, or one from a saved game.
   * @param {Object} cellGrid - A grid (see cellGrid.js)
   * @param {Object|null} gridSource - What it was built from (see `source`);
   *   null for a grid from a save that did not record it
   * @returns {true}
   */
  function setGrid(cellGrid, gridSource) {
    grid.value = markRaw(cellGrid)
    source.value = gridSource
    isGridGenerated.value = true
    currentPhase.value = ''
    error.value = null
    return true
  }

  // HELPERS

  /**
   * The years a grid is kept for, for a state at a cell size. A database that
   * cannot be read counts as keeping none: the grid is built afresh instead.
   * @param {string} state - The state's FIPS code
   * @param {number} cellSize - Cell size in meters
   * @returns {Promise<Array<number>>} The years
   */
  async function keptYears(state, cellSize) {
    try {
      return await getGridYears(state, cellSize)
    } catch (e) {
      console.warn('Could not read the kept grids:', e)
      return []
    }
  }

  /**
   * The grid kept for a state, cell size and year, read as `keptYears` reads.
   * @returns {Promise<Object|undefined>} The record, or undefined
   */
  async function keptGrid(state, cellSize, landCoverYear) {
    try {
      return await getGrid(state, cellSize, landCoverYear)
    } catch (e) {
      console.warn('Could not read the kept grid:', e)
      return undefined
    }
  }

  /**
   * Keeps a grid — one just built, or one a save file brought — so the next
   * game on it, and the autosaves of this one, need not build it again. A
   * grid that cannot be kept is still played; it is only built again next
   * time.
   * @param {Object} gridSource - What it was built from (see `source`)
   * @param {Object} built - The grid
   */
  async function keepGrid({ state, cellSize, landCoverYear }, built) {
    try {
      await putGrid({ state, cellSize, landCoverYear, grid: built })
    } catch (e) {
      console.warn('Could not keep the grid:', e)
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
    source,
    generateGrid,
    gridForSave,
    keepGrid,
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
