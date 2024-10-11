import { ref } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import { useIndustryStore } from './industry'
import useCensus from '../composables/useCensus'
import getMSALatLon from '../composables/useTigerWeb'

// CONSTANTS

// tourism threshold - indicated by population z-score
const tourismThreshold = 0.1
// no industry threshold - indicated by percent of towns
const noIndustryThreshold = 0.1
// max number of industries per town
const maxIndustries = 3
// town classification thresholds
const classifyThresholds = {
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
    console.log('Industry data fetched:', industryStore.employmentData)

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
    console.log('Towns after assignment:', towns.value)
  }

  // HELPERS

  // this function will assign each town with at least one industry, maybe more
  // based on its population and the average employment data for each industry
  function assignTowns() {
    console.log('Assigning towns...')

    // first assign tourism to towns
    assignTourism()

    // then go through industries and assign them to towns
    assignIndustries()

    // finally assign sizes to towns
    assignSizes()
  }

  // the top n percent of towns by population will be assigned tourism
  // based on the tourism threshold
  function assignTourism() {
    console.log('Assigning tourism to towns...')

    // sort towns by population
    towns.value.sort((a, b) => b.population - a.population)
    console.log('Towns sorted by population:', towns.value)

    // calculate the number of towns that will be assigned tourism
    const numTourismTowns = Math.floor(tourismThreshold * towns.value.length)
    console.log('Number of towns assigned tourism:', numTourismTowns)

    // assign tourism to the top n towns
    for (let i = 0; i < numTourismTowns; i++) {
      towns.value[i].industries.push({
        name: 'Tourism',
        industry: 9999
      })
      console.log(`Assigned tourism to town: ${towns.value[i].msa}`)
    }
  }

  // calculate the number of towns without an industry
  function townsWithoutIndustry() {
    const count = towns.value.filter((town) => town.industries.length === 0).length
    console.log('Number of towns without an industry:', count)
    return count
  }

  // calculate max number of towns for each industry
  function calcMaxTownsPerIndustry() {
    // Calculate the maximum number of towns for each industry
    const maxTowns = industryStore.employmentData.map((industry) => {
      return {
        industry: industry.industry,
        maxTowns: Math.ceil(towns.value.length * industry.proportion)
      }
    })
    console.log('Max towns per industry:', maxTowns)
    return maxTowns
  }

  // assign industries to towns based on employment data
  function assignIndustries() {
    console.log('Assigning industries to towns...')

    // calculate the maximum number of towns for each industry
    const maxTownsPerIndustry = calcMaxTownsPerIndustry()

    // Track the number of towns assigned to each industry
    // initialize each industry to zero
    const industryAssignmentCount = industryStore.employmentData.reduce((acc, industry) => {
      acc[industry.industry] = 0
      return acc
    }, {})

    // while the number of towns without an industry is greater than the threshold
    // assign industries to towns
    while (townsWithoutIndustry() > noIndustryThreshold * towns.value.length) {
      // iterate over industries in employment data
      for (const industry of industryStore.employmentData) {
        console.log(`Assigning industry: ${industry.industry}`)

        // create array of mean employment values sorted descending
        const sortedEmp = Object.values(industry.meanEmp).sort((a, b) => b - a)

        // iterate over sorted employment values
        for (const emp of sortedEmp) {
          // find the town with the highest employment that hasn't been assigned this industry
          const town = towns.value.find(
            (town) =>
              // town doesn't already have this industry
              !town.industries.some((ind) => ind.industry === industry.industry) &&
              // town's z-score matches the industry's z-score
              industry.meanEmp[town.msa] === emp &&
              // town hasn't exceeded the max number of industries per town
              town.industries.length < maxIndustries &&
              // Industry hasn't exceeded the max number of towns
              industryAssignmentCount[industry.industry] <
                maxTownsPerIndustry.find((i) => i.industry === industry.industry).maxTowns
          )

          // if a town is found, assign the industry to the town
          if (town) {
            town.industries.push({
              name: industry.name,
              industry: industry.industry
            })
            console.log(`Assigned industry ${industry.industry} to town ${town.msa}`)

            // Increment the assignment count for the industry
            industryAssignmentCount[industry.industry]++
            // Break if the industry has reached its max number of towns
            if (
              industryAssignmentCount[industry.industry] >=
              maxTownsPerIndustry.find((i) => i.industry === industry.industry).maxTowns
            ) {
              break
            }
          }
        }
      }
    }
  }

  // using classification thresholds, classify towns into small, medium, and large
  // based on their population
  function assignSizes() {
    console.log('Assigning sizes to towns based on population...')

    // sort towns by population
    towns.value.sort((a, b) => b.population - a.population)
    console.log('Towns sorted by population:', towns.value)

    // calculate the number of towns that will be assigned each size
    const totalTowns = towns.value.length
    const numSmall = Math.ceil(classifyThresholds.small * totalTowns)
    const numMedium = Math.ceil(classifyThresholds.medium * totalTowns)
    console.log(
      `Total towns: ${totalTowns}, Small: ${numSmall}, Medium: ${numMedium}, Large: ${totalTowns - numSmall - numMedium}`
    )

    // assign sizes to towns
    towns.value.forEach((town, index) => {
      if (index < numSmall) {
        town.size = 'small'
        console.log(`Assigned size 'small' to town ${town.msa}`)
      } else if (index < numSmall + numMedium) {
        town.size = 'medium'
        console.log(`Assigned size 'medium' to town ${town.msa}`)
      } else {
        town.size = 'large'
        console.log(`Assigned size 'large' to town ${town.msa}`)
      }
    })

    console.log('Towns classified:', towns.value)
  }

  return {
    // STATE
    towns,
    // ACTIONS
    setupTowns
  }
})
