/**
 * Towns Store (towns.js)
 *
 * Manages town data for the game including loading, classification, and industry assignment.
 * Towns are populated from Census MSA (Metropolitan Statistical Area) data and classified
 * by population size using a natural breaks algorithm.
 *
 * Data Flow:
 * 0. Look up the state's data window: the years the jobs data covers, which
 *    every other source follows (see dataWindow.js)
 * 1. Fetch industry data from industryStore
 * 2. Fetch population data from Census API
 * 3. Fetch lat/lon coordinates for each MSA from TigerWeb
 * 4. Classify towns by population (small/medium/large)
 * 5. Assign industries based on employment density
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
import { defineStore, storeToRefs } from 'pinia'
import { useLocalStorage } from '@vueuse/core'
import { useIndustryStore } from './industry'
import useCensus from '../composables/setup/useCensus'
import getMSALatLon from '../composables/setup/useTigerWeb'
import { fetchDataWindow } from '../composables/setup/dataWindow'
import { isRefusal, refusalMessage } from '../composables/utils'

/** Size classification labels for towns based on population */
const sizeClasses = ['small', 'medium', 'large']

/**
 * Maximum proportion of towns that can have any single industry (20%).
 * Not enforced yet: assignIndustries() never checks it. Kept, commented out,
 * for the upcoming review of how towns are set up, which will decide whether
 * the cap belongs in the game.
 */
// const maxTownsForIndustry = 0.2

/** Maximum number of industries a single town can have */
const maxIndustries = 3

/** Shown when the towns could not be built and none are cached */
const NO_TOWNS_MESSAGE =
  "Could not load this state's towns from the Census Bureau. Check your connection and retry."

