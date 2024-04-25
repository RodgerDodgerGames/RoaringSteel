import { ref } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import { useIndustryStore } from './industry'
import useCensus from '../composables/useCensus'
import getMSALatLon from '../composables/useTigerWeb'

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

    // iterate over MSAs and fetch the lat/lon data
    for (const msaCode of MSAs.value) {
      console.log('Fetching lat/lon data for MSA:', msaCode)
      const { centroidLongitude, centroidLatitude } = await getMSALatLon(msaCode)
      console.log('Lat/Lon data fetched:', centroidLongitude, centroidLatitude)
    }

    // then fetch the population data
    const { populationData, fetchPopulationData } = useCensus(stateFipsCode)
    await fetchPopulationData()
    console.log('Population data fetched:', populationData.value)
  }

  return {
    // STATE
    towns,
    // ACTIONS
    setupTowns
  }

  // HELPERS
})
