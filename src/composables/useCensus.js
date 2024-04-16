import { ref } from 'vue'

export default function useCensus(state) {
  const populationData = ref([])

  // api key
  const key = import.meta.env.VITE_QWI_KEY
  // root url
  const rootUrl = 'https://api.census.gov/data/2022/acs/acs5'

  const fetchPopulationData = async () => {
    const url = setupRequest()

    try {
      console.log('Fetching population data...')
      console.log('URL:', url)

      const response = await fetch(url)
      console.log('Response:', response)

      const censusData = await response.json()
      console.log('Census data:', censusData)

      // The first element in the response is the header, so we remove it
      censusData.shift()

      // Map the response to an object for easier use
      populationData.value = censusData.map(([name, population, state_code, msa_code]) => ({
        name,
        population,
        state_code,
        msa_code
      }))
      console.log('Population data:', populationData.value)
    } catch (error) {
      console.error('Error fetching population data:', error)
    }
  }

  return {
    populationData,
    fetchPopulationData
  }

  // setup API request
  // example:
  // https://api.census.gov/data/2022/acs/acs5?get=NAME,B01001_001E&for=metropolitan%20statistical%20area/micropolitan%20statistical%20area%20(or%20part):*&in=state:06
  function setupRequest() {
    const params = {
      key: key,
      get: 'NAME,B01001_001E',
      for: 'metropolitan statistical area/micropolitan statistical area (or part):*',
      in: `state:${state}`
    }

    const url = Object.keys(params).reduce((acc, key) => {
      if (acc !== `${rootUrl}?`) {
        acc += '&'
      }
      return acc + `${key}=${params[key]}`
    }, `${rootUrl}?`)

    return url
  }
}
