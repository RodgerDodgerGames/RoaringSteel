/**
 * Industry Store (industry.js)
 *
 * Manages industry and employment data from the Census Bureau's QWI
 * (Quarterly Workforce Indicators) API. This data is used to determine
 * which industries should be assigned to which towns based on employment patterns.
 *
 * Data Flow:
 * 1. Load the game's industries from CSV (NAICS codes, short labels, a
 *    category each for whoever edits the list, and each one's share of the
 *    country's jobs)
 * 2. Fetch QWI employment data for the state, over the game's data window
 *    (see dataWindow.js), several industries to a request, along with every
 *    area's jobs in all industries together
 * 3. Calculate average employment per MSA
 * 4. For the towns' areas QWI has no numbers for as areas, add up their
 *    counties' jobs instead (see `fillAreas`)
 *
 * Which towns make which of these industries is worked out from this data
 * in townIndustries.js.
 *
 * Employment Data Structure:
 * {
 *   industry: number,      // NAICS code
 *   category: string,      // The industry's kind, such as "Farm" or "Metals"
 *   meanEmp: Object        // {msa_code: average_employment}
 * }
 *
 * @module stores/industry
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import useQWI from '../composables/setup/useQWI'
import { fetchAreaCounties } from '../composables/setup/useCensus'
import Papa from 'papaparse'
import { readCache, writeCache } from '../composables/database'
import { debug } from '@/composables/debug'

/**
 * The game's industries: about 125, mostly the things farms, mines and
 * factories make, and some services, each with a label short enough for a
 * demand card and its share of the country's jobs (see the file itself,
 * public/data/game_industries.csv, and scripts/build-national-shares.mjs).
 */
const csvFile = '/data/game_industries.csv'

/**
 * The NAICS code QWI gives every industry together under: an area's total
 * jobs, which a town's industries are measured against (see
 * townIndustries.js)
 */
export const ALL_INDUSTRIES = '00'

/**
 * How many industries one QWI request asks for. One request can ask for all
 * of them, but a big state's answer for fifty took 11 seconds, close to the
 * time a request is given before it is tried again; ten at a time keeps
 * each well inside it.
 */
const INDUSTRIES_PER_REQUEST = 10

/**
 * The name the database keeps a state's industry data under.
 * @param {string} state - The state's FIPS code
 * @returns {string} Such as "industryJobs_27"
 */
function cacheNameOf(state) {
  return `industryJobs_${state}`
}

