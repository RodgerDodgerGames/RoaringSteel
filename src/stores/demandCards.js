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
 * A player plans routes by picking demand lines (single contracts) out of
 * their hand to see on the map: the line under the pointer, and any lines
 * they have pinned. Each pinned line keeps its own color until it is
 * unpinned. Pins belong to a player and are saved with the hands; they are
 * cleared with the hands too, because card ids restart with every new deck
 * and an old pin would otherwise land on a new game's card.
 *
 * A card leaves a hand when one of its demands is delivered, or when the
 * player throws in their whole hand. Either way it goes on the discard pile
 * and a new card is drawn in its place. When the deck runs out, the discard
 * pile is shuffled to make a new one, as at a real table.
 *
 * @module stores/demandCards
 */

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useTownsStore } from './towns'
import { usePlayerStore } from './players'
import { useSettingsStore } from './settings'
import { PIN_COLORS } from '@/config/demands'
import { demandPayoff } from '@/composables/payoffs'

/** How many demand cards each player holds, per the Empire Builder rules */
export const HAND_SIZE = 3

export const useDemandCardsStore = defineStore('demandCards', () => {
  const townsStore = useTownsStore()
  const towns = computed(() => townsStore.towns)
  const playerStore = usePlayerStore()
  const settingsStore = useSettingsStore()

  // STATE

  /** Cards not yet dealt, top of the deck first */
  const drawPile = ref([])

  /** Cards played or thrown in, shuffled back into the deck when it runs out */
  const discardPile = ref([])

  /**
   * Each player's hand, keyed by player id. A plain object rather than a Map
   * so it goes into a save file as-is; JSON turns the numeric ids into string
   * keys, which JavaScript property lookup treats the same.
   */
  const hands = ref({})

  /**
   * The demand lines each player has pinned to the map, keyed by player id
   * like `hands`, oldest pin first. Each pin is
   * { cardId, line, slot }: `line` is the contract's place on its card (0–2),
   * and `slot` the pin's place in PIN_COLORS, which is its color.
   */
  const pins = ref({})

  /**
   * The demand line under the pointer, as { cardId, line }, or null. Only
   * where the pointer is, so it is not saved.
   */
  const hoveredLine = ref(null)

  // GETTERS

  /**
   * The hand a player holds.
   * @param {number} playerId - The player's id
   * @returns {Array} Their cards; empty if they have not been dealt any
   */
  function handOf(playerId) {
    return hands.value[playerId] ?? []
  }

  /**
   * One contract in a player's hand.
   * @param {number} playerId - The player's id
   * @param {number} cardId - The card's id
   * @param {number} line - The contract's place on the card (0–2)
   * @returns {Object|null} The contract, or null if the player does not hold it
   */
  function demandIn(playerId, cardId, line) {
    return handOf(playerId).find((card) => card.id === cardId)?.demands[line] ?? null
  }

  /**
   * The lines a player has pinned, oldest first.
   * @param {number} playerId - The player's id
   * @returns {Array} Their pins: [{ cardId, line, slot }]
   */
  function pinsOf(playerId) {
    return pins.value[playerId] ?? []
  }

  /**
   * The color a player's line is pinned in.
   * @param {number} playerId - The player's id
   * @param {number} cardId - The card's id
   * @param {number} line - The contract's place on the card (0–2)
   * @returns {string|null} The pin's color, or null if the line is not pinned
   */
  function pinColor(playerId, cardId, line) {
    const pin = pinsOf(playerId).find((p) => p.cardId === cardId && p.line === line)
    return pin ? PIN_COLORS[pin.slot] : null
  }

  /**
   * The pins a player keeps when they pin one more line: all of them, or,
   * with the limit already reached, all but the oldest.
   * @param {number} playerId - The player's id
   * @returns {Array} The pins kept, oldest first
   */
  function pinsKeptByNewPin(playerId) {
    const playerPins = pinsOf(playerId)
    const keep = settingsStore.settings.pinLimit - 1
    return playerPins.slice(Math.max(0, playerPins.length - keep))
  }

  /**
   * The first color no pin in a set is using, so pinned lines never share a
   * color.
   * @param {Array} kept - The pins that keep their colors
   * @returns {number} A free place in PIN_COLORS
   */
  function freeSlot(kept) {
    let slot = 0
    while (kept.some((pin) => pin.slot === slot)) slot++
    return slot
  }

  /**
   * The color a player's next pin would get. The line under the pointer is
   * shown in it, so the player sees the color before they click.
   * @param {number} playerId - The player's id
   * @returns {string} A color from PIN_COLORS
   */
  function nextPinColor(playerId) {
    return PIN_COLORS[freeSlot(pinsKeptByNewPin(playerId))]
  }

  /**
   * The demand lines to mark on the map, for the player whose turn it is.
   *
   * While the pointer is over one of their lines, just that line, so the map
   * can pick out its towns alone (`isHovering`); it is in its pin's color,
   * or in the color pinning it would give. Otherwise every line they have
   * pinned, each in its own color.
   *
   * Only the active player's hand counts. Another player's hand can be shown
   * on the strip to see what they are chasing, but pointing at its lines
   * marks nothing, and the active player's pins stay on the map meanwhile.
   *
   * @returns {{isHovering: boolean, lines: Array<{destination: string,
   *   industry: string, color: string}>}}
   */
  const markedLines = computed(() => {
    const playerId = playerStore.activePlayer?.id
    const marked = (demand, color) => ({
      destination: demand.destination,
      industry: demand.industry,
      color
    })

    const hovered = hoveredLine.value
    const hoveredDemand = hovered && demandIn(playerId, hovered.cardId, hovered.line)
    if (hoveredDemand) {
      const color = pinColor(playerId, hovered.cardId, hovered.line) ?? nextPinColor(playerId)
      return { isHovering: true, lines: [marked(hoveredDemand, color)] }
    }

    const lines = pinsOf(playerId).flatMap((pin) => {
      // A save edited by hand could pin a card the player does not hold
      const demand = demandIn(playerId, pin.cardId, pin.line)
      return demand ? [marked(demand, PIN_COLORS[pin.slot])] : []
    })
    return { isHovering: false, lines }
  })

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

        // Pays by how far the commodity has to come (see payoffs.js)
        const payoff = demandPayoff(destination, selectedIndustry.name, townsData)

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
        if (hand.length >= HAND_SIZE) return
        const drawn = drawCard()
        if (!drawn) return
        // Assigned as a new array so a player with no hand yet gets an entry
        hands.value[playerId] = [...hand, drawn]
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
   * Takes the top card off the deck. When the deck is empty, the discard pile
   * is shuffled to become the new deck first, so the game never runs out of
   * cards while any have been played.
   * @returns {Object|undefined} The card, or undefined if there are no cards
   *   left anywhere
   */
  function drawCard() {
    if (drawPile.value.length === 0 && discardPile.value.length > 0) {
      drawPile.value = shuffled(discardPile.value)
      discardPile.value = []
    }
    return drawPile.value.shift()
  }

  /**
   * A copy of some cards in random order (a Fisher–Yates shuffle).
   * @param {Array} cards - The cards
   * @returns {Array} The same cards, shuffled
   */
  function shuffled(cards) {
    const deck = [...cards]
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }
    return deck
  }

  /**
   * Plays a card out of a player's hand — one of its demands has been
   * delivered — onto the discard pile, and draws them a new card in its place.
   * Any of the player's pins on the card go with it.
   *
   * The new card is drawn before the old one is discarded, so a deck that
   * has run out cannot shuffle the card just played straight back to them.
   * @param {number} playerId - The player
   * @param {number} cardId - The card
   * @returns {boolean} True if the player held the card
   */
  function discardCard(playerId, cardId) {
    const hand = handOf(playerId)
    const card = hand.find((c) => c.id === cardId)
    if (!card) return false

    const drawn = drawCard()
    discardPile.value.push(card)
    pins.value[playerId] = pinsOf(playerId).filter((pin) => pin.cardId !== cardId)
    hands.value[playerId] = hand.filter((c) => c !== card).concat(drawn ? [drawn] : [])
    return true
  }

  /**
   * Throws in a player's whole hand and deals them a new one: Empire
   * Builder's way out of a hand of demands that are no good. It costs the
   * player their turn; ending the turn is up to the caller.
   *
   * As with a single card, the new hand is drawn before the old one goes on
   * the discard pile, so the player is never dealt back the cards they threw in.
   * @param {number} playerId - The player
   */
  function discardHand(playerId) {
    const hand = []
    for (let i = 0; i < HAND_SIZE; i++) {
      const drawn = drawCard()
      if (drawn) hand.push(drawn)
    }
    discardPile.value.push(...handOf(playerId))
    pins.value[playerId] = []
    hands.value[playerId] = hand
  }

  /**
   * Pins a line in the active player's hand to the map, or unpins it if it
   * is already pinned. A new pin takes the first free color. Past the pin
   * limit (a setting), the oldest pin is dropped to make room.
   *
   * A line in any other player's hand is left alone: only the player whose
   * turn it is plans on the map.
   *
   * @param {number} cardId - The card's id
   * @param {number} line - The contract's place on the card (0–2)
   */
  function togglePin(cardId, line) {
    const playerId = playerStore.activePlayer?.id
    if (!demandIn(playerId, cardId, line)) return

    const isThisLine = (pin) => pin.cardId === cardId && pin.line === line
    if (pinsOf(playerId).some(isThisLine)) {
      pins.value[playerId] = pinsOf(playerId).filter((pin) => !isThisLine(pin))
      return
    }

    const kept = pinsKeptByNewPin(playerId)
    pins.value[playerId] = [...kept, { cardId, line, slot: freeSlot(kept) }]
  }

  /**
   * Notes which line the pointer is over (see `markedLines`).
   * @param {number} cardId - The card's id
   * @param {number} line - The contract's place on the card (0–2)
   */
  function hoverLine(cardId, line) {
    hoveredLine.value = { cardId, line }
  }

  /** Notes that the pointer has left the demand lines */
  function endHover() {
    hoveredLine.value = null
  }

  /**
   * Drops each player's oldest pins down to the pin limit. Run when the
   * limit is lowered in Settings, or by a loaded save's settings.
   */
  function trimPins() {
    const limit = settingsStore.settings.pinLimit
    Object.keys(pins.value).forEach((playerId) => {
      pins.value[playerId] = pins.value[playerId].slice(-limit)
    })
  }

  watch(() => settingsStore.settings.pinLimit, trimPins)

  /**
   * Prices every demand in the game afresh by the payoff rule (see
   * payoffs.js): in the deck, the discard pile and every hand. Used on saves
   * made before the rule changed, whose cards pay a small fraction of what
   * track costs, so the game could never be won by delivering.
   *
   * A destination is found by name, as everywhere demands are read; one
   * whose town is not in the game keeps its old payoff.
   */
  function repriceDemands() {
    const townsData = towns.value
    const reprice = (card) => {
      card.demands.forEach((demand) => {
        const destination = townsData.find((town) => town.name === demand.destination)
        if (destination) demand.payoff = demandPayoff(destination, demand.industry, townsData)
      })
    }
    drawPile.value.forEach(reprice)
    discardPile.value.forEach(reprice)
    Object.values(hands.value).forEach((hand) => hand.forEach(reprice))
  }

  /**
   * Resets the demand cards store to initial state.
   */
  function reset() {
    drawPile.value = []
    discardPile.value = []
    hands.value = {}
    pins.value = {}
    hoveredLine.value = null
  }

  /**
   * Whether a pin read back from a save can be used: on one of a card's three
   * contracts, and in one of the pin colors.
   * @param {*} pin - A pin as saved
   * @returns {boolean} True if the pin can be used
   */
  function isUsablePin(pin) {
    return (
      Number.isInteger(pin?.cardId) &&
      Number.isInteger(pin.line) &&
      pin.line >= 0 &&
      pin.line < 3 &&
      Number.isInteger(pin.slot) &&
      pin.slot >= 0 &&
      pin.slot < PIN_COLORS.length
    )
  }

  /**
   * The pins in a save that can be used. A damaged or hand-edited save could
   * hold anything there, and a pin that is not a list of well-formed pins
   * would break every reading of the pins, so anything else is left out.
   * @param {*} saved - The save's pins
   * @returns {Object} Each player's usable pins, keyed by player id
   */
  function usablePins(saved) {
    if (!saved || typeof saved !== 'object') return {}
    return Object.fromEntries(
      Object.entries(saved).map(([playerId, playerPins]) => [
        playerId,
        Array.isArray(playerPins) ? playerPins.filter(isUsablePin) : []
      ])
    )
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
   * @param {Array} [deck.discardPile] - Cards played or thrown in; saves
   *   from before cards could be played have none
   * @param {Object} [deck.hands] - Each player's hand, keyed by player id
   * @param {Object} [deck.pins] - Each player's pinned lines, keyed by player
   *   id; saves from before pins existed have none, and unusable pins are
   *   left out
   * @returns {boolean} True if the deck was restored
   */
  function setDeck(deck) {
    if (!Array.isArray(deck?.drawPile)) return false

    drawPile.value = deck.drawPile.map((card, index) =>
      Array.isArray(card) ? { id: index + 1, demands: card } : card
    )
    discardPile.value = Array.isArray(deck.discardPile) ? deck.discardPile : []
    hands.value = deck.hands ?? {}
    pins.value = usablePins(deck.pins)
    return true
  }

  return {
    drawPile,
    discardPile,
    hands,
    pins,
    hoveredLine,
    handOf,
    pinsOf,
    pinColor,
    nextPinColor,
    markedLines,
    generateDemandCards,
    dealHands,
    discardCard,
    discardHand,
    repriceDemands,
    togglePin,
    hoverLine,
    endHover,
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
