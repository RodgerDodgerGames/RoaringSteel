/**
 * Bot Tests
 *
 * Computer players playing real turns through the stores, on a made-up state
 * (see tests/utils/botBoard.js). The first thing a computer player must do
 * is play by the rules: every action it tries must be one the rules allow,
 * so none is ever refused, and the game must come out whole — nobody's cash
 * below zero, no train overloaded, every network in one piece.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
import { useGridStore } from '@/stores/grid'
import { useTownsStore } from '@/stores/towns'
import { useTrainsStore } from '@/stores/trains'
import { useTrackStore } from '@/stores/track'
import { useDemandCardsStore } from '@/stores/demandCards'
import { useTurn } from '@/composables/useTurn'
import { useBot } from '@/composables/bot/useBot'
import { pointKey } from '@/composables/network'
import { findCell } from '@/composables/map/cellGrid'
import { gameRules } from '@/config/game'
import { makeGrid, makeRegion, makeTowns, seededRandom, centerAt } from '../../utils/botBoard'

/**
 * Sets up a game on the test board.
 * @param {Array<{name: string, isBot: boolean}>} roster - The players, in turn order
 */
function setUpGame(roster) {
  useGameStore().setRegion(makeRegion())
  useGridStore().setGrid(makeGrid())
  useTownsStore().setTowns(makeTowns())
  const playerStore = usePlayerStore()
  const colors = ['red', 'blue', 'green', 'purple']
  roster.forEach((player, i) =>
    playerStore.addPlayer({ ...player, color: colors[i], cash: gameRules.startingCash })
  )
  playerStore.startGame()
  // The deck is shuffled with Math.random; a fixed sequence makes it the same every run
  vi.spyOn(Math, 'random').mockImplementation(seededRandom(7))
  useDemandCardsStore().generateDemandCards()
  useDemandCardsStore().dealHands(playerStore.players.map(({ id }) => id))
}

/**
 * Whether a player's own track is all one piece: every section joined to the
 * rest through a shared point.
 * @param {number} playerId - The player
 * @returns {boolean} True if it is (or they have none)
 */
function isOnePiece(playerId) {
  const sections = useTrackStore().segmentsForOwner(playerId)
  if (!sections.length) return true
  const reached = new Set(sections[0].coordinates.map(pointKey))
  const left = sections.slice(1)
  let grew = true
  while (grew) {
    grew = false
    for (let i = left.length - 1; i >= 0; i--) {
      const keys = left[i].coordinates.map(pointKey)
      if (keys.some((key) => reached.has(key))) {
        keys.forEach((key) => reached.add(key))
        left.splice(i, 1)
        grew = true
      }
    }
  }
  return left.length === 0
}

/** Checks the game is whole after a turn (see the module notes) */
function expectGameWhole() {
  const trains = useTrainsStore()
  usePlayerStore().players.forEach(({ id, cash }) => {
    expect(cash).toBeGreaterThanOrEqual(0)
    expect(trains.trainOf(id).loads.length).toBeLessThanOrEqual(trains.trainTypeOf(id).capacity)
    expect(isOnePiece(id)).toBe(true)
  })
}