export const useIndustryStore = defineStore('qwiStore', () => {
  // STATE

  /** Employment data by industry with MSA-level averages */
  const employmentData = ref([])

  /**
   * Each area's jobs in all industries together, by MSA code: what a town's
   * jobs in an industry are measured against
   */
  const totalJobs = ref({})

  /**
   * The areas whose counties' jobs have been added up (see `fillAreas`), or
   * found to have no counties to add, so they are not asked for again
   */
  const checkedAreas = ref([])

  /** The game's industries, loaded from CSV (naics_code, label, category, national_share) */
  const industries = ref([])

  /**
   * NAICS codes of the industries whose QWI request failed in the last fetch,
   * even after a few tries. They are missing from `employmentData`, and the
   * fetch is not cached, so the next game asks for them again. An industry
   * the API turned down is missing too, but not counted: it would be turned
   * down again. The areas' totals count as an industry here, under
   * ALL_INDUSTRIES.
   */
  const failedIndustries = ref([])

  /** Loading state for CSV file loading */
  const isLoadingCSV = ref(false)

  /** Loading state for QWI API data fetching */
  const isLoadingQWI = ref(false)

  /**
   * How far the QWI fetch has got, for the setup screen: industries fetched
   * so far, out of how many. Zero of zero when nothing is being fetched.
   */
  const progress = ref({ done: 0, total: 0 })

  // ACTIONS

  /**
   * Fetches and processes industry employment data for a state.
   * Keeps each state's data in the browser's database (see database.js) to
   * avoid redundant API calls.
   *
   * The list of industries is always read from the file, so a change to a
   * label or a national share shows in the next game. The jobs come from
   * the cache when it was built for the same data window and has every
   * industry on the list. Once a new year of QWI is out, the window moves
   * on and the data is fetched again; so it is once an industry is added to
   * the list, or when the cache is from before the areas' totals were kept.
   *
   * An industry whose request fails is left out, and the fetch is not cached
   * (see `failedIndustries`): a game can be played without it, but should not
   * be stuck without it for the rest of the window.
   *
   * When the data window could not be looked up at all (the Census Bureau's
   * API is down), the game is played from what is cached, whatever window it
   * was built for: `anyWindow` takes the cache as it is, and fetches nothing.
   *
   * @param {string} stateFipsCode - Two-digit FIPS code (e.g. "27" for Minnesota)
   * @param {{start: number, end: number}} dataWindow - The years to average over
   * @param {Object} [options]
   * @param {boolean} [options.anyWindow] - Use the cache whatever window it
   *   was built for, and fetch nothing if there is none
   * @returns {Promise<void>}
   */
  async function useIndustryData(stateFipsCode, dataWindow, { anyWindow = false } = {}) {
    debug.log('useIndustryData called with stateFipsCode:', stateFipsCode)

    failedIndustries.value = []
    // Start from nothing: these may still hold an earlier game's state, or
    // an earlier window's numbers
    employmentData.value = []
    totalJobs.value = {}
    checkedAreas.value = []

    // load the industry data from the CSV file
    isLoadingCSV.value = true
    try {
      industries.value = await loadCSV(csvFile)
    } catch (e) {
      console.error('Error loading industry CSV:', e)
      isLoadingCSV.value = false
      return
    }
    isLoadingCSV.value = false

    // Each state's industry data is kept under its own name, along with the
    // data window it was built for and the industries it asked for
    const cached = await readCache(cacheNameOf(stateFipsCode))
    const hasCache = cached?.employmentData?.length > 0 && cached.totalJobs != null
    const isSameWindow =
      cached?.dataWindow?.start === dataWindow?.start && cached?.dataWindow?.end === dataWindow?.end
    const askedBefore = new Set(cached?.codes ?? [])
    const hasEvery = industries.value.every(({ naics_code }) => askedBefore.has(String(naics_code)))
    if (hasCache && (anyWindow || (isSameWindow && hasEvery))) {
      employmentData.value = cached.employmentData
      totalJobs.value = cached.totalJobs
      checkedAreas.value = cached.checkedAreas ?? []
      return
    }
    if (anyWindow) return

    // Fetch the QWI data, several industries to a request, the areas' totals
    // with the first
    const asked = [{ naics_code: ALL_INDUSTRIES }, ...industries.value]
    isLoadingQWI.value = true
    progress.value = { done: 0, total: asked.length }
    for (let first = 0; first < asked.length; first += INDUSTRIES_PER_REQUEST) {
      const batch = asked.slice(first, first + INDUSTRIES_PER_REQUEST)
      const jobs = await askJobs(stateFipsCode, batch, dataWindow, null, failedIndustries.value)
      batch.forEach((industry) => {
        const byArea = jobs.get(String(industry.naics_code))
        if (!byArea) return
        if (industry.naics_code === ALL_INDUSTRIES) totalJobs.value = byArea
        else
          employmentData.value.push({
            industry: industry.naics_code,
            category: industry.category,
            meanEmp: byArea
          })
      })
      // Counted once the answer is in, so the setup screen never runs ahead
      progress.value = { ...progress.value, done: first + batch.length }
    }
    isLoadingQWI.value = false

    if (failedIndustries.value.length > 0) {
      console.warn(
        `Not caching industry data: the QWI requests failed for ${failedIndustries.value.join(', ')}`
      )
      return
    }
    await saveState(stateFipsCode, dataWindow)
  }

  /**
   * Adds up the jobs of the counties that make up each town's area, for the
   * areas QWI has no numbers for as areas.
   *
   * QWI's areas are drawn as they were some years ago, and the towns are
   * the areas as the population data draws them now. An area drawn since
   * (Wisconsin's Platteville) or renumbered has no numbers of its own in
   * QWI, so it would make nothing. Its counties are in QWI, though: the
   * area's part in the state is looked up as counties (see
   * `fetchAreaCounties`), and their jobs are added up, industry by industry.
   * An area QWI does have keeps QWI's numbers: counties' numbers hide more
   * (QWI holds back a county's number where it would give away one
   * employer's), so they would lose some of a town's biggest plants.
   *
   * Each area is asked for once: the areas done are kept with the state's
   * cache (see `checkedAreas`), which is saved again, if the state's fetch
   * was complete. If a lookup fails, none of the areas is counted as done,
   * so the next game asks for them again.
   *
   * @param {string} stateFipsCode - The state's FIPS code
   * @param {{start: number, end: number}} dataWindow - The years to average over
   * @param {Array<string>} msaCodes - The state's towns' areas
   * @returns {Promise<boolean>} Whether every area that needed it was filled
   *   in
   */
  async function fillAreas(stateFipsCode, dataWindow, msaCodes) {
    const missing = areasToFill(msaCodes)
    if (missing.length === 0) return true
    debug.log('Adding up counties for areas without jobs data:', missing)

    let counties
    try {
      counties = await fetchAreaCounties(stateFipsCode, missing, dataWindow)
    } catch (e) {
      console.error('Error looking up the counties of areas without jobs data:', e)
      return false
    }

    // Every county's jobs, in every industry and in all together
    const asked = [{ naics_code: ALL_INDUSTRIES }, ...industries.value]
    const countyList = [...new Set([...counties.values()].flat())]
    const failed = []
    const byCode = new Map()
    for (
      let first = 0;
      countyList.length > 0 && first < asked.length;
      first += INDUSTRIES_PER_REQUEST
    ) {
      const batch = asked.slice(first, first + INDUSTRIES_PER_REQUEST)
      const jobs = await askJobs(stateFipsCode, batch, dataWindow, countyList, failed)
      jobs.forEach((byCounty, code) => byCode.set(code, byCounty))
    }
    if (failed.length > 0) {
      console.warn(`Could not add up counties' jobs for ${failed.join(', ')}`)
      return false
    }

    // Each area's counties added up, industry by industry
    const entries = new Map(employmentData.value.map((entry) => [String(entry.industry), entry]))
    const add = (code, msa, jobs) => {
      if (code === ALL_INDUSTRIES) {
        totalJobs.value[msa] = (totalJobs.value[msa] ?? 0) + jobs
        return
      }
      let entry = entries.get(code)
      if (!entry) {
        // An industry with no jobs in any of the state's areas QWI has
        const industry = industries.value.find(({ naics_code }) => String(naics_code) === code)
        entry = { industry: industry.naics_code, category: industry.category, meanEmp: {} }
        employmentData.value.push(entry)
        entries.set(code, entry)
      }
      entry.meanEmp[msa] = (entry.meanEmp[msa] ?? 0) + jobs
    }
    counties.forEach((areaCounties, msa) => {
      byCode.forEach((byCounty, code) => {
        areaCounties.forEach((county) => {
          if (byCounty[county] > 0) add(code, msa, byCounty[county])
        })
      })
    })
    checkedAreas.value = [...checkedAreas.value, ...missing]

    if (failedIndustries.value.length === 0) await saveState(stateFipsCode, dataWindow)
    return true
  }

  /**
   * The areas `fillAreas` would add up counties for: those with no total
   * jobs of their own, not looked up already.
   * @param {Array<string>} msaCodes - The state's towns' areas
   * @returns {Array<string>} The areas, each once
   */
  function areasToFill(msaCodes) {
    return [...new Set(msaCodes.map(String))].filter(
      (msa) => !(totalJobs.value[msa] > 0) && !checkedAreas.value.includes(msa)
    )
  }

  /**
   * Puts several states' industry data together, for a board of more than
   * one state: each industry's employment in every area, from every state,
   * and every area's total jobs. An area that crosses a state line (Boston's
   * reaches into New Hampshire) has its parts' employment added together.
   *
   * @param {Array<{employment: Array<Object>, totalJobs: Object}>} perState -
   *   Each state's `employmentData` and `totalJobs`, as `useIndustryData`
   *   and `fillAreas` left them
   */
  function combineStates(perState) {
    const byIndustry = new Map()
    const totals = {}
    perState.forEach(({ employment, totalJobs: stateTotals }) => {
      employment.forEach(({ industry, category, meanEmp }) => {
        const merged = byIndustry.get(industry) ?? { industry, category, meanEmp: {} }
        Object.entries(meanEmp).forEach(([msaCode, emp]) => {
          merged.meanEmp[msaCode] = (merged.meanEmp[msaCode] ?? 0) + emp
        })
        byIndustry.set(industry, merged)
      })
      Object.entries(stateTotals ?? {}).forEach(([msaCode, jobs]) => {
        totals[msaCode] = (totals[msaCode] ?? 0) + jobs
      })
    })
    employmentData.value = [...byIndustry.values()]
    totalJobs.value = totals
  }

  return {
    // STATE
    employmentData,
    totalJobs,
    checkedAreas,
    industries,
    failedIndustries,
    isLoadingCSV,
    isLoadingQWI,
    progress,
    // ACTIONS
    useIndustryData,
    areasToFill,
    fillAreas,
    combineStates
  }

  // HELPERS

  /**
   * Keeps the state's industry data for the next game there.
   * @param {string} stateFipsCode - The state's FIPS code
   * @param {{start: number, end: number}} dataWindow - The years it is for
   * @returns {Promise<void>}
   */
  async function saveState(stateFipsCode, dataWindow) {
    await writeCache(cacheNameOf(stateFipsCode), {
      dataWindow: { start: dataWindow.start, end: dataWindow.end },
      codes: industries.value.map(({ naics_code }) => String(naics_code)),
      employmentData: employmentData.value,
      totalJobs: totalJobs.value,
      checkedAreas: checkedAreas.value
    })
  }

  /**
   * Fetches some industries' jobs in one request: each one's average over
   * the data window, in each metro and micro area, or in each of some
   * counties.
   *
   * An industry with no jobs counted is left out. If the request fails, all
   * its industries are added to `failed`. If the API turns it down, it is
   * asked again an industry at a time: the one it will not take is left out
   * (it would be turned down again next game, so it is not counted as
   * failed), and the others are kept.
   *
   * @param {string} stateFipsCode - The state's FIPS code
   * @param {Array<{naics_code: number|string}>} batch - The industries
   * @param {{start: number, end: number}} dataWindow - The years to average over
   * @param {Array<string>|null} counties - The counties to ask for, or null
   *   for the state's metro and micro areas
   * @param {Array<number|string>} failed - Where to add the codes of a
   *   request that failed
   * @returns {Promise<Map<string, Object>>} Each industry's average jobs by
   *   area or county code, by NAICS code as text
   */
  async function askJobs(stateFipsCode, batch, dataWindow, counties, failed) {
    const codes = batch.map((industry) => industry.naics_code)
    const jobs = new Map()
    debug.log('Fetching QWI data for industries:', codes)
    try {
      const { data, error, refused, fetchQWI } = counties
        ? useQWI(stateFipsCode, codes, dataWindow, { counties })
        : useQWI(stateFipsCode, codes, dataWindow)
      await fetchQWI()
      if (error.value) {
        console.error('useQWI error:', error.value)
        if (!refused.value) {
          failed.push(...codes)
        } else if (batch.length > 1) {
          for (const industry of batch) {
            const one = await askJobs(stateFipsCode, [industry], dataWindow, counties, failed)
            one.forEach((byPlace, code) => jobs.set(code, byPlace))
          }
        }
        return jobs
      }

      const placeKey = counties ? 'county' : 'msa_code'
      codes.forEach((code) => {
        // The rows for this industry; codes come back as text
        const rows = data.value.filter((row) => String(row.industry) === String(code))
        const hasJobs = rows.some((row) => Number(row.Emp) > 0)
        if (!hasJobs) {
          debug.log('No jobs for industry:', code)
          return
        }
        // format => {msa_code: average employment}
        jobs.set(String(code), calculateAverageEmployment(rows, placeKey))
      })
    } catch (error) {
      console.error('Error calling useQWI:', error)
      failed.push(...codes)
    }
    return jobs
  }

  /**
   * Loads and parses a CSV file using PapaParse.
   *
   * @param {string} file - Path to CSV file
   * @returns {Promise<Array>} Parsed CSV data as array of objects
   */
  async function loadCSV(file) {
    const response = await fetch(file)
    const csvData = await response.text()

    return new Promise((resolve, reject) => {
      Papa.parse(csvData, {
        delimiter: ',', // specify the delimiter
        quoteChar: '"', // specify the quote character
        header: true,
        dynamicTyping: true,
        // The file ends with a newline, which would otherwise be read as one
        // more industry, with no code, asked for in a request of its own
        skipEmptyLines: true,
        complete: (results) => {
          resolve(results.data.filter((row) => row.naics_code != null))
        },
        error: (error) => {
          reject(error)
        }
      })
    })
  }

  /**
   * Calculates average employment per place (area or county) from quarterly
   * data. Groups employment records by place and computes the mean.
   *
   * A quarter with no number (QWI holds one back where it would give away a
   * single employer's jobs) is left out of the mean, not counted as no
   * jobs: a plant hidden for a quarter or two is still there. A place with
   * no numbers at all is left out. QWI sometimes sends a row twice; the copy
   * has the same number, so the mean is the same.
   *
   * Input format: {Emp: "128", industry: "113", msa_code: "14260", state: "16", time: "2019-Q1"}
   *
   * @param {Array} data - QWI data rows with Emp and a place's code
   * @param {string} [placeKey] - Which field has the place's code: msa_code
   *   for an area, county for a county
   * @returns {Object} Map of place code to average employment
   */
  function calculateAverageEmployment(data, placeKey = 'msa_code') {
    const employment = data.reduce((acc, row) => {
      const place = row[placeKey]
      if (row.Emp == null || row.Emp === '') return acc
      const emp = parseInt(row.Emp) || 0

      if (!acc[place]) {
        acc[place] = { total: 0, count: 0 }
      }

      acc[place].total += emp
      acc[place].count++

      return acc
    }, {})

    // calculate the average employment for each place
    return Object.keys(employment).reduce((acc, place) => {
      acc[place] = employment[place].total / employment[place].count
      return acc
    }, {})
  }
})
