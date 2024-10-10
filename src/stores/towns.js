import { ref } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import { useIndustryStore } from './industry'
import useCensus from '../composables/useCensus'
import getMSALatLon from '../composables/useTigerWeb'

// CONSTANTS

// tourism threshold - indicated by population z-score
const tourismThreshold = 2
// no industry threshold - indicated by percent of towns
const noIndustryThreshold = 0.1
// max number of industries per town
const maxIndustries = 3
// town classification thresholds
const classifyhresholds = {
  small: 0.45,
  medium: 0.35,
  large: 0.2
}

// STORE
export const useTownsStore = defineStore('towns', () => {
  // load industry store
  const industryStore = useIndustryStore()

  // STATE

  // town data
  const towns = ref([])
  // selected state
  const selectedState = ref('')

  // industry data
  const { MSAs } = storeToRefs(industryStore)

  // GETTERS

  // ACTIONS

  async function setupTowns(stateFipsCode) {
    // save the selected state
    selectedState.value = stateFipsCode
    console.log('Selected state:', stateFipsCode)

    // first fetch the industry data
    await industryStore.useIndustryData(stateFipsCode)

    // then fetch the population data
    const { populationData, fetchPopulationData } = useCensus(stateFipsCode)
    await fetchPopulationData()
    console.log('Population data fetched:', populationData.value)

    // iterate over MSAs and assemble all data together into towns:
    // population, industry (employment), and lat/lon
    for (const msaCode of MSAs.value) {
      console.log('Fetching lat/lon data for MSA:', msaCode)
      const { centroidLongitude, centroidLatitude } = await getMSALatLon(msaCode)
      console.log('Lat/Lon data fetched:', centroidLongitude, centroidLatitude)

      const popData = populationData.value.find((data) => data.msa_code === msaCode)

      towns.value.push({
        msa: msaCode,
        // parse out name, just grab everything before the comma and space ", "
        name: popData.name.split(', ')[0],
        stateCode: popData.state_code,
        population: parseFloat(popData.population),
        lon: parseFloat(centroidLongitude),
        lat: parseFloat(centroidLatitude),
        industries: []
      })
    }

    assignTowns()
  }

  // HELPERS

  // this function will assign each town with at least one industry, maybe more
  // based on its population and the average employment data for each industry
  function assignTowns() {
    // first assign tourism to towns
    assignTourism()

    // then go through industries and assign them to towns
    assignIndustries()
  }

  // the top n percent of towns by population will be assigned tourism
  // based on the tourism threshold
  function assignTourism() {
    // sort towns by population
    towns.value.sort((a, b) => b.population - a.population)

    // calculate the number of towns that will be assigned tourism
    const numTourismTowns = Math.floor(tourismThreshold * towns.value.length)
    console.log('Number of towns assigned tourism:', numTourismTowns)

    // assign tourism to the top n towns
    for (let i = 0; i < numTourismTowns; i++) {
      towns.value[i].industries.append({
        name: 'Tourism',
        industry: 9999
      })
    }
  }

  // calculate the number of towns without an industry
  function townsWithoutIndustry() {
    return towns.value.filter((town) => town.industries.length === 0).length
  }

  // assign industries to towns based on employment data
  function assignIndustries() {
    // while the number of towns without an industry is greater than the threshold
    // assign industries to towns
    while (townsWithoutIndustry() > noIndustryThreshold * towns.value.length) {
      // iterate over industries in employment data
      for (const industry of industryStore.employmentData.value) {
        // sort industries by z-score
        const sortedZScores = Object.values(industry.zEmp).sort((a, b) => a - b)

        for (const zScore of sortedZScores) {
          // find the town with the highest z-score that hasn't been assigned this industry
          const town = towns.value.find(
            (town) =>
              // town doesn't already have this industry
              !town.industries.some((ind) => ind.industry === industry.industry) &&
              // town's z-score matches the industry's z-score
              industry.zEmp[town.msa] === zScore &&
              // town hasn't exceeded the max number of industries per town
              town.industries.length <= maxIndustries
          )

          // if a town is found, assign the industry to the town
          if (town) {
            town.industries.push({
              name: industry.name,
              industry: industry.industry
            })
            break
          }
        }
      }
    }
  }

  return {
    // STATE
    towns,
    // ACTIONS
    setupTowns
  }
})
