import { ref } from 'vue'

// useQWI.js

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

      // If it was, parse the response as JSON
      console.log('Parsing response as JSON...')
      const jsonData = await response.json()

      // Process the data
      console.log('Processing the data...')
      // manually rename MSA/MICROSA column to 'msa_code'
      jsonData[0][
        jsonData[0].indexOf('metropolitan statistical area/micropolitan statistical area')
      ] = 'msa_code'

      // convert data from array of arrays to array of objects
      // the keys are the first element in the array
      // the values are the remaining elements in the array
      const convertedData = jsonData.map((arr) => {
        return arr.reduce((acc, val, i) => {
          acc[jsonData[0][i]] = val
          return acc
        }, {})
      })

      data.value = convertedData.slice(1) // Remove the first element (header row)
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
