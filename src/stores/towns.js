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
 * 6. For the towns' areas the jobs data has no numbers for as areas, add up
 *    their counties' jobs instead (see the industry store's `fillAreas`)
 * 7. Give the towns their industries: each the things its jobs lean on most
 *    (see townIndustries.js)
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

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useIndustryStore } from './industry'
import useCensus from '../composables/setup/useCensus'
import getMSALatLon, { findPrincipalCity } from '../composables/setup/useTigerWeb'
import { assignSizes } from '../composables/setup/townSizes'
import { assignIndustries as assignTownIndustries } from '../composables/setup/townIndustries'
import { regionTest } from '@/composables/map/region'
import usStates from '@/config/usStates'
import { fetchDataWindow } from '../composables/setup/dataWindow'
import { isRefusal, refusalMessage } from '../composables/utils'
import { readCache, writeCache } from '../composables/database'
import { debug } from '@/composables/debug'

/**
 * The steps of the town setup, as the towns store reports them (see
 * `setupStep`), so the setup screen can tell them apart
 */
export const SETUP_STEPS = Object.freeze({
  dataWindow: 'dataWindow',
  industry: 'industry',
  // Jobs by county, for the towns QWI has no numbers for as areas: a step
  // of its own, as it has no count to show (see `setupPercent`)
  counties: 'counties',
  population: 'population',
  placing: 'placing',
  assigning: 'assigning'
})

/**
 * How far a counted step has got, as a whole percentage for the setup
 * screen. Rounded down, so only a finished step shows 100 (as the grid's
 * progress does — see the grid store's `progressPercent`).
 * @param {{done: number, total: number}} count - Done so far, out of how many
 * @returns {number|null} 0–100, or null when there is nothing to count
 */
export function percentOf({ done, total }) {
  if (!(total > 0)) return null
  return Math.min(100, Math.floor((done / total) * 100))
}

/** Shown when no town on the board could be found */
const NO_TOWNS_ON_BOARD_MESSAGE = 'None of the towns found are on this board.'

/**
 * Shown when a state's towns could not be built and none are cached.
 * @param {string|null} name - The state's name, on a board of several; null
 *   on a board of one
 * @returns {string} Player-facing message
 */
function noTownsMessage(name) {
  const whose = name ? `${name}'s` : "this state's"
  return `Could not load ${whose} towns from the Census Bureau. Check your connection and retry.`
}

/**
 * The name the database keeps a state's town sites under.
 * @param {string} state - The state's FIPS code
 * @returns {string} Such as "townSites_27"
 */
function sitesCacheName(state) {
  return `townSites_${state}`
}

/**
 * A state's name, from its FIPS code.
 * @param {string} state - The FIPS code
 * @returns {string} The name, or the code if it is not a known state
 */
function stateName(state) {
  return usStates.find(({ fips }) => fips === state)?.name ?? state
}

/**
 * Town sites from several states, with each area that crosses a state line
 * made one site: the first part's place and name (every part names the same
 * main city), and all the parts' people. An area's sites come in one per
 * state it has people in (see `setupTowns`).
 * @param {Array<Object>} sites - The sites, any area's parts among them
 * @returns {Array<Object>} One site per area
 */
export function mergeSites(sites) {
  const byArea = new Map()
  sites.forEach((site) => {
    const merged = byArea.get(site.msa)
    if (merged) merged.population += site.population
    else byArea.set(site.msa, { ...site })
  })
  return [...byArea.values()]
}

