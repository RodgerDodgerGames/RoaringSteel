import { defineStore } from 'pinia'
import { ref } from 'vue'
import useQWI from '../composables/useQWI'
import Papa from 'papaparse'

// path to industry CSV file
const csvFile = '/data/label_industry_curated_test.csv'

export const useStore = defineStore('qwiStore', () => {
  // STATE
  const avgEmployment = ref([])

  // ACTIONS
  // industry.js
  async function useIndustryData(stateFipsCode = '27') {
    console.log('useIndustryData called with stateFipsCode:', stateFipsCode) // Log when the function is called

    // load the industry data from the CSV file
    const industryData = await loadCSV(csvFile)
    console.log('Loaded industry data:', industryData) // Log the loaded industry data

    // iterate over each industry and fetch the QWI data
    for (const industry of industryData) {
      console.log('Fetching QWI data for industry:', industry) // Log the industry being processed

      // fetch the QWI data for the industry
      try {
        const { data, error, fetchQWI } = useQWI(stateFipsCode, industry.naics_code)
        await fetchQWI()
        if (error.value) {
          console.error('useQWI error:', error.value)
        } else {
          console.log('Fetched QWI data:', data.value) // Log the fetched QWI data

          // calculate the average employment for the industry
          avgEmployment.value.push({
            industry: industry.naics_code,
            label: industry.label,
            averageEmployment: calculateAverageEmployment(data.value) // Push the calculated average employment directly to the array
          })
        }
      } catch (error) {
        console.error('Error calling useQWI:', error)
      }
    }

    // Log the average employment data
    console.log('Average employment data:', avgEmployment.value)
  }

  return {
    avgEmployment,
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
