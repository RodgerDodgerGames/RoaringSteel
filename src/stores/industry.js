import { defineStore } from 'pinia'
import { ref } from 'vue'
import useQWI from '../composables/useQWI'
import Papa from 'papaparse'

// path to industry CSV file
const csvFile = '/data/label_industry_curated_test.csv'

export const useIndustryStore = defineStore('qwiStore', () => {
  // STATE

  // employment data
  const employmentData = ref([])
  // industry data
  const industries = ref([])
  // MSAs
  const MSAs = ref([])

  // ACTIONS

  // fetch industry data and QWI data for each industry
  async function useIndustryData(stateFipsCode = '27') {
    console.log('useIndustryData called with stateFipsCode:', stateFipsCode) // Log when the function is called

    // load the industry data from the CSV file
    industries.value = await loadCSV(csvFile)
    console.log('Loaded industry data:', industries.value) // Log the loaded industry data

    // iterate over each industry and fetch the QWI data
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

    // Calculate and assign proportions
    calculateAndAssignProportions()

    // Log the average employment data
    console.log('Average employment data:', employmentData.value)
  }

  return {
    // STATE
    employmentData,
    industries,
    MSAs,
    // ACTIONS
    useIndustryData
    // calculateAverageEmployment
  }

  // HELPERS

  // use papaparse to import CSV file
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

  // calculate the average employment for each MSA
  // format: {Emp: "128", industry: "113", msa_code: "14260", state: "16", time: "2019-Q1"}
  // sum employment while grouping by msa_code
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

  // Helper function to calculate and assign proportions
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
      // cap proportion at 0.3
      industry.proportion = Math.min(industryTotal.totalEmployment / totalEmployment, 0.3)
    })
  }
})
