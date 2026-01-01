/**
 * QWI API Composable (useQWI.js)
 *
 * Fetches employment data from the Census Bureau's Quarterly Workforce Indicators (QWI) API.
 * QWI provides detailed employment statistics by industry and geography.
 *
 * API: https://api.census.gov/data/timeseries/qwi/sa
 * Requires: VITE_QWI_KEY environment variable
 *
 * Data returned includes employment counts (Emp) by MSA over the last 5 years.
 *
 * @module composables/setup/useQWI
 */

import { ref } from 'vue'

/**
 * Composable for fetching QWI employment data.
 *
 * @param {string} state - Two-digit state FIPS code (e.g., "27" for Minnesota)
 * @param {number} industry - NAICS industry code to query
 * @returns {Object} { data, error, fetchQWI }
 */
export default function useQWI(state, industry) {
  const data = ref([])
  const error = ref(null)

  const fetchQWI = async () => {
    // Import the QWI configuration
    // api key
    const key = import.meta.env.VITE_QWI_KEY
    // root url
    const rootUrl = 'https://api.census.gov/data/timeseries/qwi/sa'

    // Parameters for the API request
    const params = {
      key: key,
      get: 'Emp', // Indicator code for Employment Stability
      for: `metropolitan statistical area/micropolitan statistical area:*`,
      // for: `metropolitan statistical area/micropolitan statistical area:33460`,
      in: `state:${state}`, // FIPS code for the state
      // set up time range to get data from the last five years
      // time: `${new Date().getFullYear() - 5}-Q1`,
      time: `from ${new Date().getFullYear() - 5} to ${new Date().getFullYear()}`,
      industry: industry // NAICS code for all industries
      // ind_level: '3',  // Level of industry detail
    }

    // iterate over the params object and add each key-value pair to the URL
    const url = Object.keys(params).reduce((acc, key) => {
      // don't add the "&" character before the first key-value pair
      if (acc !== `${rootUrl}?`) {
        acc += '&'
      }
      return acc + `${key}=${params[key]}`
    }, `${rootUrl}?`)

    // Log the key and URL for debugging purposes
    console.log('QWI URL:', url)

    // Construct the URL for the API request
    // const url = `${rootUrl}?industry=${params.industry}&get=${params.get}&for=${params.for}&in=${params.in}&time=${params.time}&key=${key}`;

    // Use fetch to send a GET request to the API
    try {
      // log the url being used
      console.log('QWI url:', url)

      // Send the request
      console.log('Sending GET request to the API...')
      const response = await fetch(url)

      // Check if the request was successful
      if (!response.ok) {
        // print response status and reason why it failed
        const responseText = await response.text()
        console.error(`HTTP error! status: ${response.status} - ${responseText}`)

        // Log the error information before throwing the error
        const errorMessage = `HTTP error! status: ${response.status} - ${responseText}`
        console.error('About to throw an error with message:', errorMessage)

        throw new Error(errorMessage)
      }

      // skip this industry if there is nothing to process from the server
      // eg. 204 No Content
      if (response.status === 204) {
        return
      }

      // If it was, parse the response as JSON
      console.log('Parsing response as JSON...')
      const jsonData = await response.json()

      // Process the data - Census API returns data as array of arrays
      // First row is headers, subsequent rows are data
      console.log('Processing the data...')

      // The Census API uses a long column name for MSA codes - rename it for easier access
      jsonData[0][
        jsonData[0].indexOf('metropolitan statistical area/micropolitan statistical area')
      ] = 'msa_code'

      // Transform from array-of-arrays to array-of-objects format
      // Input:  [["Emp", "msa_code", ...], ["100", "12345", ...], ...]
      // Output: [{Emp: "100", msa_code: "12345", ...}, ...]
      const convertedData = jsonData.map((arr) => {
        return arr.reduce((acc, val, i) => {
          acc[jsonData[0][i]] = val
          return acc
        }, {})
      })

      // Skip the header row (index 0) - it's now embedded as keys in each object
      data.value = convertedData.slice(1)
    } catch (err) {
      // Log any errors to the console
      console.error(`There was a problem with the fetch operation:`, err)
      const errorMessage = err.message || 'No error message available'
      console.error('Setting error value to:', errorMessage)
      error.value = errorMessage
    }
  }

  return {
    data,
    error,
    fetchQWI
  }
}
