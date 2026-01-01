/**
 * Industry Store (industry.js)
 *
 * Manages industry and employment data from the Census Bureau's QWI
 * (Quarterly Workforce Indicators) API. This data is used to determine
 * which industries should be assigned to which towns based on employment patterns.
 *
 * Data Flow:
 * 1. Load industry definitions from CSV (NAICS codes and labels)
 * 2. For each industry, fetch QWI employment data for the state
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
import { useLocalStorage } from '@vueuse/core'

/** Path to curated industry definitions CSV */
const csvFile = '/data/label_industry_curated_test.csv'

export const useIndustryStore = defineStore('qwiStore', () => {
  // STATE

  /** Employment data by industry with MSA-level averages */
  const employmentData = ref([])

  /** Industry definitions loaded from CSV (naics_code, label, ind_level) */
  const industries = ref([])

  /** List of MSA codes found in the employment data */
  const MSAs = ref([])

  /** Loading state for CSV file loading */
  const isLoadingCSV = ref(false)

  /** Loading state for QWI API data fetching */
  const isLoadingQWI = ref(false)

  // ACTIONS

  /**
   * Fetches and processes industry employment data for a state.
   * Uses localStorage caching to avoid redundant API calls.
   *
   * @param {string} stateFipsCode - Two-digit FIPS code (default: "27" for Minnesota)
   * @returns {Promise<void>}
   */
  async function useIndustryData(stateFipsCode = '27') {
    console.log('useIndustryData called with stateFipsCode:', stateFipsCode) // Log when the function is called

    // Use `localStorage` key for caching each state's industry data
    const cachedIndustries = useLocalStorage(`industries_${stateFipsCode}`, [])
    const cachedEmploymentData = useLocalStorage(`employmentData_${stateFipsCode}`, [])
    const cachedMSAs = useLocalStorage(`MSAs_${stateFipsCode}`, [])

    // Load cached data if available
    if (cachedEmploymentData.value.length > 0) {
      industries.value = cachedIndustries.value
      employmentData.value = cachedEmploymentData.value
      MSAs.value = cachedMSAs.value
      return
    }

    // load the industry data from the CSV file
    isLoadingCSV.value = true
    try {
      industries.value = await loadCSV(csvFile)
      console.log('Loaded industry data:', industries.value)
    } catch (e) {
      console.error('Error loading industry CSV:', e)
      isLoadingCSV.value = false
      return
    }
    isLoadingCSV.value = false

    // iterate over each industry and fetch the QWI data
    isLoadingQWI.value = true
    for (const industry of industries.value) {
      console.log('Fetching QWI data for industry:', industry) // Log the industry being processed

      // fetch the QWI data for the industry
      try {
        const { data, error, fetchQWI } = useQWI(stateFipsCode, industry.naics_code)
        await fetchQWI()
        if (error.value) {
          console.error('useQWI error:', error.value)
        } else {
          console.log('Fetched QWI data:', data.value) // Log the fetched QWI data

          // check if all of the data is either null or zero
          // if so, skip this industry
          const allZero = data.value.every((row) => row.Emp === null || row.Emp === 0)
          if (allZero) {
            console.log('All zero data for industry:', industry) // Log that all data is zero
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
      }
    }
    isLoadingQWI.value = false

    // Calculate and assign proportions
    calculateAndAssignProportions()

    // Log the average employment data
    console.log('Average employment data:', employmentData.value)

    // cache data in local storage
    cachedIndustries.value = industries.value
    cachedEmploymentData.value = employmentData.value
    cachedMSAs.value = MSAs.value
  }

  return {
    // STATE
    employmentData,
    industries,
    MSAs,
    isLoadingCSV,
    isLoadingQWI,
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

      // add msacode to MSAs if it doesn't exist
      if (!MSAs.value.includes(msaCode)) {
        MSAs.value.push(msaCode)
      }

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
