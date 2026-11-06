/**
 * Towns Store (towns.js)
 *
 * Manages town data for the game including loading, classification, and industry assignment.
 * Towns are populated from Census MSA (Metropolitan Statistical Area) data, placed at
 * each area's main city, and sorted into sizes by population rank (see townSizes.js).
 *
 * Data Flow:
 * 0. Look up the state's data window: the years the jobs data covers, which
 *    every other source follows (see dataWindow.js)
 * 1. Fetch industry data from industryStore
 * 2. Fetch population data from Census API: every metro and micro area in
 *    the state, each of which is a town
 * 3. Place each MSA's town at its main city, from TigerWeb (see useTigerWeb.js)
 * 4. Leave out the towns whose main city is off the board
 * 5. Classify towns by population (small/medium/large)
 * 6. Assign industries based on employment density
 *
 * Town Object Structure:
 * {
 *   msa: string,           // MSA code (e.g., "33460")
 *   fullName: string,      // Full MSA name (e.g., "Minneapolis-St. Paul-Bloomington")
 *   name: string,          // Short name (e.g., "Minneapolis")
 *   stateCode: string,     // State FIPS code
 *   population: number,    // Population count
 *   lon: number,           // Longitude coordinate
 *   lat: number,           // Latitude coordinate
 *   size: string,          // Size class: "small", "medium", or "large"
 *   industries: Array      // Assigned industries [{name, industry}]
 * }
 *
 * @module stores/towns
 */

import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useIndustryStore } from './industry'
import useCensus from '../composables/setup/useCensus'
import getMSALatLon, { findPrincipalCity } from '../composables/setup/useTigerWeb'
import { assignSizes } from '../composables/setup/townSizes'
import { regionTest } from '@/composables/map/region'
import { fetchDataWindow } from '../composables/setup/dataWindow'
import { isRefusal, refusalMessage } from '../composables/utils'
import { readCache, writeCache } from '../composables/database'
import { debug } from '@/composables/debug'

/**
 * Maximum proportion of towns that can have any single industry (20%).
 * Not enforced yet: assignIndustries() never checks it. Kept, commented out,
 * for the upcoming review of how towns are set up, which will decide whether
 * the cap belongs in the game.
 */
// const maxTownsForIndustry = 0.2

/** Maximum number of industries a single town can have */
const maxIndustries = 3

/**
 * The steps of the town setup, as the towns store reports them (see
 * `setupStep`), so the setup screen can tell them apart
 */
export const SETUP_STEPS = Object.freeze({
  dataWindow: 'dataWindow',
  industry: 'industry',
  population: 'population',
  placing: 'placing',
  assigning: 'assigning'
})

/** Shown when no town on the board could be found */
const NO_TOWNS_ON_BOARD_MESSAGE = 'None of the towns found are on this board.'

/** Shown when the towns could not be built and none are cached */
const NO_TOWNS_MESSAGE =
  "Could not load this state's towns from the Census Bureau. Check your connection and retry."

