/**
 * Demand Cards Store (demandCards.js)
 *
 * The demand deck and the hand each player holds.
 *
 * A demand card offers three contracts — deliver a commodity to a town for a
 * payoff — and a player may fulfil at most one of them. As in Empire Builder,
 * every player holds a hand of three cards, dealt face up from the deck: hands
 * are public information, not secret.
 *
 * Card shape:
 * {
 *   id: number,                                  // Unique within the deck
 *   demands: [{ destination, industry, payoff }] // The card's three contracts
 * }
 *
 * @module stores/demandCards
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as turf from '@turf/turf'
import { useTownsStore } from './towns'

/** How many demand cards each player holds, per the Empire Builder rules */
export const HAND_SIZE = 3

export const useDemandCardsStore = defineStore('demandCards', () => {
  const townsStore = useTownsStore()
  const towns = computed(() => townsStore.towns)

  // STATE

  /** Cards not yet dealt, top of the deck first */
  const drawPile = ref([])

  /**
   * Each player's hand, keyed by player id. A plain object rather than a Map
   * so it goes into a save file as-is; JSON turns the numeric ids into string
   * keys, which JavaScript property lookup treats the same.
   */
  const hands = ref({})

  // GETTERS

  /**
   * The hand a player holds.
   * @param {number} playerId - The player's id
   * @returns {Array} Their cards; empty if they have not been dealt any
   */
  function handOf(playerId) {
    return hands.value[playerId] ?? []
  }

  // ACTIONS

  /**
   * Builds a fresh deck from the towns in play and clears every hand.
   * Deals nothing — `dealHands` does that once the deck exists.
   */
  const generateDemandCards = () => {
    console.log('Generating demand cards...')

    // A new deck means a new game, so the last game's cards go first — even if
    // no new deck can be built, the old one must not be dealt from
    reset()

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

      // Numbered in deck order; the id is what tells two cards apart once they
      // are spread across the draw pile and players' hands
      options.push({ id: options.length + 1, demands: demandOptions })
    }

    drawPile.value = options

    // Summarize the demand cards
    console.log('demand card generated', summarizeDemandCards(options))
  }

  /**
   * Tops every listed player's hand up to `HAND_SIZE` from the top of the
   * deck, one card per player per pass round the table — the way cards are
   * dealt at a real table, so a short deck shortchanges everyone by at most
   * one card rather than leaving the last player with nothing.
   *
   * Players who already hold a full hand are skipped, so this is safe to call
   * on a game in progress: it is how a save made before hands existed gets
   * its hands dealt when it loads.
   *
   * @param {Array<number>} playerIds - Ids of the players to deal to, in turn order
   */
  function dealHands(playerIds) {
    for (let pass = 0; pass < HAND_SIZE; pass++) {
      playerIds.forEach((playerId) => {
        const hand = handOf(playerId)
        if (hand.length >= HAND_SIZE || drawPile.value.length === 0) return
        // Assigned as a new array so a player with no hand yet gets an entry
        hands.value[playerId] = [...hand, drawPile.value.shift()]
      })
    }

    if (playerIds.some((playerId) => handOf(playerId).length < HAND_SIZE)) {
      console.warn('The demand deck ran out before every hand was full')
    }
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
    drawPile.value = []
    hands.value = {}
  }

  /**
   * Restores the deck and hands from a saved game.
   *
   * Saves written before hands existed hold the deck as a bare list of cards,
   * each a bare list of three demands with no id. Those cards are given ids
   * by their place in the deck, which is unique because such a save has no
   * hands to collide with. The caller deals those players their hands.
   *
   * @param {Object} deck - Saved deck state
   * @param {Array} deck.drawPile - Cards not yet dealt
   * @param {Object} [deck.hands] - Each player's hand, keyed by player id
   * @returns {boolean} True if the deck was restored
   */
  function setDeck(deck) {
    if (!Array.isArray(deck?.drawPile)) return false

    drawPile.value = deck.drawPile.map((card, index) =>
      Array.isArray(card) ? { id: index + 1, demands: card } : card
    )
    hands.value = deck.hands ?? {}
    return true
  }

  return {
    drawPile,
    hands,
    handOf,
    generateDemandCards,
    dealHands,
    reset,
    setDeck
  }

  /**
   * Summarizes demand card data.
   * @param {Array} cards - The deck, as built by `generateDemandCards`
   * @returns {Object} Summary of demand card data.
   */
  function summarizeDemandCards(cards) {
    const townCounts = {}
    const industryCounts = {}
    const payoffValues = []

    // Flatten demand cards into a single list of demand options
    const allDemandOptions = cards.flatMap((card) => card.demands)

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
