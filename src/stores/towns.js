import { ref, computed } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import { useIndustryStore } from './industry'
import useCensus from '../composables/useCensus'

export const useTownsStore = defineStore('towns', () => {
  // load industry store
  const industryStore = useIndustryStore()

  // STATE

  // town data
  const towns = ref([])
  // selected state
  const selectedState = ref('')

  // industry data
  const { employmentData } = storeToRefs(industryStore)

  // GETTERS

  // get the list of MSAs from the industry data
  const MSAs = computed(() =>
    employmentData.value.map((industry) => {
      // industry.meanEmp is an object with MSA codes as keys
      return Object.keys(industry.meanEmp)
    })
  )

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
  }

  return {
    // STATE
    towns,
    // ACTIONS
    setupTowns
  }

  // HELPERS
})