// STORE
export const useTownsStore = defineStore('towns', () => {
  const industryStore = useIndustryStore()

  // STATE
  const towns = ref([])
  const selectedState = ref('')
  const { MSAs } = storeToRefs(industryStore)

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

  // ACTIONS

  /**
   * Initializes towns for the selected state by fetching and processing MSA data.
   * Uses localStorage caching to avoid redundant API calls.
   *
   * Every new game first looks up the state's data window, one small request.
   * The cached towns are used when they were built for that same window;
   * once a new year of jobs data is out, the window has moved on and the
   * towns are built again from the new years.
   *
   * If the lookup fails — the Census Bureau's API is down, say — the cached
   * towns are used as they are, whatever window they were built for. So they
   * are if building the new towns fails, or comes out with no towns at all,
   * and the cache is left as it was. With nothing cached there is nothing to
   * play with, and `error` is set for the setup screen to show.
   *
   * An industry or a town whose own lookup fails is left out of the game,
   * and the towns are not cached, so the next game builds them again rather
   * than keep the gap for the rest of the window. The cache keeps the last
   * complete build.
   *
   * @param {string} stateFipsCode - Two-digit FIPS code for the state (e.g., "27" for Minnesota)
   * @returns {Promise<void>}
   */
  async function setupTowns(stateFipsCode) {
    selectedState.value = stateFipsCode
    error.value = null
    console.log('Selected state:', stateFipsCode)

    // Use `localStorage` key for caching each state's towns data, along with
    // the data window they were built for
    const cachedTowns = useLocalStorage(`towns_${stateFipsCode}`, {})
    const saved = savedTowns(cachedTowns.value)

    let latestWindow
    try {
      latestWindow = await fetchDataWindow(stateFipsCode)
    } catch (e) {
      console.error('Error looking up the data window:', e)
      fallBackTo(saved, failureMessage(e, "this state's jobs data"))
      return
    }

    // Load cached data if it was built for the same years
    if (
      saved &&
      saved.dataWindow.start === latestWindow.start &&
      saved.dataWindow.end === latestWindow.end
    ) {
      loadSavedTowns(saved)
      return
    }

    dataWindow.value = latestWindow
    // The fetch below adds to this; start it empty rather than on top of the
    // towns of an earlier window or an attempt that failed part-way
    towns.value = []

    // Fetch industry data for the selected state
    isLoadingIndustry.value = true
    try {
      await industryStore.useIndustryData(stateFipsCode, latestWindow)
      console.log('Industry data fetched:', industryStore.employmentData)
    } catch (e) {
      console.error('Error fetching industry data:', e)
      isLoadingIndustry.value = false
      fallBackTo(saved, NO_TOWNS_MESSAGE)
      return
    }
    isLoadingIndustry.value = false

    // Fetch population data for the selected state
    isLoadingPopulation.value = true
    const { populationData, fetchPopulationData } = useCensus(stateFipsCode, latestWindow)
    try {
      await fetchPopulationData()
      console.log('Population data fetched:', populationData.value)
    } catch (e) {
      console.error('Error fetching population data:', e)
      isLoadingPopulation.value = false
      fallBackTo(saved, failureMessage(e, "this state's population"))
      return
    }
    isLoadingPopulation.value = false

    // Fetch latitude and longitude data for each MSA and populate towns
    isLoadingCoordinates.value = true
    // Whether any town was left out because its lookup failed
    let missedTowns = false
    for (const msaCode of MSAs.value) {
      console.log('Fetching lat/lon data for MSA:', msaCode)
      let coordinates
      try {
        coordinates = await getMSALatLon(msaCode)
      } catch (e) {
        console.error(`Error fetching coordinates for MSA ${msaCode}:`, e)
        // Continue to next MSA on error. A lookup turned down would be turned
        // down again next game, so only one that failed keeps the towns out
        // of the cache.
        if (!isRefusal(e)) missedTowns = true
        continue
      }

      // TIGERweb has no such area: there is no town to place
      if (!coordinates) {
        console.warn(`No coordinates for MSA ${msaCode}; leaving it out`)
        continue
      }
      const { centroidLongitude, centroidLatitude } = coordinates
      console.log('Lat/Lon data fetched:', centroidLongitude, centroidLatitude)

      const popData = populationData.value.find((data) => data.msa_code === msaCode)

      // if there is no population data for the MSA, skip it
      if (!popData) {
        continue
      }

      towns.value.push({
        msa: msaCode,
        fullName: popData.name.split(', ')[0],
        // just grab the first name for the short name
        name: popData.name.split(', ')[0].split('-')[0],
        stateCode: popData.state_code,
        population: parseFloat(popData.population),
        lon: parseFloat(centroidLongitude),
        lat: parseFloat(centroidLatitude),
        industries: []
      })
    }
    isLoadingCoordinates.value = false

    // Every lookup that a town needs failed, or found nothing
    if (towns.value.length === 0) {
      fallBackTo(saved, NO_TOWNS_MESSAGE)
      return
    }

    // Assign tourism, industries, and sizes to towns
    assignTowns()
    console.log('Towns after assignment:', towns.value)

    // Play with what came back, but leave a build with gaps out of the cache
    if (missedTowns || industryStore.failedIndustries.length > 0) {
      console.warn(`Not caching towns for state ${stateFipsCode}: some lookups failed`)
      return
    }

    // Cache the towns data in localStorage
    cachedTowns.value = { dataWindow: latestWindow, towns: towns.value }
    console.log(`Cached towns data for state ${stateFipsCode}:`, towns.value)
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
   * The cached towns, if they can be played with: some towns, and the data
   * window they were built for. A cache from before windows were recorded is
   * a bare list of towns, and does not count — it is built again.
   *
   * @param {Object|Array} cached - What localStorage holds for the state
   * @returns {{dataWindow: Object, towns: Array}|null} The saved towns, or null
   */
  function savedTowns(cached) {
    const usable =
      cached?.dataWindow != null && Array.isArray(cached.towns) && cached.towns.length > 0
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
   * What to do when the new towns cannot be had: play with the cached towns
   * if there are any, or else report the failure for the setup screen.
   *
   * @param {{dataWindow: Object, towns: Array}|null} saved - From `savedTowns`
   * @param {string} message - Player-facing explanation, when nothing is cached
   */
  function fallBackTo(saved, message) {
    if (saved) {
      loadSavedTowns(saved)
    } else {
      towns.value = []
      error.value = message
    }
  }

  /**
   * Plays with cached towns, and the data window they were built for.
   * @param {{dataWindow: Object, towns: Array}} saved - From `savedTowns`
   */
  function loadSavedTowns(saved) {
    towns.value = saved.towns
    dataWindow.value = saved.dataWindow
    console.log(`Loaded cached towns data for state ${selectedState.value}:`, towns.value)
  }

  /**
   * Orchestrates the town assignment process: classifies by population,
   * assigns tourism to large towns, and distributes industries.
   */
  function assignTowns() {
    console.log('Assigning towns...')
    // group towns by population
    towns.value = naturalBreaks(towns.value, 'population', sizeClasses)
    console.log('Towns grouped by population:', towns.value)
    assignTourism()
    assignIndustries()
  }

  /**
   * Assigns the Tourism industry to all large towns.
   * Tourism is a special industry that large population centers always have.
   */
  function assignTourism() {
    console.log('Assigning tourism to towns...')
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
    console.log('Max towns per industry:', maxTowns)
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
    console.log('Starting industry assignment to towns...')

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
      console.log(`\nAssigning industry: ${label} (ID: ${industryId})`)

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
      console.log(`Top towns: ${highDensityTowns.map((town) => town.name)}`)

      // Assign industry to towns in the 'high' density group first
      let assignments = 0
      for (const town of highDensityTowns) {
        const assignedCount = industryAssignmentCounts.get(industryId) || 0

        // no checks for max allowed per town or per industry, just assign to town
        town.industries.push({ name: label, industry: industryId })
        industryAssignmentCounts.set(industryId, assignedCount + 1)
        assignments++
        console.log(`Assigned ${label} to ${town.name} based on high employment density`)
      }

      // Step 3: If industry hasn't reached max allowed, assign to 'medium' group next
      if (assignments < maxTownsPerIndustry.find((ind) => ind.industry === industryId).maxTowns) {
        const mediumDensityTowns = groupedTowns.filter((town) => town.size === 'medium')
        // sort medium towns by employment density
        mediumDensityTowns.sort((a, b) => b.employmentDensity - a.employmentDensity)
        console.log(`Medium density towns: ${mediumDensityTowns.map((town) => town.name)}`)

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
            console.log(`Assigned ${label} to ${town.fullName} from medium density groups`)
          }
          if (assignments >= maxAllowed) break
        }
      }

      console.log(
        `Final assignments for industry ${label}:`,
        industryAssignmentCounts.get(industryId)
      )
    }

    console.log('Final industry assignments for all towns:', towns.value)
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
    setupTowns,
    clearError,
    reset,
    setTowns
  }
})
