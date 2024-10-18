import { ref } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import { useIndustryStore } from './industry'
import useCensus from '../composables/setup/useCensus'
import getMSALatLon from '../composables/setup/useTigerWeb'

// CONSTANTS
const tourismThreshold = 0.1
const noIndustryThreshold = 0.1
const maxIndustries = 3
const classifyThresholds = {
  small: 0.45,
  medium: 0.35,
  large: 0.2
}

// STORE
/**
 * Store for managing towns data.
 *
 * @typedef {Object} Town
 * @property {string} msa - The MSA code of the town.
 * @property {string} name - The name of the town.
 * @property {string} stateCode - The state code of the town.
 * @property {number} population - The population of the town.
 * @property {number} lon - The longitude of the town.
 * @property {number} lat - The latitude of the town.
 * @property {Array<Object>} industries - The industries present in the town.
 * @property {string} size - The size category of the town (small, medium, large).
 *
 * @typedef {Object} Industry
 * @property {string} name - The name of the industry.
 * @property {number} industry - The industry code.
 * @property {Object} meanEmp - The mean employment data for the industry.
 * @property {number} proportion - The proportion of employment for the industry.
 *
 * @typedef {Object} PopulationData
 * @property {string} msa_code - The MSA code.
 * @property {string} name - The name of the town.
 * @property {string} state_code - The state code.
 * @property {string} population - The population of the town.
 *
 * @typedef {Object} MaxTownsPerIndustry
 * @property {number} industry - The industry code.
 * @property {number} maxTowns - The maximum number of towns for the industry.
 *
 * @typedef {Object} TownSizes
 * @property {number} numSmall - The number of small towns.
 * @property {number} numMedium - The number of medium towns.
 *
 * @returns {Object} The towns store.
 * @returns {Ref<Array<Town>>} towns - The list of towns.
 * @returns {Function} setupTowns - Function to setup towns for the selected state.
 */
