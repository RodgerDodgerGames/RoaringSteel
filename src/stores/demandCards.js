import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as turf from '@turf/turf'
import { useTownsStore } from './towns'

export const useDemandCardsStore = defineStore('demandCards', () => {
  const townsStore = useTownsStore()
  const towns = computed(() => townsStore.towns)

  // State: Reactive list of generated demand cards
  const demandCards = ref([])

  // Function to generate demand cards
  const generateDemandCards = () => {
    console.log('Generating demand cards...')

    const townsData = towns.value
    if (!townsData || townsData.length === 0) {
      console.warn('No towns available for demand card generation.')
      return
    }

    const industries = []
    const townWeights = []
    const totalDemands = townsData.length * 6 // 6x the number of towns

    // Aggregate industry data and calculate town weights
    townsData.forEach((town) => {
      townWeights.push(1 / (1 + town.industries.length)) // Weight inversely proportional to number of industries
      town.industries.forEach((ind) => industries.push(ind.name))
    })

    // Calculate industry proportions
    const industryCounts = industries.reduce((acc, ind) => {
      acc[ind] = (acc[ind] || 0) + 1
      return acc
    }, {})
    const totalIndustryCount = industries.length

    const industryProportions = Object.keys(industryCounts).map((name) => ({
      name,
      proportion: industryCounts[name] / totalIndustryCount
    }))

    // Normalize town weights
    const totalWeight = townWeights.reduce((a, b) => a + b, 0)
    const normalizedTownWeights = townWeights.map((w) => w / totalWeight)

    // Generate demand options
    const options = []
    for (let i = 0; i < totalDemands; i++) {
      const demandOptions = []
      const visitedTowns = new Set()

      // Add a tracking object to count how often each town is selected
      const townSelectionCounts = Array(townsData.length).fill(0)

      while (demandOptions.length < 3) {
        // Adjust weights dynamically based on selection counts
        const adjustedWeights = normalizedTownWeights.map((weight, idx) => {
          // Inverse proportionality: towns selected more often get lower adjusted weight
          return weight / (1 + townSelectionCounts[idx])
        })

        // Normalize the adjusted weights
        const totalAdjustedWeight = adjustedWeights.reduce((a, b) => a + b, 0)
        const finalWeights = adjustedWeights.map((w) => w / totalAdjustedWeight)

        // Select a random destination town using the adjusted weights
        let randTownIdx
        do {
          randTownIdx = weightedRandom(finalWeights)
        } while (visitedTowns.has(randTownIdx))

        const destination = townsData[randTownIdx]
        visitedTowns.add(randTownIdx)

        // Increment the selection count for the chosen town
        townSelectionCounts[randTownIdx]++

        console.log(
          `Destination: ${destination.name} (selected ${townSelectionCounts[randTownIdx]} times)`
        )

        // Select an industry, ensuring it's not produced by the destination town
        const availableIndustries = industryProportions.filter(
          (ind) => !destination.industries.some((prod) => prod.name === ind.name)
        )

        if (availableIndustries.length === 0) continue

        const selectedIndustry = weightedRandomSelect(availableIndustries, 'proportion')
        console.log(`selected industry: ${selectedIndustry.name}`)

        // Calculate payoff based on distance and industry rarity
        const sourceTowns = townsData.filter((town) =>
          town.industries.some((prod) => prod.name === selectedIndustry.name)
        )

        const distances = sourceTowns.map((src) =>
          turf.distance(
            turf.point([src.lon, src.lat]),
            turf.point([destination.lon, destination.lat])
          )
        )

        // calculate payoff
        // The payoff is calculated as the average distance between source towns and destination,
        // multiplied by 10 to scale the value, and then multiplied by the rarity factor.
        // The rarity factor is calculated as the inverse of the count of towns that produce
        // the selected industry. The idea is that rarer industries should have a higher payoff.
        // The result is then rounded to the nearest integer.
        const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length || 0
        const rarityFactor = 1 / industryCounts[selectedIndustry.name]
        const payoff = Math.round(avgDistance * 10 * rarityFactor)
        console.log(
          `average distance: ${avgDistance}, rarity factor: ${rarityFactor}, Payoff: ${payoff}`
        )

        // Create a demand option
        demandOptions.push({
          destination: destination.name,
          industry: selectedIndustry.name,
          payoff
        })
      }

      options.push(demandOptions)
    }

    demandCards.value = options

    // Summarize the demand cards
    console.log('demand card generated', summarizeDemandCards(options))
  }

  // Helper to pick a random index based on weights
  const weightedRandom = (weights) => {
    const rand = Math.random()
    let cumulative = 0
    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i]
      if (rand < cumulative) return i
    }
  }

  // Helper to select weighted random from an array of objects
  const weightedRandomSelect = (array, weightKey) => {
    const totalWeight = array.reduce((acc, obj) => acc + obj[weightKey], 0)
    const rand = Math.random() * totalWeight
    let cumulative = 0
    for (const obj of array) {
      cumulative += obj[weightKey]
      if (rand < cumulative) return obj
    }
  }

  /**
   * Resets the demand cards store to initial state.
   */
  function reset() {
    demandCards.value = []
  }

  /**
   * Sets the complete demand cards array (used for loading saved games).
   * @param {Array} cardsArray - Array of demand card objects
   */
  function setDemandCards(cardsArray) {
    if (Array.isArray(cardsArray)) {
      demandCards.value = cardsArray
    }
  }

  return {
    demandCards,
    generateDemandCards,
    reset,
    setDemandCards
  }

  /**
   * Summarizes demand card data.
   * @param {Array} demandCards - Array of demand options grouped into cards.
   * @returns {Object} Summary of demand card data.
   */
  function summarizeDemandCards(demandCards) {
    const townCounts = {}
    const industryCounts = {}
    const payoffValues = []

    // Flatten demand cards into a single list of demand options
    const allDemandOptions = demandCards.flat()

    // Count occurrences of towns and industries, and collect payoff values
    allDemandOptions.forEach(({ destination, industry, payoff }) => {
      townCounts[destination] = (townCounts[destination] || 0) + 1
      industryCounts[industry] = (industryCounts[industry] || 0) + 1
      payoffValues.push(payoff)
    })

    // Helper function to calculate stats
    const calculateStats = (values) => {
      const min = Math.min(...values)
      const max = Math.max(...values)
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length
      const range = max - min

      return { min, max, mean, range }
    }

    // Compute statistics for towns, industries, and payoffs
    const townStats = calculateStats(Object.values(townCounts))
    const industryStats = calculateStats(Object.values(industryCounts))
    const payoffStats = calculateStats(payoffValues)

    return {
      towns: {
        counts: townCounts,
        stats: townStats
      },
      industries: {
        counts: industryCounts,
        stats: industryStats
      },
      payoffs: payoffStats
    }
  }
})
