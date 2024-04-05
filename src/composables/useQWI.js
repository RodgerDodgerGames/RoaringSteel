// useQWI.js
import { ref } from 'vue';

export default function useQWI(state, industry) {
  const data = ref([]);
  const error = ref(null);

  const fetchQWI = async () => {
    // Import the QWI configuration
    // api key
    const key = import.meta.env.VITE_QWI_KEY;
    // root url
    const rootUrl = 'https://api.census.gov/data/timeseries/qwi/sa';
    

    // Parameters for the API request
    const params = {
      key: key,
      get: 'Emp',  // Indicator code for Employment Stability
      for: `metropolitan statistical area/micropolitan statistical area:*`,
      // for: `metropolitan statistical area/micropolitan statistical area:33460`,
      in: `state:${state}`,  // FIPS code for the state
      // set up time range to get data from the last five years
      // time: `${new Date().getFullYear() - 5}-Q1`,
      time: `from ${new Date().getFullYear() - 5} to ${new Date().getFullYear()}`,
      industry: industry,  // NAICS code for all industries
      // ind_level: '3',  // Level of industry detail
    };

    // iterate over the params object and add each key-value pair to the URL
    const url = Object.keys(params).reduce((acc, key) => {
      // don't add the "&" character before the first key-value pair
      if (acc !== `${rootUrl}?`) {
        acc += '&';
      }
      return acc + `${key}=${params[key]}`;
    }
    , `${rootUrl}?`);

    // Construct the URL for the API request
    // const url = `${rootUrl}?industry=${params.industry}&get=${params.get}&for=${params.for}&in=${params.in}&time=${params.time}&key=${key}`;

    // Use fetch to send a GET request to the API
    try {
      // log the url being used
      console.log('QWI url:', url);
      const response = await fetch(url);

      // Check if the request was successful
      if (!response.ok) {
        // print response status and reason why it failed
        throw new Error(`HTTP error! status: ${response.status} - ${response.text()}`);
      }

      // If it was, parse the response as JSON
      const jsonData = await response.json();

      // Process the data
      data.value = jsonData;
    } catch (err) {
      // Log any errors to the console
      error.value = `There was a problem with the fetch operation: ${err.message}`;
    }
  };

  return {
    data,
    error,
    fetchQWI,
  };
}