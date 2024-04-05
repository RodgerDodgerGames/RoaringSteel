import { defineStore } from 'pinia'
import { ref } from 'vue'
import useQWI from './useQWI'
import { csv } from 'd3'

export const useStore = defineStore('qwiStore', () => {
  
  // STATE
  const avgEmployment = ref([])
  
  // ACTIONS
  async function loadCSV() {
      const data = await csv('/path/to/label_industry_curated.CSV')
      for (const row of data) {
        const industryCode = row['industry_code']
        const { data: qwiData } = useQWI('27', industryCode) // '27' is the FIPS code for Minnesota
        await qwiData.fetchQWI()
        const avgEmployment = this.calculateAverageEmployment(qwiData.value)
        this.avgEmployment.value.push(avgEmployment)
      }
    }
    function calculateAverageEmployment(data) {
      let sum = 0
      let count = 0
      for (const item of data) {
        for (const quarter of item.quarters) {
          if (quarter.employment !== null) {
            sum += quarter.employment
            count++
          }
        }
      }
      return sum / count
    }

    return {
      avgEmployment,
      loadCSV,
      calculateAverageEmployment
  }
})