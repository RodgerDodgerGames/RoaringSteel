// bls api key
const blsApiKey = '94c72c94fd7940c0b141636ce3217103'
// bls root url
const blsRootUrl = 'https://api.bls.gov/publicAPI/v2/timeseries/data/'

// Array of series IDs for all locations in Minnesota
const seriesIds = ['LAUMN270190000000003', 'LAUMN270270000000003' /* ... */]

// Current year
const currentYear = new Date().getFullYear()

// Fetch data for each series ID
seriesIds.forEach((seriesId) => {
  // Construct the URL for the API request
  const url = `${blsRootUrl}${seriesId}?registrationkey=${blsApiKey}&startyear=${currentYear - 5}&endyear=${currentYear}`

  // Use fetch to send a GET request to the API
  fetch(url)
    .then((response) => {
      // Check if the request was successful
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      // If it was, parse the response as JSON
      return response.json()
    })
    .then((data) => {
      // Process the data
      console.log(data)
    })
    .catch((error) => {
      // Log any errors to the console
      console.error('There was a problem with the fetch operation:', error)
    })
})