describe('useBot', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    localStorage.clear()
  })

  describe('a game of computer players only', () => {
    // A lower bar to win by keeps the game short enough for a test; the
    // computer players play it exactly as they would the full one
    const fullCash = gameRules.victory.cash
    beforeEach(() => {
      gameRules.victory.cash = 120000
    })
    afterEach(() => {
      gameRules.victory.cash = fullCash
    })

    it('should be played to a win without the rules ever refusing a move', () => {
      setUpGame([
        { name: 'Bot 1', isBot: true },
        { name: 'Bot 2', isBot: true },
        { name: 'Bot 3', isBot: true }
      ])
      const gameStore = useGameStore()
      const playerStore = usePlayerStore()
      const { playTurn } = useBot()
      const { endTurn } = useTurn()
      const refused = []
      const delivered = new Set()
      let slowest = 0

      for (let turn = 0; turn < 600 && !gameStore.isOver; turn++) {
        const player = playerStore.activePlayer
        const started = performance.now()
        const report = playTurn(player.id)
        slowest = Math.max(slowest, performance.now() - started)

        refused.push(...report.errors)
        report.events
          .filter(({ type }) => type === 'deliver')
          .forEach(() => delivered.add(player.id))
        expectGameWhole()
        if (!report.endedTurn && !gameStore.isOver) endTurn()
      }

      expect(refused).toEqual([])
      expect(gameStore.winnerId).not.toBeNull()
      // Every computer player got its business going, not just the winner
      expect(delivered.size).toBe(3)
      // Nobody ever built into the town outside the region
      const kauri = makeTowns().find(({ name }) => name === 'Kauri')
      const kauriCell = findCell({ lat: kauri.lat, lng: kauri.lon }, useGridStore().grid)
      useTrackStore().segments.forEach(({ coordinates }) =>
        coordinates.forEach((point) =>
          expect(findCell(point, useGridStore().grid)).not.toBe(kauriCell)
        )
      )
      // Quick enough that people are not left waiting on a computer player
      expect(slowest).toBeLessThan(1000)
    }, 60000)
  })

  describe('alongside a person', () => {
    beforeEach(() => {
      setUpGame([
        { name: 'Ann', isBot: false },
        { name: 'Bot 1', isBot: true },
        { name: 'Bot 2', isBot: true }
      ])
    })

    it("should do nothing on someone else's turn", () => {
      const { playTurn } = useBot()

      // Ann has the turn
      const report = playTurn(2)

      expect(report.events).toEqual([])
      expect(useTrackStore().segments).toEqual([])
    })

    it('should keep to its own track, never paying anyone to use theirs', () => {
      const gameStore = useGameStore()
      const playerStore = usePlayerStore()
      const { playTurn } = useBot()
      const { endTurn } = useTurn()
      const ann = playerStore.players[0]

      // Ann just passes; the computer players play for a good while
      for (let turn = 0; turn < 90 && !gameStore.isOver; turn++) {
        const player = playerStore.activePlayer
        if (player.isBot) {
          expect(playTurn(player.id).errors).toEqual([])
          expectGameWhole()
        }
        if (!gameStore.isOver) endTurn()
      }

      // Nobody paid Ann a fee, and the bots never paid each other either
      expect(ann.cash).toBe(gameRules.startingCash)
    })
  })

  describe('throwing in the hand', () => {
    beforeEach(() => {
      setUpGame([{ name: 'Bot 1', isBot: true }])
      // Every demand wants something in Kauri, where no track can go
      const hopeless = (id) => ({
        id,
        demands: [
          { destination: 'Kauri', industry: 'Coal', payoff: 9000 },
          { destination: 'Kauri', industry: 'Wheat', payoff: 9000 },
          { destination: 'Kauri', industry: 'Oil', payoff: 9000 }
        ]
      })
      useDemandCardsStore().setDeck({
        drawPile: Array.from({ length: 6 }, (_, i) => hopeless(100 + i)),
        hands: { 1: [hopeless(1), hopeless(2), hopeless(3)] }
      })
    })

    it('should throw in a hand no demand of which can be worked toward', () => {
      // Past the building rounds
      useGameStore().setGameState({ turn: gameRules.buildingRounds })

      const report = useBot().playTurn(1)

      expect(report).toMatchObject({ endedTurn: true, errors: [] })
      expect(report.events).toEqual([{ type: 'discard' }])
      expect(
        useDemandCardsStore()
          .handOf(1)
          .map(({ id }) => id)
      ).not.toContain(1)
    })

    it('should not throw in its hand in a building round', () => {
      const report = useBot().playTurn(1)

      expect(report).toMatchObject({ endedTurn: false, errors: [] })
      // With nothing worth building toward, it builds nothing
      expect(useTrackStore().segments).toEqual([])
    })

    it('should build before placing a train it has no track to run on', () => {
      useGameStore().setGameState({ turn: gameRules.buildingRounds })
      // One demand it can afford, though it built nothing in the opening rounds
      useDemandCardsStore().setDeck({
        drawPile: [],
        hands: {
          1: [{ id: 9, demands: [{ destination: 'Birch', industry: 'Coal', payoff: 9000 }] }]
        }
      })

      const report = useBot().playTurn(1)

      expect(report).toMatchObject({ endedTurn: false, errors: [] })
      expect(useTrainsStore().trainOf(1).position).toBeNull()
      expect(useTrackStore().segmentsForOwner(1).length).toBeGreaterThan(0)
    })
  })

  describe('with the cash to win', () => {
    beforeEach(() => {
      setUpGame([{ name: 'Bot 1', isBot: true }])
      useGameStore().setGameState({ turn: gameRules.buildingRounds })
      // A short line out of Alder: one major city joined, three still needed
      const alder = makeTowns().find(({ name }) => name === 'Alder')
      useTrackStore().addSegment({
        ownerId: 1,
        coordinates: [{ lat: alder.lat, lng: alder.lon }, centerAt(3, 3)],
        cost: 0
      })
    })

    it('should not spend itself below the cash it needs to win', () => {
      usePlayerStore().updatePlayer(1, { cash: gameRules.victory.cash + 5000 })

      const report = useBot().playTurn(1)

      expect(report.errors).toEqual([])
      expect(report.events.some(({ type }) => type === 'build')).toBe(true)
      expect(usePlayerStore().players[0].cash).toBeGreaterThanOrEqual(gameRules.victory.cash)
    })

    it('should build toward the cities rather than throw in a hopeless hand', () => {
      usePlayerStore().updatePlayer(1, { cash: gameRules.victory.cash + 20000 })
      const hopeless = {
        id: 1,
        demands: [{ destination: 'Kauri', industry: 'Coal', payoff: 9000 }]
      }
      useDemandCardsStore().setDeck({ drawPile: [], hands: { 1: [hopeless] } })

      const report = useBot().playTurn(1)

      expect(report).toMatchObject({ endedTurn: false, errors: [] })
      const builds = report.events.filter(({ type }) => type === 'build')
      expect(builds.length).toBeGreaterThan(0)
      const cities = makeTowns()
        .filter(({ size }) => size === 'large')
        .map(({ name }) => name)
      builds.forEach(({ toward }) => expect(cities).toContain(toward))
    })
  })
})
