/**
 * Train Stop Store Tests
 *
 * When a person's train is placed in a town, or runs into one, and the town
 * has something for it — a load to pick up, or a demand to deliver — its stop
 * card opens. The card closes when the player is done, when the train
 * leaves, or when the turn ends; computer players never get one. Loading
 * from the card, the dock or the map's icons goes through here, and each
 * answer is reported for the player.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { useTrainStopStore, wantedLabel } from '@/stores/trainStop'
import { useTrainsStore } from '@/stores/trains'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
import { useTownsStore } from '@/stores/towns'
import { useTrackStore } from '@/stores/track'
import { useDemandCardsStore } from '@/stores/demandCards'
import { pinSpeedUnit } from '../utils/boardScale'

// Towns along the equator, about 33 km apart: a Freight reaches the next two
const town = (name, lng, industries) => ({
  name,
  msa: name,
  lat: 0,
  lon: lng,
  size: 'small',
  industries: industries.map(([industryName, code]) => ({ name: industryName, industry: code }))
})
const towns = [
  town('West', 0, [['Coal', 2121]]),
  town('Middle', 0.3, []),
  town('East', 0.6, [
    ['Steel', 3311],
    ['Beef', 3116]
  ])
]
const at = (name) => {
  const t = towns.find((candidate) => candidate.name === name)
  return { lat: t.lat, lng: t.lon }
}

const ANN = 1
const BOT = 2

describe('train stop store', () => {
  let store
  let trainsStore
  let playerStore
  let demandCardsStore
  let restoreScale

  /** Plays one of Ann's actions as the dock would, then reports her arrival */
  function annPlaces(townId) {
    trainsStore.placeTrain(ANN, townId)
    store.arrive()
  }
  function annRuns(townId) {
    trainsStore.moveTrain(ANN, townId)
    store.arrive()
  }

  beforeEach(() => {
    restoreScale = pinSpeedUnit(10)
    localStorage.clear()
    store = useTrainStopStore()
    trainsStore = useTrainsStore()
    playerStore = usePlayerStore()
    demandCardsStore = useDemandCardsStore()

    useTownsStore().setTowns(towns)
    playerStore.addPlayer({ name: 'Ann', color: 'red', cash: 40000 })
    playerStore.addPlayer({ name: 'Robo', color: 'blue', cash: 40000, isBot: true })
    playerStore.startGame()
    // Past the two building rounds, so trains run
    useGameStore().setGameState({ turn: 2 })
    useTrackStore().addSegment({ ownerId: ANN, coordinates: ['West', 'Middle', 'East'].map(at) })
    demandCardsStore.setDeck({
      drawPile: [{ id: 9, demands: [] }],
      hands: {
        [ANN]: [
          {
            id: 1,
            demands: [
              { destination: 'West', industry: 'Steel', payoff: 12000 },
              { destination: 'Middle', industry: 'Beef', payoff: 8000 },
              { destination: 'Far', industry: 'Steel', payoff: 20000 }
            ]
          },
          { id: 2, demands: [] },
          { id: 3, demands: [] }
        ]
      }
    })
  })
  afterEach(() => restoreScale())

  describe('the stop card', () => {
    it('should open when the train is placed in a town that makes something', () => {
      annPlaces('East')

      expect(store.stopTown?.name).toBe('East')
    })

    it('should not open in a town with nothing for the train', () => {
      annPlaces('Middle')

      expect(store.stopTown).toBeNull()
    })

    it('should open in a town that makes nothing when a load can be delivered there', () => {
      annPlaces('East')
      store.pickUp('Beef')
      annRuns('Middle')

      expect(store.stopTown?.name).toBe('Middle')
      expect(store.deliveries.map(({ demand }) => demand.industry)).toEqual(['Beef'])
    })

    it('should close when the player is done', () => {
      annPlaces('East')

      store.closeStop()

      expect(store.stopTown).toBeNull()
    })

    it('should close when the train leaves the town', () => {
      annPlaces('East')

      trainsStore.moveTrain(ANN, 'Middle')

      expect(store.stopTown).toBeNull()
    })

    it('should not open for a full train in a town with nothing to deliver', () => {
      annPlaces('East')
      store.pickUp('Beef')
      store.pickUp('Beef')
      annRuns('West')

      // West makes Coal, but a Freight holds two loads, and West wants no Beef
      expect(store.stopTown).toBeNull()
    })
  })

  describe('what can be picked up', () => {
    it('should say which demands in the hand want each load, best paid first', () => {
      annPlaces('East')

      const steel = store.pickups.find((option) => option.industry === 'Steel')
      expect(steel.wantedIn).toEqual([
        { destination: 'Far', payoff: 20000 },
        { destination: 'West', payoff: 12000 }
      ])
      expect(steel.code).toBe(3311)
    })

    it('should offer nothing outside a town', () => {
      expect(store.loadingTown).toBeNull()
      expect(store.pickups).toEqual([])
    })
  })

  describe('wantedLabel', () => {
    it('should name the best-paid demand for a load, and count the rest', () => {
      expect(
        wantedLabel([
          { destination: 'Far', payoff: 20000 },
          { destination: 'West', payoff: 12000 }
        ])
      ).toBe('→ Far $20,000 (+1)')
      expect(wantedLabel([{ destination: 'West', payoff: 12000 }])).toBe('→ West $12,000')
    })

    it('should say nothing for a load no card wants', () => {
      expect(wantedLabel([])).toBe('')
    })
  })

  describe('loading', () => {
    it('should load and report it', () => {
      annPlaces('East')

      expect(store.pickUp('Steel').ok).toBe(true)

      expect(trainsStore.trainOf(ANN).loads).toEqual(['Steel'])
      expect(store.notice).toEqual({ text: 'Loaded Steel.', isError: false })
    })

    it('should report a refusal', () => {
      annPlaces('East')

      store.pickUp('Coal')

      expect(store.notice.isError).toBe(true)
    })
  })

  describe("a computer player's turn", () => {
    it('should offer no loading town, so the map has nothing to click', async () => {
      annPlaces('East')
      trainsStore.endTurn(ANN)
      playerStore.setActivePlayer(BOT)
      trainsStore.placeTrain(BOT, 'West')
      await nextTick()

      expect(store.loadingTown).toBeNull()
      store.arrive()
      expect(store.stopTown).toBeNull()
    })
  })
})