// STORE
export const useTownsStore = defineStore('towns', () => {
  const industryStore = useIndustryStore()

  // STATE
  const towns = ref([])

  // GETTERS

  /**
   * Each commodity's industry code (its NAICS code, or Tourism's), by name,
   * from the towns that make it. Demands and loads name their commodity
   * only, and its icon is looked up by code (see commodityIcons.js). Every
   * commodity on a demand card is made somewhere on the board, so it is
   * here.
   */
  const industryCodes = computed(() => {
    const codes = new Map()
    towns.value.forEach((town) =>
      town.industries.forEach(({ name, industry }) => codes.set(name, industry))
    )
    return codes
  })

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
   * towns in Maine…"; empty when it is doing nothing
   */
  const setupMessage = ref('')

  /** How many towns have been placed so far, out of how many to place */
  const placingCount = ref({ done: 0, total: 0 })

  /**
   * How far the step running has got, as a percentage, for the setup
   * screen's bar: the industries fetched while jobs by industry come in
   * (the industry store counts them), or the towns placed while they are
   * placed. Null for a step with nothing to count, which the screen shows
   * as a bar with no fill level — so is jobs by industry coming from the
   * cache, which fetches nothing.
   */
  const setupPercent = computed(() => {
    if (setupStep.value === SETUP_STEPS.industry) return percentOf(industryStore.progress)
    if (setupStep.value === SETUP_STEPS.placing) return percentOf(placingCount.value)
    return null
  })

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
   * Sets up the towns for a new game on a board of one state or several.
   *
   * A town is a metro or micro area, placed at its main city (see
   * useTigerWeb.js). What is fetched for a state — each town's place, name
   * and population, its "site" — is kept in the browser's database (see
   * database.js), so the next game there need not ask again. The towns
   * themselves are made from the sites afresh each game: those on the board
   * kept, their sizes set and their industries assigned (see `playSites`).
   * On a board of several states, an area that crosses a state line between
   * two of them is one town, its parts' people and jobs added together.
   *
   * Every new game first looks up each state's data window, one small
   * request each, and plays each state from its own latest years. (The
   * board's land cover is drawn from the earliest of them; see
   * `playStates`.) A state's cached sites are used when they were built for
   * those same years; once a new year of jobs data is out, the window has
   * moved on and the sites are built again from the new years. A state is
   * set up the same whether it is played alone or in a region, so its cache
   * serves both.
   *
   * If a state's lookup fails — the Census Bureau's API is down, say — its
   * cached sites and industry data are used as they are, whatever window
   * they were built for. So are they if building its new sites fails, or
   * comes out with no towns at all, and its cache is left as it was. A
   * state with nothing cached leaves nothing to play with, and `error` is
   * set for the setup screen to show, naming the state on a board of
   * several.
   *
   * An industry or a town whose own lookup fails is left out of the game,
   * and that state's sites are not cached, so the next game builds them
   * again rather than keep the gap for the rest of the window. The cache
   * keeps the last complete build.
   *
   * @param {string|Array<string>} stateFipsCodes - The board's states' FIPS
   *   codes (see `boardStates`), or a single state's (e.g. "27" for Minnesota)
   * @param {Object|null} [region] - The board's outline (GeoJSON); towns
   *   whose main city is outside it are left off the board. With none, every
   *   town is kept.
   * @returns {Promise<void>}
   */
  async function setupTowns(stateFipsCodes, region = null) {
    const states = [].concat(stateFipsCodes)
    error.value = null
    debug.log('Setting up towns for states:', states)
    const isOnBoard = regionTest(region)
    const isOneState = states.length === 1
    // Where each area's town goes, looked up once even when the area is in
    // two of the board's states
    const placed = new Map()

    const results = []
    for (const state of states) {
      const result = await stateSites(state, isOneState, placed)
      if (result.error) {
        fail(result.error)
        return
      }
      results.push(result)
    }
    playStates(results, isOnBoard)
  }

  /**
   * One state's sites and industry data, for the years asked for: from its
   * cache, or built afresh (and cached, if every lookup worked). If building
   * them fails, the state's cache is used whatever years it was built for.
   *
   * @param {string} state - The state's FIPS code
   * @param {boolean} isOneState - Whether the board is this state alone, so
   *   the setup screen need not name it
   * @param {Map<string, Promise>} placed - Where each area's town goes, as
   *   looked up so far in this setup (see `placeTown`); added to here
   * @returns {Promise<{dataWindow: Object, sites: Array, employment: Array, totalJobs: Object}|{error: string}>}
   *   The state's sites and industry data (each industry's jobs, and every
   *   area's total), and the years they are for; or what to tell the player
   *   when there are none
   */
  async function stateSites(state, isOneState, placed) {
    const where = isOneState ? '' : ` in ${stateName(state)}`
    const whose = isOneState ? "this state's" : `${stateName(state)}'s`
    const cacheName = sitesCacheName(state)
    const saved = savedSites(await readCache(cacheName))
    const noTowns = noTownsMessage(isOneState ? null : stateName(state))
    /** The cache whatever its years, or the message for the player */
    const fallBack = async (message) => (saved ? playFromCache(state, saved) : { error: message })

    // The state's latest years of jobs data
    let window
    setStep(SETUP_STEPS.dataWindow, `Looking up which years of jobs data to use${where}…`)
    try {
      window = await fetchDataWindow(state)
    } catch (e) {
      console.error('Error looking up the data window:', e)
      return fallBack(failureMessage(e, `${whose} jobs data`))
    }

    // Fetch industry data for the state. A state whose sites are cached for
    // these years usually has its industry data cached too.
    isLoadingIndustry.value = true
    setStep(SETUP_STEPS.industry, `Fetching jobs by industry${where}…`)
    try {
      await industryStore.useIndustryData(state, window)
    } catch (e) {
      console.error('Error fetching industry data:', e)
      return fallBack(noTowns)
    } finally {
      isLoadingIndustry.value = false
    }
    const isComplete = industryStore.failedIndustries.length === 0

    // Use the cached sites if they were built for the same years. Their
    // areas the jobs data has no numbers for are filled in from their
    // counties, which, once done, is kept with the industry data.
    if (saved && saved.dataWindow.start === window.start && saved.dataWindow.end === window.end) {
      await fillAreas(state, window, saved.sites, where)
      return { dataWindow: window, sites: saved.sites, ...jobsData() }
    }

    // Fetch population data for the state
    isLoadingPopulation.value = true
    setStep(SETUP_STEPS.population, `Fetching population${where}…`)
    const { populationData, fetchPopulationData } = useCensus(state, window)
    try {
      await fetchPopulationData()
    } catch (e) {
      console.error('Error fetching population data:', e)
      return fallBack(
        failureMessage(
          e,
          isOneState ? "this state's population" : `${stateName(state)}'s population`
        )
      )
    } finally {
      isLoadingPopulation.value = false
    }

    // Place a town for every metro and micro area with people in the state.
    // Every one is a town, whether or not it has jobs in the game's
    // industries: one that makes nothing is still somewhere to deliver to.
    isLoadingCoordinates.value = true
    const sites = []
    // Whether any town was left out because its lookup failed
    let missedTowns = false
    setStep(SETUP_STEPS.placing, `Placing towns${where}…`)
    for (const [index, popData] of populationData.value.entries()) {
      // Counted before the lookup: `index` towns are placed so far
      placingCount.value = { done: index, total: populationData.value.length }
      const msaCode = popData.msa_code

      let place
      try {
        if (!placed.has(msaCode)) placed.set(msaCode, placeTown(msaCode, popData.name))
        place = await placed.get(msaCode)
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
        // The main city's state, so every state's part of an area agrees on
        // it; the state the people were counted in, if the city was not found
        stateCode: place.stateFips ?? popData.state_code,
        population: parseFloat(popData.population),
        lon: place.lon,
        lat: place.lat
      })
    }
    isLoadingCoordinates.value = false

    // Every lookup that a town needs failed, or found nothing
    if (sites.length === 0) return fallBack(noTowns)

    await fillAreas(state, window, sites, where)

    const built = { dataWindow: window, sites }
    // Play with what came back, but leave a build with gaps out of the cache.
    // A gap in the counties' jobs does not count: those are kept with the
    // industry data, and filled in next game whatever the sites' cache.
    if (missedTowns || !isComplete) {
      console.warn(`Not caching towns for state ${state}: some lookups failed`)
    } else {
      // Keep the sites for the next game in this state
      await writeCache(cacheName, built)
      debug.log(`Cached town sites for state ${state}`)
    }
    return { ...built, ...jobsData() }
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
   * Fills in the jobs of a state's towns' areas that the jobs data has no
   * numbers for (see the industry store's `fillAreas`). A failure leaves
   * those towns making nothing this game.
   * @param {string} state - The state's FIPS code
   * @param {{start: number, end: number}} window - The data window
   * @param {Array<{msa: string}>} sites - The state's town sites
   * @param {string} where - " in Wisconsin" on a board of several states,
   *   for the setup screen; empty on a board of one
   * @returns {Promise<void>}
   */
  async function fillAreas(state, window, sites, where) {
    const msaCodes = sites.map(({ msa }) => msa)
    if (industryStore.areasToFill(msaCodes).length === 0) return
    setStep(SETUP_STEPS.counties, `Fetching jobs by county${where}…`)
    if (!(await industryStore.fillAreas(state, window, msaCodes))) {
      console.warn(`Some towns in state ${state} have no jobs data this game`)
    }
  }

  /**
   * The industry store's data for the state just fetched, copied out before
   * the next state's fetch replaces it.
   * @returns {{employment: Array, totalJobs: Object}} Each industry's jobs,
   *   and every area's total
   */
  function jobsData() {
    return {
      employment: [...industryStore.employmentData],
      totalJobs: { ...industryStore.totalJobs }
    }
  }

  /**
   * Where an MSA's town goes: at its main city (see `findPrincipalCity`),
   * or, if TIGERweb has no such city, in the middle of the area, as towns
   * used to be placed.
   * @param {string} msaCode - The MSA's code
   * @param {string} msaName - Its name, as the Census Bureau writes it
   * @returns {Promise<{lon: number, lat: number, name: string|null, stateFips: string|null}|null>}
   *   Where, and the city's name and state (null for the middle of the
   *   area); null if neither can be found
   * @throws When a lookup fails (see useTigerWeb.js)
   */
  async function placeTown(msaCode, msaName) {
    const city = await findPrincipalCity(msaName)
    if (city) return { lon: city.lon, lat: city.lat, name: city.name, stateFips: city.stateFips }
    const middle = await getMSALatLon(msaCode)
    if (!middle) return null
    return {
      lon: parseFloat(middle.centroidLongitude),
      lat: parseFloat(middle.centroidLatitude),
      name: null,
      stateFips: null
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
   * A state's cached sites, played with its cached industry data, whatever
   * years each was built for: what a state falls back on when its new data
   * cannot be had.
   * @param {string} state - The state's FIPS code
   * @param {{dataWindow: Object, sites: Array}} saved - From `savedSites`
   * @returns {Promise<{dataWindow: Object, sites: Array, employment: Array, totalJobs: Object}>}
   */
  async function playFromCache(state, saved) {
    await industryStore.useIndustryData(state, saved.dataWindow, { anyWindow: true })
    return { dataWindow: saved.dataWindow, sites: saved.sites, ...jobsData() }
  }

  /**
   * Gives up on the towns: there are none to play with, and `error` says why
   * for the setup screen.
   * @param {string} message - Player-facing explanation
   */
  function fail(message) {
    towns.value = []
    setStep('')
    error.value = message
  }

  /**
   * Makes the game's towns from the board's states: their industry data put
   * together (see `combineStates`), and their sites, an area crossing a
   * line between two of them made one (see `mergeSites`). The game is
   * played from the earliest of the states' years: the ones asked for, or,
   * for a state that fell back on its cache, the years that was built for.
   * @param {Array<{dataWindow: Object, sites: Array, employment: Array, totalJobs: Object}>} states -
   *   Each state's sites and industry data, and the years they are for
   * @param {Function} isOnBoard - The board's point test (see `regionTest`)
   */
  function playStates(states, isOnBoard) {
    industryStore.combineStates(
      states.map(({ employment, totalJobs }) => ({ employment, totalJobs }))
    )
    const window = states
      .map(({ dataWindow }) => dataWindow)
      .reduce((earliest, next) => (next.end < earliest.end ? next : earliest))
    playSites(
      { dataWindow: window, sites: mergeSites(states.flatMap(({ sites }) => sites)) },
      isOnBoard
    )
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
   * Gives the towns their industries (see townIndustries.js). Tourism is
   * given out first, so it counts toward a major city's three. An industry
   * in the list without its share of the country's jobs cannot be scored,
   * so it is left out, with a warning: the share is filled in by
   * scripts/build-national-shares.mjs.
   */
  function assignIndustries() {
    const listed = new Map(industryStore.industries.map((ind) => [String(ind.naics_code), ind]))
    const employment = industryStore.employmentData
      .filter(({ industry }) => {
        const entry = listed.get(String(industry))
        if (entry && !(entry.national_share > 0)) {
          console.warn(`Industry ${industry} has no national share; leaving it out`)
        }
        return entry?.national_share > 0
      })
      .map((data) => {
        const { label, national_share } = listed.get(String(data.industry))
        return { ...data, label, nationalShare: national_share }
      })
    towns.value = assignTownIndustries(towns.value, employment, industryStore.totalJobs)
    debug.log(
      'Industries on the board:',
      towns.value.flatMap(({ name, industries }) =>
        industries.map((made) => `${made.name} (${name})`)
      )
    )
  }

  /**
   * Resets the towns store to initial state.
   */
  function reset() {
    towns.value = []
    dataWindow.value = null
    error.value = null
    isLoadingIndustry.value = false
    isLoadingPopulation.value = false
    isLoadingCoordinates.value = false
    setStep('')
    placingCount.value = { done: 0, total: 0 }
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
    industryCodes,
    dataWindow,
    error,
    isLoadingIndustry,
    isLoadingPopulation,
    isLoadingCoordinates,
    setupStep,
    setupMessage,
    setupPercent,
    setupTowns,
    clearError,
    reset,
    setTowns
  }
})
