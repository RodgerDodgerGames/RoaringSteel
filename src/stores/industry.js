/**
 * Industry Store (industry.js)
 *
 * Manages industry and employment data from the Census Bureau's QWI
 * (Quarterly Workforce Indicators) API. This data is used to determine
 * which industries should be assigned to which towns based on employment patterns.
 *
 * Data Flow:
 * 1. Load industry definitions from CSV (NAICS codes and labels)
 * 2. For each industry, fetch QWI employment data for the state, over the
 *    game's data window (see dataWindow.js)
 * 3. Calculate average employment per MSA
 * 4. Calculate each industry's proportion of total employment
 *
 * Employment Data Structure:
 * {
 *   industry: number,      // NAICS code
 *   level: number,         // Industry level (2-4 digit NAICS)
 *   meanEmp: Object,       // {msa_code: average_employment}
 *   proportion: number     // This industry's share of total employment (capped at 0.2)
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

/** Path to curated industry definitions CSV */
const csvFile = '/data/label_industry_curated_test.csv'

export const useIndustryStore = defineStore('qwiStore', () => {
  // STATE

  /** Employment data by industry with MSA-level averages */
  const employmentData = ref([])

  /** Industry definitions loaded from CSV (naics_code, label, ind_level) */
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
    const cacheName = `industry_${stateFipsCode}`
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

    // iterate over each industry and fetch the QWI data
    isLoadingQWI.value = true
    progress.value = { done: 0, total: industries.value.length }
    for (const industry of industries.value) {
      progress.value = { ...progress.value, done: progress.value.done + 1 }
      debug.log('Fetching QWI data for industry:', industry)

      // fetch the QWI data for the industry
      try {
        const { data, error, refused, fetchQWI } = useQWI(
          stateFipsCode,
          industry.naics_code,
          dataWindow
        )
        await fetchQWI()
        if (error.value) {
          console.error('useQWI error:', error.value)
          // A refusal will come again in the next game too, so it is left
          // out like an industry with no data, rather than keep the state
          // from ever being cached
          if (!refused.value) failedIndustries.value.push(industry.naics_code)
        } else {
          // check if all of the data is either null or zero
          // if so, skip this industry
          const allZero = data.value.every((row) => row.Emp === null || row.Emp === 0)
          if (allZero) {
            debug.log('All zero data for industry:', industry)
            continue
          }

          // calculate the average employment for the industry
          employmentData.value.push({
            industry: industry.naics_code,
            level: industry.ind_level,
            // format => {msa_code: average employment}
            // Push the calculated average employment directly to the array
            meanEmp: calculateAverageEmployment(data.value, industry)
          })
        }
      } catch (error) {
        console.error('Error calling useQWI:', error)
        failedIndustries.value.push(industry.naics_code)
      }
    }
    isLoadingQWI.value = false

    // Calculate and assign proportions
    calculateAndAssignProportions()

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

  return {
    // STATE
    employmentData,
    industries,
    failedIndustries,
    isLoadingCSV,
    isLoadingQWI,
    progress,
    // ACTIONS
    useIndustryData
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
        complete: (results) => {
          resolve(results.data)
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

  /**
   * Calculates each industry's proportion of total employment.
   * Proportions are capped at 0.2 (20%) to ensure industry diversity.
   * Updates employmentData in place with proportion field.
   */
  function calculateAndAssignProportions() {
    // Calculate the total employment for each industry
    const industryTotals = employmentData.value.map((industry) => {
      const totalEmployment = Object.values(industry.meanEmp).reduce((sum, emp) => sum + emp, 0)
      return {
        industry: industry.industry,
        totalEmployment
      }
    })

    // Calculate the total employment across all industries
    const totalEmployment = industryTotals.reduce(
      (sum, industry) => sum + industry.totalEmployment,
      0
    )

    // Assign the proportion for each industry
    employmentData.value.forEach((industry) => {
      const industryTotal = industryTotals.find((i) => i.industry === industry.industry)
      // cap proportion at 0.2
      industry.proportion = Math.min(industryTotal.totalEmployment / totalEmployment, 0.2)
    })
  }
})
