// towns.js
// store for loading, managing, and classifying towns data

// IMPORTS
import { ref } from 'vue'
import { defineStore, storeToRefs } from 'pinia'

// composables
import { useLocalStorage } from '@vueuse/core'
import { useIndustryStore } from './industry'
import useCensus from '../composables/setup/useCensus'
import getMSALatLon from '../composables/setup/useTigerWeb'

// CONSTANTS
// town size classes
const sizeClasses = ['small', 'medium', 'large']
// percent of towns that an industry can have assigned to them
const maxTownsForIndustry = 0.2
// maximum number of industries per town
const maxIndustries = 3

// STORE
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

    // Use `localStorage` key for caching each state's towns data
    const cachedTowns = useLocalStorage(`towns_${stateFipsCode}`, [])

    // Load cached data if available
    if (cachedTowns.value.length > 0) {
      towns.value = cachedTowns.value
      console.log(`Loaded cached towns data for state ${stateFipsCode}:`, towns.value)
      return
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

      // if there is no population data for the MSA, skip it
      if (!popData) {
        continue
      }

      towns.value.push({
        msa: msaCode,
        fullName: popData.name.split(', ')[0],
        // just grab the first name for the short name
        name: popData.name.split(', ')[0].split('-')[0],
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

    // Cache the towns data in localStorage
    cachedTowns.value = towns.value
    console.log(`Cached towns data for state ${stateFipsCode}:`, towns.value)
  }

  // HELPERS

  // Assign tourism, industries, and sizes to towns
  function assignTowns() {
    console.log('Assigning towns...')
    // group towns by population
    towns.value = naturalBreaks(towns.value, 'population', sizeClasses)
    console.log('Towns grouped by population:', towns.value)
    assignTourism()
    assignIndustries()
  }

  // Assign tourism industry to all towns with the largest class size
  function assignTourism() {
    console.log('Assigning tourism to towns...')
    towns.value.forEach((town) => {
      if (town.size === 'large') {
        town.industries.push({ name: 'Tourism', industry: 9999 })
      }
    })
  }

  // Calculate the maximum number of towns per industry
  function calcMaxTownsPerIndustry() {
    const maxTowns = industryStore.employmentData.map((industry) => ({
      industry: industry.industry,
      maxTowns: Math.floor(towns.value.length * industry.proportion) || 1
    }))
    console.log('Max towns per industry:', maxTowns)
    return maxTowns
  }

  // Assign industries to towns
  function assignIndustries() {
    console.log('Starting industry assignment to towns...')

    // Enrich employment data with industry labels
    const enrichedEmploymentData = enrichEmploymentData(
      industryStore.employmentData,
      industryStore.industries
    )

    // Step 1: Calculate the maximum number of towns each industry can be assigned to
    const maxTownsPerIndustry = calcMaxTownsPerIndustry()

    // Track assignments for each industry
    const industryAssignmentCounts = new Map(maxTownsPerIndustry.map((ind) => [ind.industry, 0]))

    // Step 2: Loop through each industry, applying natural breaks to the normalized employment data
    for (const industry of enrichedEmploymentData) {
      const { industry: industryId, label, meanEmp } = industry
      console.log(`\nAssigning industry: ${label} (ID: ${industryId})`)

      // Get the maximum number of towns allowed for this industry
      const maxAllowed = maxTownsPerIndustry.find((ind) => ind.industry === industryId).maxTowns
      // Prepare an array of towns with normalized employment data (employment density)
      const townsWithEmploymentDensity = towns.value
        .map((town) => ({
          ...town,
          // Normalize by dividing employment by town's population
          employmentDensity: meanEmp[town.msa] ? meanEmp[town.msa] / town.population : 0
        }))
        .filter((town) => town.employmentDensity > 0) // Consider only towns with employment in this industry

      // Apply natural breaks to group towns by employment density for this industry
      const groupedTowns = naturalBreaks(townsWithEmploymentDensity, 'employmentDensity', [
        'low',
        'medium',
        'high'
      ])
      const highDensityTowns = groupedTowns.filter((town) => town.size === 'high')
      console.log(`Top towns: ${highDensityTowns.map((town) => town.name)}`)

      // Assign industry to towns in the 'high' density group first
      let assignments = 0
      for (const town of highDensityTowns) {
        const assignedCount = industryAssignmentCounts.get(industryId) || 0

        // no checks for max allowed per town or per industry, just assign to town
        town.industries.push({ name: label, industry: industryId })
        industryAssignmentCounts.set(industryId, assignedCount + 1)
        assignments++
        console.log(`Assigned ${label} to ${town.name} based on high employment density`)
      }

      // Step 3: If industry hasn't reached max allowed, assign to 'medium' group next
      if (assignments < maxTownsPerIndustry.find((ind) => ind.industry === industryId).maxTowns) {
        const mediumDensityTowns = groupedTowns.filter((town) => town.size === 'medium')
        // sort medium towns by employment density
        mediumDensityTowns.sort((a, b) => b.employmentDensity - a.employmentDensity)
        console.log(`Medium density towns: ${mediumDensityTowns.map((town) => town.name)}`)

        for (const town of mediumDensityTowns) {
          if (
            industryAssignmentCounts.get(industryId) < maxAllowed &&
            town.industries.length < maxIndustries
          ) {
            town.industries.push({ name: label, industry: industryId })
            industryAssignmentCounts.set(
              industryId,
              (industryAssignmentCounts.get(industryId) || 0) + 1
            )
            assignments++
            console.log(`Assigned ${label} to ${town.fullName} from medium density groups`)
          }
          if (assignments >= maxAllowed) break
        }
      }

      console.log(
        `Final assignments for industry ${label}:`,
        industryAssignmentCounts.get(industryId)
      )
    }

    console.log('Final industry assignments for all towns:', towns.value)
  }

  function enrichEmploymentData(employmentData, industries) {
    const industryMap = new Map(industries.map((ind) => [ind.naics_code, ind.label]))
    return employmentData.map((data) => ({
      ...data,
      label: industryMap.get(data.industry) || 'Unknown Industry' // Default label if not found
    }))
  }

  /**
   * Classifies data into groups based on the largest breaks between values, adding a "size" property.
   *
   * @param {Array} data - Array of objects to classify.
   * @param {String} property - The numeric property to base classifications on.
   * @param {Array} sizeClasses - Array of size classes (e.g., ['small', 'medium', 'large']).
   * @returns {Array} - Original array with updated objects, each containing a "size" property.
   */
  function naturalBreaks(data, property, sizeClasses) {
    const numClasses = sizeClasses.length

    // Sort data based on the property
    const sortedData = [...data].sort((a, b) => a[property] - b[property])

    // Calculate gaps between consecutive values
    const gaps = sortedData.map((item, index) => {
      if (index === 0) return 0 // No gap for the first item
      return sortedData[index][property] - sortedData[index - 1][property]
    })

    // Find the largest gaps to determine class breaks
    const largestGaps = [...gaps]
      .map((gap, index) => ({ gap, index }))
      .sort((a, b) => b.gap - a.gap)
      .slice(0, numClasses - 1) // Get indices for the largest gaps
      .map((g) => g.index)
      .sort((a, b) => a - b) // Sort the indices in ascending order

    // Use gap indices to classify data into classes and label them with sizeClasses
    let startIdx = 0
    for (let i = 0; i < largestGaps.length; i++) {
      const endIdx = largestGaps[i]
      for (let j = startIdx; j < endIdx; j++) {
        sortedData[j].size = sizeClasses[i]
      }
      startIdx = endIdx
    }

    // Label the remaining data with the last size class
    for (let j = startIdx; j < sortedData.length; j++) {
      sortedData[j].size = sizeClasses[sizeClasses.length - 1]
    }

    return sortedData
  }

  return {
    towns,
    setupTowns
  }
})