// STORE
export const useTownsStore = defineStore('towns', () => {
  const industryStore = useIndustryStore()

  // STATE
  const towns = ref([])
  const selectedState = ref('')

  /**
   * The years this game's data comes from, {start, end, middle}, once setup
   * has looked them up; null before. The grid takes its land cover from the
   * middle year.
   */
  const dataWindow = ref(null)

  /** Player-facing message when town setup fails, otherwise null */
  const error = ref(null)

  /** Loading state for industry data fetching */
  const isLoadingIndustry = ref(false)

  /** Loading state for population data fetching */
  const isLoadingPopulation = ref(false)

  /** Loading state for coordinate data fetching */
  const isLoadingCoordinates = ref(false)

  /**
   * Which step of the town setup is running, for the setup screen: one of
   * SETUP_STEPS, or empty when it is doing nothing
   */
  const setupStep = ref('')

  /**
   * What the setup screen says the town setup is doing, such as "Placing
   * towns (3 of 12)…"; empty when it is doing nothing
   */
  const setupMessage = ref('')

  /**
   * Moves the setup on to a step, with what the setup screen says for it.
   * @param {string} step - One of SETUP_STEPS, or empty when done
   * @param {string} [message] - What to tell the player
   */
  function setStep(step, message = '') {
    setupStep.value = step
    setupMessage.value = message
  }

  // ACTIONS

  /**
   * Sets up the towns for a new game on a state's board.
   *
   * A town is a metro or micro area, placed at its main city (see
   * useTigerWeb.js). What is fetched for a state — each town's place, name
   * and population, its "site" — is kept in the browser's database (see
   * database.js), so the next game there need not ask again. The towns
   * themselves are made from the sites afresh each game: those on the board
   * kept, their sizes set and their industries assigned (see `playSites`).
   *
   * Every new game first looks up the state's data window, one small request.
   * The cached sites are used when they were built for that same window;
   * once a new year of jobs data is out, the window has moved on and the
   * sites are built again from the new years.
   *
   * If the lookup fails — the Census Bureau's API is down, say — the cached
   * sites and industry data are used as they are, whatever window they were
   * built for. So they are if building the new sites fails, or comes out
   * with no towns at all, and the cache is left as it was. With nothing
   * cached there is nothing to play with, and `error` is set for the setup
   * screen to show.
   *
   * An industry or a town whose own lookup fails is left out of the game,
   * and the sites are not cached, so the next game builds them again rather
   * than keep the gap for the rest of the window. The cache keeps the last
   * complete build.
   *
   * @param {string} stateFipsCode - Two-digit FIPS code for the state (e.g., "27" for Minnesota)
   * @param {Object|null} [region] - The board's outline (GeoJSON); towns
   *   whose main city is outside it are left off the board. With none, every
   *   town is kept.
   * @returns {Promise<void>}
   */
  async function setupTowns(stateFipsCode, region = null) {
    selectedState.value = stateFipsCode
    error.value = null
    debug.log('Selected state:', stateFipsCode)
    const isOnBoard = regionTest(region)

    // Each state's sites are kept under their own name, along with the data
    // window they were built for
    const cacheName = `townSites_${stateFipsCode}`
    const saved = savedSites(await readCache(cacheName))

    let latestWindow
    setStep(SETUP_STEPS.dataWindow, 'Looking up which years of jobs data to use…')
    try {
      latestWindow = await fetchDataWindow(stateFipsCode)
    } catch (e) {
      console.error('Error looking up the data window:', e)
      await fallBackTo(saved, failureMessage(e, "this state's jobs data"), isOnBoard)
      return
    }

    // Use the cached sites if they were built for the same years. Their
    // industry data is usually cached too; if it has to be fetched and
    // fails, the industry data cached for any window will do.
    if (
      saved &&
      saved.dataWindow.start === latestWindow.start &&
      saved.dataWindow.end === latestWindow.end
    ) {
      isLoadingIndustry.value = true
      setStep(SETUP_STEPS.industry, 'Fetching jobs by industry…')
      try {
        await industryStore.useIndustryData(stateFipsCode, latestWindow)
        playSites(saved, isOnBoard)
      } catch (e) {
        console.error('Error fetching industry data:', e)
        await fallBackTo(saved, NO_TOWNS_MESSAGE, isOnBoard)
      } finally {
        isLoadingIndustry.value = false
      }
      return
    }

    // Fetch industry data for the selected state
    isLoadingIndustry.value = true
    setStep(SETUP_STEPS.industry, 'Fetching jobs by industry…')
    try {
      await industryStore.useIndustryData(stateFipsCode, latestWindow)
    } catch (e) {
      console.error('Error fetching industry data:', e)
      isLoadingIndustry.value = false
      await fallBackTo(saved, NO_TOWNS_MESSAGE, isOnBoard)
      return
    }
    isLoadingIndustry.value = false

    // Fetch population data for the selected state
    isLoadingPopulation.value = true
    setStep(SETUP_STEPS.population, 'Fetching population…')
    const { populationData, fetchPopulationData } = useCensus(stateFipsCode, latestWindow)
    try {
      await fetchPopulationData()
    } catch (e) {
      console.error('Error fetching population data:', e)
      isLoadingPopulation.value = false
      await fallBackTo(saved, failureMessage(e, "this state's population"), isOnBoard)
      return
    }
    isLoadingPopulation.value = false

    // Place a town for every metro and micro area with people in the state.
    // Every one is a town, whether or not it has jobs in the game's
    // industries: one that makes nothing is still somewhere to deliver to.
    isLoadingCoordinates.value = true
    const sites = []
    // Whether any town was left out because its lookup failed
    let missedTowns = false
    for (const [index, popData] of populationData.value.entries()) {
      setStep(
        SETUP_STEPS.placing,
        `Placing towns (${index + 1} of ${populationData.value.length})…`
      )
      const msaCode = popData.msa_code

      let place
      try {
        place = await placeTown(msaCode, popData.name)
      } catch (e) {
        console.error(`Error placing the town for MSA ${msaCode}:`, e)
        // Continue to next MSA on error. A lookup turned down would be turned
        // down again next game, so only one that failed keeps the sites out
        // of the cache.
        if (!isRefusal(e)) missedTowns = true
        continue
      }

      // TIGERweb has neither the city nor the area: there is no town to place
      if (!place) {
        console.warn(`No place found for MSA ${msaCode}; leaving it out`)
        continue
      }
      debug.log('Town placed:', place)

      const fullName = popData.name.split(', ')[0]
      sites.push({
        msa: msaCode,
        fullName,
        // The main city's own name, or else the first name in the area's
        name: place.name ?? fullName.split('-')[0],
        stateCode: popData.state_code,
        population: parseFloat(popData.population),
        lon: place.lon,
        lat: place.lat
      })
    }
    isLoadingCoordinates.value = false

    // Every lookup that a town needs failed, or found nothing
    if (sites.length === 0) {
      await fallBackTo(saved, NO_TOWNS_MESSAGE, isOnBoard)
      return
    }

    const built = { dataWindow: latestWindow, sites }
    playSites(built, isOnBoard)

    // Play with what came back, but leave a build with gaps out of the cache
    if (missedTowns || industryStore.failedIndustries.length > 0) {
      console.warn(`Not caching towns for state ${stateFipsCode}: some lookups failed`)
      return
    }

    // Keep the sites for the next game in this state
    await writeCache(cacheName, built)
    debug.log(`Cached town sites for state ${stateFipsCode}`)
  }

  /**
   * Clears a town setup failure, so the setup screen can show progress again
   * when the player retries.
   */
  function clearError() {
    error.value = null
  }

  // HELPERS

  /**
   * Where an MSA's town goes: at its main city (see `findPrincipalCity`),
   * or, if TIGERweb has no such city, in the middle of the area, as towns
   * used to be placed.
   * @param {string} msaCode - The MSA's code
   * @param {string} msaName - Its name, as the Census Bureau writes it
   * @returns {Promise<{lon: number, lat: number, name: string|null}|null>}
   *   Where, and the city's name (null for the middle of the area); null if
   *   neither can be found
   * @throws When a lookup fails (see useTigerWeb.js)
   */
  async function placeTown(msaCode, msaName) {
    const city = await findPrincipalCity(msaName)
    if (city) return { lon: city.lon, lat: city.lat, name: city.name }
    const middle = await getMSALatLon(msaCode)
    if (!middle) return null
    return {
      lon: parseFloat(middle.centroidLongitude),
      lat: parseFloat(middle.centroidLatitude),
      name: null
    }
  }

  /**
   * The cached sites, if they can be played with: some sites, and the data
   * window they were built for.
   *
   * @param {Object|undefined} cached - What the database holds for the state
   * @returns {{dataWindow: Object, sites: Array}|null} The saved sites, or null
   */
  function savedSites(cached) {
    const usable =
      cached?.dataWindow != null && Array.isArray(cached.sites) && cached.sites.length > 0
    return usable ? cached : null
  }

  /**
   * The setup screen's explanation of a failed Census request: a refusal
   * (see `refusalMessage`), or else a request that could not get through.
   *
   * @param {*} failure - What the request threw
   * @param {string} what - The data asked for, as in "this state's population"
   * @returns {string} Player-facing message
   */
  function failureMessage(failure, what) {
    if (isRefusal(failure)) return refusalMessage('The Census Bureau', what, failure)
    return `Could not reach the Census Bureau for ${what}. Check your connection and retry.`
  }

  /**
   * What to do when the new sites cannot be had: play with the cached sites
   * if there are any, with the industry data cached for the state, or else
   * report the failure for the setup screen.
   *
   * @param {{dataWindow: Object, sites: Array}|null} saved - From `savedSites`
   * @param {string} message - Player-facing explanation, when nothing is cached
   * @param {Function} isOnBoard - The board's point test (see `regionTest`)
   */
  async function fallBackTo(saved, message, isOnBoard) {
    if (saved) {
      await industryStore.useIndustryData(selectedState.value, saved.dataWindow, {
        anyWindow: true
      })
      playSites(saved, isOnBoard)
    } else {
      towns.value = []
      setStep('')
      error.value = message
    }
  }

  /**
   * Makes the game's towns from a state's sites: those whose main city is on
   * the board, each with its size and industries (see `assignTowns`). A
   * board none of whose towns is on it cannot be played: `error` says so.
   * @param {{dataWindow: Object, sites: Array}} built - The sites, and the
   *   data window they were built for
   * @param {Function} isOnBoard - The board's point test (see `regionTest`)
   */
  function playSites(built, isOnBoard) {
    setStep(SETUP_STEPS.assigning, 'Assigning industries to towns…')
    dataWindow.value = built.dataWindow
    towns.value = built.sites
      .filter((site) => isOnBoard({ lat: site.lat, lng: site.lon }))
      .map((site) => ({ ...site, industries: [] }))
    if (towns.value.length === 0) error.value = NO_TOWNS_ON_BOARD_MESSAGE
    else assignTowns()
    setStep('')
  }

  /**
   * Orchestrates the town assignment process: classifies by population,
   * assigns tourism to large towns, and distributes industries.
   */
  function assignTowns() {
    debug.log('Assigning towns...')
    // major cities, medium and small towns, by population
    towns.value = assignSizes(towns.value)
    assignTourism()
    assignIndustries()
  }

  /**
   * Assigns the Tourism industry to all large towns.
   * Tourism is a special industry that large population centers always have.
   */
  function assignTourism() {
    debug.log('Assigning tourism to towns...')
    towns.value.forEach((town) => {
      if (town.size === 'large') {
        town.industries.push({ name: 'Tourism', industry: 9999 })
      }
    })
  }

  /**
   * Calculates the maximum number of towns each industry can be assigned to
   * based on that industry's employment proportion.
   *
   * @returns {Array<{industry: number, maxTowns: number}>} Array of industry limits
   */
  function calcMaxTownsPerIndustry() {
    const maxTowns = industryStore.employmentData.map((industry) => ({
      industry: industry.industry,
      maxTowns: Math.floor(towns.value.length * industry.proportion) || 1
    }))
    debug.log('Max towns per industry:', maxTowns)
    return maxTowns
  }

  /**
   * Assigns industries to towns based on employment density.
   * Uses natural breaks to classify towns by employment density for each industry,
   * then assigns to high-density towns first, then medium-density if slots remain.
   *
   * Algorithm:
   * 1. For each industry, calculate employment density (employment / population)
   * 2. Use natural breaks to classify towns into low/medium/high density
   * 3. Assign industry to high-density towns first
   * 4. Fill remaining slots with medium-density towns
   * 5. Respect maxIndustries per town (there is no per-industry cap yet)
   */
  function assignIndustries() {
    debug.log('Starting industry assignment to towns...')

    // Enrich employment data with industry labels
    const enrichedEmploymentData = enrichEmploymentData(
      industryStore.employmentData,
      industryStore.industries
    )

    // Step 1: Calculate the maximum number of towns each industry can be assigned to
    const maxTownsPerIndustry = calcMaxTownsPerIndustry()

    // Track assignments for each industry
    const industryAssignmentCounts = new Map(maxTownsPerIndustry.map((ind) => [ind.industry, 0]))

    // Step 2: Loop through each industry, applying natural breaks to the normalized employment data
    for (const industry of enrichedEmploymentData) {
      const { industry: industryId, label, meanEmp } = industry
      debug.log(`\nAssigning industry: ${label} (ID: ${industryId})`)

      // Get the maximum number of towns allowed for this industry
      const maxAllowed = maxTownsPerIndustry.find((ind) => ind.industry === industryId).maxTowns
      // Prepare an array of towns with normalized employment data (employment density)
      const townsWithEmploymentDensity = towns.value
        .map((town) => ({
          ...town,
          // Normalize by dividing employment by town's population
          employmentDensity: meanEmp[town.msa] ? meanEmp[town.msa] / town.population : 0
        }))
        .filter((town) => town.employmentDensity > 0) // Consider only towns with employment in this industry

      // Apply natural breaks to group towns by employment density for this industry
      const groupedTowns = naturalBreaks(townsWithEmploymentDensity, 'employmentDensity', [
        'low',
        'medium',
        'high'
      ])
      const highDensityTowns = groupedTowns.filter((town) => town.size === 'high')
      debug.log(`Top towns: ${highDensityTowns.map((town) => town.name)}`)

      // Assign industry to towns in the 'high' density group first
      let assignments = 0
      for (const town of highDensityTowns) {
        const assignedCount = industryAssignmentCounts.get(industryId) || 0

        // no checks for max allowed per town or per industry, just assign to town
        town.industries.push({ name: label, industry: industryId })
        industryAssignmentCounts.set(industryId, assignedCount + 1)
        assignments++
        debug.log(`Assigned ${label} to ${town.name} based on high employment density`)
      }

      // Step 3: If industry hasn't reached max allowed, assign to 'medium' group next
      if (assignments < maxTownsPerIndustry.find((ind) => ind.industry === industryId).maxTowns) {
        const mediumDensityTowns = groupedTowns.filter((town) => town.size === 'medium')
        // sort medium towns by employment density
        mediumDensityTowns.sort((a, b) => b.employmentDensity - a.employmentDensity)
        debug.log(`Medium density towns: ${mediumDensityTowns.map((town) => town.name)}`)

        for (const town of mediumDensityTowns) {
          if (
            industryAssignmentCounts.get(industryId) < maxAllowed &&
            town.industries.length < maxIndustries
          ) {
            town.industries.push({ name: label, industry: industryId })
            industryAssignmentCounts.set(
              industryId,
              (industryAssignmentCounts.get(industryId) || 0) + 1
            )
            assignments++
            debug.log(`Assigned ${label} to ${town.fullName} from medium density groups`)
          }
          if (assignments >= maxAllowed) break
        }
      }

      debug.log(
        `Final assignments for industry ${label}:`,
        industryAssignmentCounts.get(industryId)
      )
    }
  }

  /**
   * Enriches employment data with human-readable industry labels.
   *
   * @param {Array} employmentData - Raw employment data from QWI
   * @param {Array} industries - Industry definitions with naics_code and label
   * @returns {Array} Employment data with added label field
   */
  function enrichEmploymentData(employmentData, industries) {
    const industryMap = new Map(industries.map((ind) => [ind.naics_code, ind.label]))
    return employmentData.map((data) => ({
      ...data,
      label: industryMap.get(data.industry) || 'Unknown Industry' // Default label if not found
    }))
  }

  /**
   * Classifies data into groups based on the largest breaks between values, adding a "size" property.
   *
   * @param {Array} data - Array of objects to classify.
   * @param {String} property - The numeric property to base classifications on.
   * @param {Array} sizeClasses - Array of size classes (e.g., ['small', 'medium', 'large']).
   * @returns {Array} - Original array with updated objects, each containing a "size" property.
   */
  function naturalBreaks(data, property, sizeClasses) {
    const numClasses = sizeClasses.length

    // Sort data ascending by the target property (e.g., population)
    const sortedData = [...data].sort((a, b) => a[property] - b[property])

    // Calculate the "gap" between each consecutive pair of values
    // Larger gaps indicate natural breakpoints in the data distribution
    const gaps = sortedData.map((item, index) => {
      if (index === 0) return 0
      return sortedData[index][property] - sortedData[index - 1][property]
    })

    // Find the N-1 largest gaps (where N = number of classes)
    // These gaps become the boundaries between classes
    // Example: 3 classes need 2 breakpoints (small|medium|large)
    const largestGaps = [...gaps]
      .map((gap, index) => ({ gap, index }))
      .sort((a, b) => b.gap - a.gap)
      .slice(0, numClasses - 1)
      .map((g) => g.index)
      .sort((a, b) => a - b) // Re-sort by position for sequential processing

    // Assign class labels based on where items fall relative to breakpoints
    let startIdx = 0
    for (let i = 0; i < largestGaps.length; i++) {
      const endIdx = largestGaps[i]
      // All items from startIdx to endIdx get the i-th class label
      for (let j = startIdx; j < endIdx; j++) {
        sortedData[j].size = sizeClasses[i]
      }
      startIdx = endIdx
    }

    // Items after the last breakpoint get the final class label
    for (let j = startIdx; j < sortedData.length; j++) {
      sortedData[j].size = sizeClasses[sizeClasses.length - 1]
    }

    return sortedData
  }

  /**
   * Resets the towns store to initial state.
   */
  function reset() {
    towns.value = []
    selectedState.value = ''
    dataWindow.value = null
    error.value = null
    isLoadingIndustry.value = false
    isLoadingPopulation.value = false
    isLoadingCoordinates.value = false
    setStep('')
  }

  /**
   * Sets the complete towns array (used for loading saved games).
   * @param {Array} townsArray - Array of town objects
   */
  function setTowns(townsArray) {
    if (Array.isArray(townsArray)) {
      towns.value = townsArray
    }
  }

  return {
    towns,
    dataWindow,
    error,
    isLoadingIndustry,
    isLoadingPopulation,
    isLoadingCoordinates,
    setupStep,
    setupMessage,
    setupTowns,
    clearError,
    reset,
    setTowns
  }
})
