/**
 * Grid Store (grid.js)
 *
 * Generates and manages the square grid laid over the game map.
 * Each grid cell holds terrain data that affects railroad building costs:
 * - Elevation: the average height of the ground in the cell; steep cells,
 *   and cells on a long climb, cost more
 * - Land Cover: the mix of ground in the cell, forest dearer than grassland
 *
 * The grid is used during gameplay to price track cell by cell, from each
 * cell's land cover and slope (see composables/map/trackCost.js). The slope
 * is worked out once, as the grid is built (see composables/map/slope.js).
 *
 * Each cell also says whether it is water track has to bridge — a lake or
 * the sea — from the game's water data (see composables/map/water.js and
 * the water store), marked as the grid is built. The water data is loaded
 * before any grid is put in play, built or kept, because the build rules
 * read its rivers too.
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
import { waterCells } from '@/composables/map/water'
import { waterPolygons } from '@/composables/map/waterData'
import { useWaterStore } from '@/stores/water'
import { createCellGrid, setCell, isEmptyGrid } from '@/composables/map/cellGrid'
import { fillSlopes } from '@/composables/map/slope'
import { getGrid, getGridYears, putGrid } from '@/composables/database'
import { gridApiConfig } from '@/config/grid'
import { isRefusal, refusalMessage } from '@/composables/utils'

/**
 * Whether a cell, with its terrain filled in, belongs on the board.
 *
 * It needs a height, and either a land cover or to be water. The NLCD has no
 * land cover beyond the US border or out at sea, so land beyond the border
 * drops out here. The sea stays: track may bridge a bay or an inlet, even
 * beyond the region's border, as long as it comes back to land (see
 * buildRules.js), so the sea's cells have to be on the board to be bridged.
 *
 * @param {number|null} elevation - The cell's height, in meters
 * @param {number|null} landCover - The cell's land cover cost
 * @param {boolean} isWater - Whether the cell is lake or sea
 * @returns {boolean} True if the cell is kept
 */
function isUsableCell(elevation, landCover, isWater) {
  return Number.isFinite(elevation) && (landCover != null || isWater)
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
  const waterStore = useWaterStore()

  /**
   * Loads the game's water data, if it is not loaded yet (see the water
   * store), failing as setup fails if it cannot be.
   * @returns {Promise<boolean>} True once the water data is there
   */
  async function ensureWater() {
    if (await waterStore.load()) return true
    return fail('Could not load the map of rivers and lakes. Check your connection and retry.')
  }

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

    /** Plays with a kept grid, once the water data is loaded for its rivers */
    const playKept = async (record) =>
      (await ensureWater()) &&
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
    if (kept) return (await ensureWater()) && kept.grid

    startProgress()
    const built = await buildGrid(bounds, cellSize, landCoverYear)
    if (built) await keepGrid(gridSource, built)
    return built
  }

  /**
   * Builds a grid of cells covering the specified bounds: fetches elevation
   * and land cover for each cell, marks which are lake or sea, then works out
   * how steep each is. Reports its progress as it goes, and on failure sets
   * `error`.
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
    const cellCount = rows * cols

    // Where the grid is and how it is divided. The terrain comes back per
    // cell in the order the grid numbers its cells (see cellGrid.js). The
    // grid is built apart from `grid` and handed back, so nothing already in
    // play — a grid restored from a save, say — can mix with the new one.
    const shape = {
      rows,
      cols,
      south: bounds[1],
      west: bounds[0],
      latStep: latCellSize,
      lngStep: lngCellSize
    }

    if (cellCount <= 0) {
      return fail('That region is too small to build a grid from. Try selecting a larger area.')
    }

    // Which cells are lake or sea, from the game's own water data: loaded
    // first, since it is quick and a failure here should not waste the
    // downloads below
    if (!(await ensureWater())) return false
    const water = waterCells(shape, waterPolygons(waterStore.data, bounds))

    // Work out both downloads before starting either, so the progress bar
    // knows the size of the whole job from the first moment. Planning is only
    // arithmetic, but if it ever throws, setup must still end on its error
    // screen with a retry, not hang on the progress bar.
    let elevationPlan
    let landCoverPlan
    try {
      elevationPlan = planElevations(shape, cellSize)
      landCoverPlan = planLandCover(shape, year)
    } catch (e) {
      console.error('Error planning terrain downloads:', e)
      return fail('Could not plan the terrain downloads for this region.')
    }
    elevationProgress.value = { completed: 0, total: elevationPlan.requestCount }
    landCoverProgress.value = { completed: 0, total: landCoverPlan.requestCount }

    // Fetch elevation for every cell
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

    // A tile that fails leaves its cells unknown (NaN) rather than throwing,
    // so a run that lost most of its tiles still looks like a success here
    // and would be cached permanently. The tiles cover the whole world, sea
    // included, so every unknown cell is a failed download. A zero is a real
    // reading.
    const failedElevations = elevations.elevation.filter(Number.isNaN).length
    if (failedElevations === cellCount) {
      return fail('No elevation data came back for this region. Check your connection and retry.')
    }
    if (failedElevations / cellCount > gridApiConfig.maxElevationFailureRate) {
      return fail(
        `Elevation data was missing for ${failedElevations} of ${cellCount} cells. Check your connection and retry.`
      )
    }

    // Fetch land cover for every cell
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
    if (landCover.failed / cellCount > gridApiConfig.maxLandCoverFailureRate) {
      return fail(
        `Land cover data was missing for ${landCover.failed} of ${cellCount} cells. Check your connection and retry.`
      )
    }

    // Every cell with the terrain it needs goes on the board; the rest are
    // left as holes. A cell of sea beyond the land cover's reach has no land
    // cover, and is given none: it is bridged, never priced as ground.
    const built = createCellGrid(shape)
    for (let index = 0; index < cellCount; index++) {
      const elevation = elevations.elevation[index]
      const cover = landCover.costs[index]
      const isWater = water[index] === 1
      if (isUsableCell(elevation, cover, isWater)) {
        setCell(built, index, { elevation, landCover: cover ?? 0, water: isWater })
      }
    }

    if (isEmptyGrid(built)) {
      return fail('No terrain data came back for this region. Check your connection and retry.')
    }

    const dropped = cellCount - built.count
    if (dropped > 0) {
      console.warn(`Dropped ${dropped} of ${cellCount} grid cells with incomplete terrain data.`)
    }

    // How steep each cell is, from its height, its neighbors' and its
    // roughness
    currentPhase.value = 'calculating'
    fillSlopes(built, elevations.roughness)
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
    ensureWater,
    reset,
    setGrid
  }
})
