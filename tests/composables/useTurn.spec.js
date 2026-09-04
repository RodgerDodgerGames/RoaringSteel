/**
 * Turn Composable Tests
 *
 * Tests for ending a turn, including:
 * - Passing play to the next player
 * - Advancing the game turn only on wrap-around
 * - Auto-saving after each turn
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTurn } from '@/composables/useTurn'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'

// autoSave is stubbed so these tests exercise turn logic, not persistence
const { autoSave } = vi.hoisted(() => ({ autoSave: vi.fn(() => true) }))

vi.mock('@/composables/useGamePersistence', () => ({
  useGamePersistence: () => ({ autoSave })
}))

describe('useTurn', () => {
  let playerStore
  let gameStore

  beforeEach(() => {
    autoSave.mockClear()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    playerStore = usePlayerStore()
    gameStore = useGameStore()
  })

  /** Adds n players and gives the first one the turn. */
  function seedPlayers(names = ['Alice', 'Bob', 'Charlie']) {
    const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange']
    names.forEach((name, i) => playerStore.addPlayer({ name, color: colors[i] }))
    playerStore.startGame()
  }

  describe('endTurn', () => {
    it('should pass play to the next player', () => {
      seedPlayers()
      const { endTurn } = useTurn()

      expect(endTurn()).toBe(true)

      expect(playerStore.activePlayer.name).toBe('Bob')
    })

    it('should not advance the game turn mid-round', () => {
      seedPlayers()
      const { endTurn } = useTurn()

      endTurn()

      expect(gameStore.turn).toBe(0)
    })

    it('should advance the game turn when the last player ends their turn', () => {
      seedPlayers()
      const { endTurn } = useTurn()

      endTurn() // Alice -> Bob
      endTurn() // Bob -> Charlie

      expect(gameStore.turn).toBe(0)

      endTurn() // Charlie -> Alice, round complete

      expect(playerStore.activePlayer.name).toBe('Alice')
      expect(gameStore.turn).toBe(1)
    })

    it('should advance the game turn once per full round', () => {
      seedPlayers()
      const { endTurn } = useTurn()

      // Three full rounds of three players
      for (let i = 0; i < 9; i++) {
        endTurn()
      }

      expect(gameStore.turn).toBe(3)
      expect(playerStore.activePlayer.name).toBe('Alice')
    })

    it('should advance the game turn on every end turn in a solo game', () => {
      seedPlayers(['Alice'])
      const { endTurn } = useTurn()

      endTurn()

      expect(playerStore.activePlayer.name).toBe('Alice')
      expect(gameStore.turn).toBe(1)
    })

    it('should give the first player the turn without advancing when nobody is active', () => {
      // Players exist but startGame was never called
      playerStore.addPlayer({ name: 'Alice', color: 'red' })
      playerStore.addPlayer({ name: 'Bob', color: 'blue' })
      const { endTurn } = useTurn()

      expect(endTurn()).toBe(true)

      expect(playerStore.activePlayer.name).toBe('Alice')
      expect(gameStore.turn).toBe(0)
    })

    it('should return false when there are no players', () => {
      const { endTurn } = useTurn()

      expect(endTurn()).toBe(false)
      expect(gameStore.turn).toBe(0)
    })

    it('should auto-save after each turn', () => {
      seedPlayers()
      const { endTurn } = useTurn()

      endTurn()
      endTurn()

      expect(autoSave).toHaveBeenCalledTimes(2)
    })

    it('should not auto-save when the turn could not be ended', () => {
      const { endTurn } = useTurn()

      endTurn()

      expect(autoSave).not.toHaveBeenCalled()
    })
  })
})
