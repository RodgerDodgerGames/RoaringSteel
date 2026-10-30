/**
 * Whole Game Test
 *
 * Plays a two-player game from the first building round to a win, through
 * the same calls a computer player would make — the track builder, the
 * trains store, and ending turns — with no map. It checks that the pieces
 * fit together: track built from a major city joins the towns it reaches,
 * a placed train can run on it, deliveries pay and draw new cards, and the
 * game ends when a player has the cash and the cities.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
import { useGridStore } from '@/stores/grid'
import { useTownsStore } from '@/stores/towns'
import { useTrainsStore } from '@/stores/trains'
import { useDemandCardsStore } from '@/stores/demandCards'
import { useTrackBuilder } from '@/composables/trackBuilder'
import { useTurn } from '@/composables/useTurn'
import { gameRules } from '@/config/game'
import { makeTestGrid, CELL } from '../utils/testGrid'

const centerOf = (i) => ({ lat: 0, lng: (i + 0.5) * CELL })

/** Twelve cheap cells in a row along the equator */
const grid = makeTestGrid({ rows: 1, cols: 12, south: -CELL / 2, cell: () => ({ cost: 100 }) })

/** Two major cities six cells (60 km) apart, and a small town further east */
const town = (name, cell, size, industry) => ({
  name,
  msa: name,
  lat: 0,
  lon: centerOf(cell).lng,
  size,
  industries: [{ name: industry }]
})
const towns = [
  town('Alpha', 0, 'large', 'Coal'),
  town('Beta', 6, 'large', 'Steel'),
  town('Gamma', 11, 'small', 'Beef')
]
const at = (name) => {
  const t = towns.find((candidate) => candidate.name === name)
  return { lat: t.lat, lng: t.lon }
}

/** Every card wants Steel in Alpha and Coal in Beta, so a shuttle pays */
const card = (id) => ({
  id,
  demands: [
    { destination: 'Alpha', industry: 'Steel', payoff: 100000 },
    { destination: 'Beta', industry: 'Coal', payoff: 100000 },
    { destination: 'Alpha', industry: 'Beef', payoff: 50000 }
  ]
})

describe('a whole game', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    localStorage.clear()
    useGridStore().setGrid(grid)
    useTownsStore().setTowns(towns)
    const playerStore = usePlayerStore()
    playerStore.addPlayer({ name: 'Ann', color: 'red', cash: gameRules.startingCash })
    playerStore.addPlayer({ name: 'Bo', color: 'blue', cash: gameRules.startingCash })
    playerStore.startGame()
    useDemandCardsStore().setDeck({ drawPile: Array.from({ length: 30 }, (_, i) => card(i + 1)) })
    useDemandCardsStore().dealHands([1, 2])
  })

  it('should be played from the first building round to a win', () => {
    const playerStore = usePlayerStore()
    const gameStore = useGameStore()
    const trains = useTrainsStore()
    const builder = useTrackBuilder()
    const { endTurn } = useTurn()
    const ANN = 1
    const BO = 2

    /**
     * Ann's turn once trains run: shuttle between the two cities, loading
     * what the other one wants and delivering it.
     */
    function annRuns() {
      if (!trains.trainOf(ANN).position) {
        expect(trains.placeTrain(ANN, 'Beta').ok).toBe(true)
      }
      const here = trains.townOf(ANN).name
      const [load, there] = here === 'Beta' ? ['Steel', 'Alpha'] : ['Coal', 'Beta']
      expect(trains.pickUp(ANN, load).ok).toBe(true)
      expect(trains.moveTrain(ANN, there)).toMatchObject({ ok: true, arrived: true })
      const [delivery] = trains.deliveryOptions(ANN)
      expect(trains.deliver(ANN, delivery.cardId, delivery.line).ok).toBe(true)
    }

    // Building round 1: Ann builds Alpha–Beta from Alpha, Bo builds Beta–Gamma
    expect(builder.buildSection(ANN, [at('Alpha'), at('Beta')]).ok).toBe(true)
    endTurn()
    expect(builder.buildSection(BO, [at('Beta'), at('Gamma')]).ok).toBe(true)
    endTurn()
    // Building round 2 runs back: Bo, then Ann, who then opens round 3
    endTurn()
    endTurn()
    expect(gameStore.isBuildingRound).toBe(false)
    expect(playerStore.activePlayer.id).toBe(ANN)

    // Normal rounds until someone wins; Bo only watches
    for (let turn = 0; turn < 20 && !gameStore.isOver; turn++) {
      if (playerStore.activePlayer.id === ANN) annRuns()
      if (!gameStore.isOver) endTurn()
    }

    expect(gameStore.winnerId).toBe(ANN)
    expect(playerStore.players[0].cash).toBeGreaterThanOrEqual(gameRules.victory.cash)
    // Every delivery drew a fresh card, so the hand is still full
    expect(useDemandCardsStore().handOf(ANN)).toHaveLength(3)
    // Nothing more can be done once the game is won
    expect(endTurn()).toBe(false)
    expect(trains.moveTrain(ANN, 'Alpha').ok).toBe(false)
    expect(builder.buildSection(ANN, [at('Alpha'), centerOf(3)]).ok).toBe(false)
  })
})
