/**
 * History Store Tests
 *
 * The turn history as it is kept: what a player does recorded as they do
 * it, then closed into the history with the track that stayed built and
 * whether the turn won; computer players' problems marked; and the history
 * restored from a save, whatever the save holds.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useHistoryStore } from '@/stores/history'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
import { useTownsStore } from '@/stores/towns'
import { useTrackStore } from '@/stores/track'

const ANN = 1
const BO = 2

// Towns along the equator, a degree apart
const towns = ['West', 'Middle', 'East'].map((name, i) => ({ name, msa: name, lat: 0, lon: i }))
const at = (name) => ({ lat: 0, lng: towns.findIndex((t) => t.name === name) })

describe('history store', () => {
  let store
  let playerStore
  let gameStore
  let trackStore

  /** Lays a section of track for a player through the named towns, this round */
  function lay(ownerId, cost, ...names) {
    return trackStore.addSegment({
      ownerId,
      coordinates: names.map(at),
      cost,
      turn: gameStore.turn
    })
  }

  beforeEach(() => {
    store = useHistoryStore()
    playerStore = usePlayerStore()
    gameStore = useGameStore()
    trackStore = useTrackStore()

    useTownsStore().setTowns(towns)
    playerStore.addPlayer({ name: 'Ann', color: 'red', cash: 40000 })
    playerStore.addPlayer({ name: 'Bo', color: 'blue', cash: 40000 })
    playerStore.startGame()
    gameStore.setGameState({ turn: 3 })
  })

  describe('closeTurn', () => {
    it("should close the active player's turn, with what they did, into the history", () => {
      store.record(ANN, { type: 'place', town: 'West' })

      store.closeTurn(ANN)

      expect(store.turns).toEqual([
        {
          round: 3,
          playerId: ANN,
          events: [{ type: 'place', town: 'West' }],
          won: false,
          hadProblem: false
        }
      ])
      expect(store.current).toBeNull()
    })

    it('should close a turn in which the player did nothing', () => {
      store.closeTurn(ANN)

      expect(store.turns).toMatchObject([{ playerId: ANN, round: 3, events: [] }])
    })

    it('should add the track built this turn, after the train', () => {
      lay(ANN, 2000, 'West', 'Middle')
      store.record(ANN, { type: 'place', town: 'West' })

      store.closeTurn(ANN)

      expect(store.turns[0].events).toEqual([
        { type: 'place', town: 'West' },
        { type: 'build', cost: 2000, reached: ['West', 'Middle'] }
      ])
    })

    it('should leave out track torn up again before the turn ended', () => {
      lay(ANN, 2000, 'West', 'Middle')
      const tornUp = lay(ANN, 3000, 'Middle', 'East')
      trackStore.removeSegment(tornUp.id)

      store.closeTurn(ANN)

      expect(store.turns[0].events).toEqual([
        { type: 'build', cost: 2000, reached: ['West', 'Middle'] }
      ])
    })

    it("should leave out track from other turns, and other players' track", () => {
      trackStore.addSegment({ ownerId: ANN, coordinates: [at('West'), at('Middle')], turn: 1 })
      lay(BO, 3000, 'Middle', 'East')

      store.closeTurn(ANN)

      expect(store.turns[0].events).toEqual([])
    })

    it('should leave a turn already closed as it is', () => {
      lay(ANN, 2000, 'West', 'Middle')
      store.closeTurn(ANN)

      store.closeTurn(ANN)

      expect(store.turns).toHaveLength(1)
      expect(store.turns[0].events).toHaveLength(1)
    })

    it('should mark a turn that won the game', () => {
      gameStore.declareWinner(ANN)

      store.closeTurn(ANN)

      expect(store.turns[0].won).toBe(true)
    })
  })

  describe('record', () => {
    it("should not carry one player's unclosed turn into the next player's", () => {
      store.record(ANN, { type: 'place', town: 'West' })

      store.record(BO, { type: 'place', town: 'East' })

      expect(store.current).toMatchObject({
        playerId: BO,
        events: [{ type: 'place', town: 'East' }]
      })
    })
  })

  describe('flagProblem', () => {
    it('should mark the turn in progress', () => {
      store.flagProblem(ANN, 3)
      store.closeTurn(ANN)

      expect(store.turns[0].hadProblem).toBe(true)
    })

    it('should mark a turn already closed, not start one for whoever plays next', () => {
      // Throwing in the hand, or winning, closes the turn before it is flagged
      store.closeTurn(ANN)
      playerStore.setActivePlayer(BO)

      store.flagProblem(ANN, 3)

      expect(store.turns[0].hadProblem).toBe(true)
      expect(store.current).toBeNull()
    })
  })

  describe('setHistory and reset', () => {
    const saved = {
      turns: [
        { round: 2, playerId: BO, events: [{ type: 'discard' }], won: false, hadProblem: false }
      ],
      current: { round: 3, playerId: ANN, events: [{ type: 'place', town: 'West' }] }
    }

    it('should restore the history and the turn in progress', () => {
      store.setHistory(saved)

      expect(store.turns).toEqual(saved.turns)
      expect(store.current).toEqual(saved.current)
    })

    it('should start an empty history for a save without one', () => {
      store.setHistory(saved)

      store.setHistory(undefined)

      expect(store.turns).toEqual([])
      expect(store.current).toBeNull()
    })

    it('should drop turns a save holds that are not turns', () => {
      store.setHistory({
        turns: [null, 'a turn', { round: 1, events: [] }, ...saved.turns],
        current: { playerId: ANN }
      })

      expect(store.turns).toEqual(saved.turns)
      expect(store.current).toBeNull()
    })

    it('should drop events a save holds that cannot be put into words', () => {
      store.setHistory({
        turns: [
          {
            round: 1,
            playerId: ANN,
            events: [
              { type: 'build', cost: 5000 },
              { type: 'move', town: 'East', paid: 'Bo' },
              7,
              { type: 'pickup', industry: 'Coal', town: 'West' }
            ]
          }
        ]
      })

      expect(store.turns[0].events).toEqual([{ type: 'pickup', industry: 'Coal', town: 'West' }])
    })

    it('should forget everything on reset', () => {
      store.setHistory(saved)

      store.reset()

      expect(store.turns).toEqual([])
      expect(store.current).toBeNull()
    })
  })
})
