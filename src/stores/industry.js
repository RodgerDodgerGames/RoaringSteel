/**
 * Industry Store (industry.js)
 *
 * Manages industry and employment data from the Census Bureau's QWI
 * (Quarterly Workforce Indicators) API. This data is used to determine
 * which industries should be assigned to which towns based on employment patterns.
 *
 * Data Flow:
 * 1. Load the game's industries from CSV (NAICS codes, short labels, and a
 *    category for each: Farm, Mining, Food, ...)
 * 2. Fetch QWI employment data for the state, over the game's data window
 *    (see dataWindow.js), several industries to a request
 * 3. Calculate average employment per MSA
 *
 * Which of these industries a board plays with, and which towns make them,
 * is worked out from this data in townIndustries.js.
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
import Papa from 'papaparse'
import { readCache, writeCache } from '../composables/database'
import { debug } from '@/composables/debug'

/**
 * The game's industries: about fifty, from every kind of work there is
 * freight for, each with a label short enough for a demand card (see the
 * file itself, public/data/game_industries.csv). A board plays with some of
 * them (see townIndustries.js).
 */
const csvFile = '/data/game_industries.csv'

/**
 * How many industries one QWI request asks for. One request can ask for all
 * of them, but a big state's answer for fifty took 11 seconds, close to the
 * time a request is given before it is tried again; ten at a time keeps
 * each well inside it.
 */
const INDUSTRIES_PER_REQUEST = 10

export const useIndustryStore = defineStore('qwiStore', () => {
  // STATE

  /** Employment data by industry with MSA-level averages */
  const employmentData = ref([])

  /** The game's industries, loaded from CSV (naics_code, label, category) */
  const industries = ref([])

  /**
   * NAICS codes of the industries whose QWI request failed in the last fetch,
   * even after a few tries. They are missing from `employmentData`, and the
   * fetch is not cached, so the next game asks for them again. An industry
   * the API turned down is missing too, but not counted: it would be turned
   * down again.
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
   * The cache is used only when it was built for the same data window. Once
   * a new year of QWI is out, the window moves on and the data is fetched
   * again.
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

    // Each state's industry data is kept under its own name, along with the
    // data window it was built for
    const cacheName = `industryJobs_${stateFipsCode}`
    const cached = await readCache(cacheName)

    failedIndustries.value = []

    // Load cached data if available
    const hasCache = cached?.employmentData?.length > 0
    const isSameWindow =
      cached?.dataWindow?.start === dataWindow?.start && cached?.dataWindow?.end === dataWindow?.end
    if (hasCache && (anyWindow || isSameWindow)) {
      industries.value = cached.industries
      employmentData.value = cached.employmentData
      return
    }
    if (anyWindow) {
      employmentData.value = []
      return
    }

    // Start from nothing. The fetch below adds to these, and they may still
    // hold an earlier game's state, or an earlier window's numbers.
    employmentData.value = []

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

    // Fetch the QWI data, several industries to a request
    isLoadingQWI.value = true
    progress.value = { done: 0, total: industries.value.length }
    for (let first = 0; first < industries.value.length; first += INDUSTRIES_PER_REQUEST) {
      const batch = industries.value.slice(first, first + INDUSTRIES_PER_REQUEST)
      await fetchIndustries(stateFipsCode, batch, dataWindow)
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

    // Keep the data for the next game in this state
    await writeCache(cacheName, {
      dataWindow: { start: dataWindow.start, end: dataWindow.end },
      industries: industries.value,
      employmentData: employmentData.value
    })
  }

  /**
   * Fetches some industries' jobs in one request, adding each one with jobs
   * to `employmentData`.
   *
   * An industry with no jobs in the state, or none counted, is left out. If
   * the request fails, all its industries are counted in `failedIndustries`.
   * If the API turns it down, it is asked again an industry at a time: the
   * one it will not take is left out (it would be turned down again next
   * game, so it is not counted as failed), and the others are kept.
   *
   * @param {string} stateFipsCode - The state's FIPS code
   * @param {Array<Object>} batch - The industries, from the CSV
   * @param {{start: number, end: number}} dataWindow - The years to average over
   * @returns {Promise<void>}
   */
  async function fetchIndustries(stateFipsCode, batch, dataWindow) {
    const codes = batch.map((industry) => industry.naics_code)
    debug.log('Fetching QWI data for industries:', codes)
    try {
      const { data, error, refused, fetchQWI } = useQWI(stateFipsCode, codes, dataWindow)
      await fetchQWI()
      if (error.value) {
        console.error('useQWI error:', error.value)
        if (!refused.value) {
          failedIndustries.value.push(...codes)
        } else if (batch.length > 1) {
          for (const industry of batch) await fetchIndustries(stateFipsCode, [industry], dataWindow)
        }
        return
      }

      batch.forEach((industry) => {
        // The rows for this industry; codes come back as text
        const rows = data.value.filter(
          (row) => String(row.industry) === String(industry.naics_code)
        )
        const hasJobs = rows.some((row) => Number(row.Emp) > 0)
        if (!hasJobs) {
          debug.log('No jobs for industry:', industry)
          return
        }
        employmentData.value.push({
          industry: industry.naics_code,
          category: industry.category,
          // format => {msa_code: average employment}
          meanEmp: calculateAverageEmployment(rows)
        })
      })
    } catch (error) {
      console.error('Error calling useQWI:', error)
      failedIndustries.value.push(...codes)
    }
  }

  /**
   * Puts several states' industry data together, for a board of more than
   * one state: each industry's employment in every area, from every state.
   * An area that crosses a state line (Boston's reaches into New
   * Hampshire) has its parts' employment added together.
   *
   * @param {Array<Array<Object>>} perState - Each state's `employmentData`,
   *   as `useIndustryData` left it
   */
  function combineStates(perState) {
    const byIndustry = new Map()
    perState.flat().forEach(({ industry, category, meanEmp }) => {
      const merged = byIndustry.get(industry) ?? { industry, category, meanEmp: {} }
      Object.entries(meanEmp).forEach(([msaCode, emp]) => {
        merged.meanEmp[msaCode] = (merged.meanEmp[msaCode] ?? 0) + emp
      })
      byIndustry.set(industry, merged)
    })
    employmentData.value = [...byIndustry.values()]
  }

  return {
    // STATE
    employmentData,
    industries,
    failedIndustries,
    isLoadingCSV,
    isLoadingQWI,
    progress,
    // ACTIONS
    useIndustryData,
    combineStates
  }

  // HELPERS

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
   * Calculates average employment per MSA from quarterly data.
   * Groups employment records by MSA and computes the mean.
   *
   * Input format: {Emp: "128", industry: "113", msa_code: "14260", state: "16", time: "2019-Q1"}
   *
   * @param {Array} data - QWI data rows with Emp and msa_code fields
   * @returns {Object} Map of msa_code to average employment
   */
  function calculateAverageEmployment(data) {
    const employment = data.reduce((acc, row) => {
      const msaCode = row.msa_code

      // if row.Emp is null count it as zero
      const emp = parseInt(row.Emp) || 0

      if (!acc[msaCode]) {
        acc[msaCode] = { total: 0, count: 0 }
      }

      acc[msaCode].total += emp
      acc[msaCode].count++

      return acc
    }, {})

    // calculate the average employment for each MSA
    return Object.keys(employment).reduce((acc, msaCode) => {
      acc[msaCode] = employment[msaCode].total / employment[msaCode].count
      return acc
    }, {})
  }
})