export const useTownsStore = defineStore('towns', () => {
  const industryStore = useIndustryStore()

  // STATE
  const towns = ref([])
  const selectedState = ref('')
  const { MSAs } = storeToRefs(industryStore)

  // ACTIONS

  // Setup towns for the selected state
  async function setupTowns(stateFipsCode) {
    selectedState.value = stateFipsCode
    console.log('Selected state:', stateFipsCode)

    // Load test data if the state is Idaho (16 is the FIPS code for Idaho)
    if (stateFipsCode === '16') {
      try {
        const response = await fetch('/data/idaho_towns.json')
        if (!response.ok) {
          throw new Error('Network response was not ok')
        }
        const idahoTowns = await response.json()
        towns.value = idahoTowns
        console.log('Loaded test data for Idaho:', towns.value)
        return
      } catch (error) {
        console.error('Failed to load test data:', error)
      }
    }

    // Fetch industry data for the selected state
    await industryStore.useIndustryData(stateFipsCode)
    console.log('Industry data fetched:', industryStore.employmentData)

    // Fetch population data for the selected state
    const { populationData, fetchPopulationData } = useCensus(stateFipsCode)
    await fetchPopulationData()
    console.log('Population data fetched:', populationData.value)

    // Fetch latitude and longitude data for each MSA and populate towns
    for (const msaCode of MSAs.value) {
      console.log('Fetching lat/lon data for MSA:', msaCode)
      const { centroidLongitude, centroidLatitude } = await getMSALatLon(msaCode)
      console.log('Lat/Lon data fetched:', centroidLongitude, centroidLatitude)

      const popData = populationData.value.find((data) => data.msa_code === msaCode)

      towns.value.push({
        msa: msaCode,
        name: popData.name.split(', ')[0],
        stateCode: popData.state_code,
        population: parseFloat(popData.population),
        lon: parseFloat(centroidLongitude),
        lat: parseFloat(centroidLatitude),
        industries: []
      })
    }

    // Assign tourism, industries, and sizes to towns
    assignTowns()
    console.log('Towns after assignment:', towns.value)
  }

  // HELPERS

  // Assign tourism, industries, and sizes to towns
  function assignTowns() {
    console.log('Assigning towns...')
    assignTourism()
    assignIndustries()
    assignSizes()
  }

  // Assign tourism industry to top towns by population
  function assignTourism() {
    console.log('Assigning tourism to towns...')
    sortTownsByPopulation()
    const numTourismTowns = Math.floor(tourismThreshold * towns.value.length)
    console.log('Number of towns assigned tourism:', numTourismTowns)

    for (let i = 0; i < numTourismTowns; i++) {
      towns.value[i].industries.push({ name: 'Tourism', industry: 9999 })
      console.log(`Assigned tourism to town: ${towns.value[i].name}`)
    }
  }

  // Count towns without an industry
  function townsWithoutIndustry() {
    const count = towns.value.filter((town) => town.industries.length === 0).length
    console.log('Number of towns without an industry:', count)
    return count
  }

  // Calculate the maximum number of towns per industry
  function calcMaxTownsPerIndustry() {
    const maxTowns = industryStore.employmentData.map((industry) => ({
      industry: industry.industry,
      maxTowns: Math.ceil(towns.value.length * industry.proportion)
    }))
    console.log('Max towns per industry:', maxTowns)
    return maxTowns
  }

  // Assign industries to towns
  function assignIndustries() {
    console.log('Assigning industries to towns...')
    const maxTownsPerIndustry = calcMaxTownsPerIndustry()
    // Initialize industry assignment count with zeroes
    const industryAssignmentCount = industryStore.employmentData.reduce((acc, industry) => {
      acc[industry.industry] = 0
      return acc
    }, {})

    // Assign industries to towns until the threshold is met
    while (townsWithoutIndustry() > noIndustryThreshold * towns.value.length) {
      const totalAssignments = Object.values(industryAssignmentCount).reduce(
        (acc, count) => acc + count,
        0
      )
      // using maxTownsPerIndustry, find the total number of towns that should be assigned an industry
      const totalIndustries = maxTownsPerIndustry.reduce(
        (acc, industry) => acc + industry.maxTowns,
        0
      )
      // check if we have assigned all of the industries
      if (totalAssignments >= totalIndustries) break

      for (const industry of industryStore.employmentData) {
        console.log(`Assigning industry: ${industry.industry}`)
        const sortedEmp = Object.values(industry.meanEmp).sort((a, b) => b - a)

        for (const emp of sortedEmp) {
          const town = findTownForIndustry(
            industry,
            emp,
            maxTownsPerIndustry,
            industryAssignmentCount
          )
          if (town) {
            town.industries.push({ name: industry.name, industry: industry.industry })
            console.log(`Assigned industry ${industry.industry} to town ${town.msa}`)
            industryAssignmentCount[industry.industry]++
            if (
              industryAssignmentCount[industry.industry] >=
              maxTownsPerIndustry.find((i) => i.industry === industry.industry).maxTowns
            )
              break
          }
        }
      }
    }
  }

  function findTownForIndustry(industry, emp, maxTownsPerIndustry, industryAssignmentCount) {
    // Find a town that matches the criteria for assigning an industry
    return towns.value.find(
      (town) =>
        !town.industries.some((ind) => ind.industry === industry.industry) &&
        industry.meanEmp[town.msa] === emp &&
        town.industries.length < maxIndustries &&
        industryAssignmentCount[industry.industry] <
          maxTownsPerIndustry.find((i) => i.industry === industry.industry).maxTowns
    )
  }

  function assignSizes() {
    console.log('Assigning sizes to towns based on population...')
    // sort towns by population in ascending order
    sortTownsByPopulation(false)
    const { numSmall, numMedium } = calculateTownSizes()
    console.log(
      `Total towns: ${towns.value.length}, Small: ${numSmall}, Medium: ${numMedium}, Large: ${towns.value.length - numSmall - numMedium}`
    )

    // Assign size categories to towns based on population
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

  // Sort towns by population, in descending order by default
  function sortTownsByPopulation(desc = true) {
    // Sort towns by population in the specified order
    if (desc !== true) {
      towns.value.sort((a, b) => a.population - b.population)
    } else {
      towns.value.sort((a, b) => b.population - a.population)
    }
    console.log(`Towns sorted by population`, towns.value)
  }

  function calculateTownSizes() {
    // Calculate the number of small, medium, and large towns
    const totalTowns = towns.value.length
    const numSmall = Math.ceil(classifyThresholds.small * totalTowns)
    const numMedium = Math.ceil(classifyThresholds.medium * totalTowns)
    return { numSmall, numMedium }
  }

  return {
    towns,
    setupTowns
  }
})
