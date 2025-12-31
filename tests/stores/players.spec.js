/**
 * Player Store Tests
 *
 * Tests for the player management store including:
 * - Adding/removing players
 * - Updating player data
 * - Turn management
 * - Active player computation
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { usePlayerStore } from '@/stores/players'

describe('Player Store', () => {
  let playerStore

  beforeEach(() => {
    playerStore = usePlayerStore()
  })

  describe('Initial State', () => {
    it('should start with an empty players array', () => {
      expect(playerStore.players).toEqual([])
    })

    it('should have no active player initially', () => {
      expect(playerStore.activePlayer).toBeUndefined()
    })
  })

  describe('addPlayer', () => {
    it('should add a player with default values', () => {
      playerStore.addPlayer({ name: 'Alice', color: 'red' })

      expect(playerStore.players).toHaveLength(1)
      expect(playerStore.players[0]).toMatchObject({
        id: 1,
        name: 'Alice',
        color: 'red',
        cash: 0,
        isTurn: false,
        position: 0
      })
    })

    it('should add a player with custom cash value', () => {
      playerStore.addPlayer({ name: 'Bob', color: 'blue', cash: 5000 })

      expect(playerStore.players[0].cash).toBe(5000)
    })

    it('should assign sequential IDs to players', () => {
      playerStore.addPlayer({ name: 'Alice', color: 'red' })
      playerStore.addPlayer({ name: 'Bob', color: 'blue' })
      playerStore.addPlayer({ name: 'Charlie', color: 'green' })

      expect(playerStore.players.map((p) => p.id)).toEqual([1, 2, 3])
    })

    it('should add multiple players correctly', () => {
      playerStore.addPlayer({ name: 'Alice', color: 'red' })
      playerStore.addPlayer({ name: 'Bob', color: 'blue' })

      expect(playerStore.players).toHaveLength(2)
      expect(playerStore.players[0].name).toBe('Alice')
      expect(playerStore.players[1].name).toBe('Bob')
    })
  })

  describe('updatePlayer', () => {
    beforeEach(() => {
      playerStore.addPlayer({ name: 'Alice', color: 'red' })
    })

    it('should update player cash', () => {
      playerStore.updatePlayer(1, { cash: 1000 })

      expect(playerStore.players[0].cash).toBe(1000)
    })

    it('should update player name', () => {
      playerStore.updatePlayer(1, { name: 'Alice Smith' })

      expect(playerStore.players[0].name).toBe('Alice Smith')
    })

    it('should update multiple properties at once', () => {
      playerStore.updatePlayer(1, { cash: 2500, position: 5 })

      expect(playerStore.players[0].cash).toBe(2500)
      expect(playerStore.players[0].position).toBe(5)
    })

    it('should not affect other players when updating one', () => {
      playerStore.addPlayer({ name: 'Bob', color: 'blue' })
      playerStore.updatePlayer(1, { cash: 9999 })

      expect(playerStore.players[0].cash).toBe(9999)
      expect(playerStore.players[1].cash).toBe(0)
    })

    it('should do nothing when player ID does not exist', () => {
      const originalPlayers = [...playerStore.players]
      playerStore.updatePlayer(999, { cash: 1000 })

      expect(playerStore.players).toEqual(originalPlayers)
    })
  })

  describe('removePlayer', () => {
    beforeEach(() => {
      playerStore.addPlayer({ name: 'Alice', color: 'red' })
      playerStore.addPlayer({ name: 'Bob', color: 'blue' })
      playerStore.addPlayer({ name: 'Charlie', color: 'green' })
    })

    it('should remove a player by ID', () => {
      playerStore.removePlayer(2)

      expect(playerStore.players).toHaveLength(2)
      expect(playerStore.players.find((p) => p.name === 'Bob')).toBeUndefined()
    })

    it('should keep other players intact', () => {
      playerStore.removePlayer(2)

      expect(playerStore.players[0].name).toBe('Alice')
      expect(playerStore.players[1].name).toBe('Charlie')
    })

    it('should do nothing when player ID does not exist', () => {
      playerStore.removePlayer(999)

      expect(playerStore.players).toHaveLength(3)
    })
  })

  describe('nextTurn', () => {
    beforeEach(() => {
      playerStore.addPlayer({ name: 'Alice', color: 'red' })
      playerStore.addPlayer({ name: 'Bob', color: 'blue' })
      playerStore.addPlayer({ name: 'Charlie', color: 'green' })
      // Set first player's turn
      playerStore.players[0].isTurn = true
    })

    it('should advance turn to the next player', () => {
      playerStore.nextTurn()

      expect(playerStore.players[0].isTurn).toBe(false)
      expect(playerStore.players[1].isTurn).toBe(true)
    })

    it('should wrap around to the first player', () => {
      // Move to last player
      playerStore.players[0].isTurn = false
      playerStore.players[2].isTurn = true

      playerStore.nextTurn()

      expect(playerStore.players[2].isTurn).toBe(false)
      expect(playerStore.players[0].isTurn).toBe(true)
    })

    it('should cycle through all players correctly', () => {
      const turnOrder = []

      for (let i = 0; i < 6; i++) {
        const activeIdx = playerStore.players.findIndex((p) => p.isTurn)
        turnOrder.push(activeIdx)
        playerStore.nextTurn()
      }

      // Should cycle: 0 -> 1 -> 2 -> 0 -> 1 -> 2
      expect(turnOrder).toEqual([0, 1, 2, 0, 1, 2])
    })
  })

  describe('activePlayer getter', () => {
    beforeEach(() => {
      playerStore.addPlayer({ name: 'Alice', color: 'red' })
      playerStore.addPlayer({ name: 'Bob', color: 'blue' })
    })

    it('should return undefined when no player has turn', () => {
      expect(playerStore.activePlayer).toBeUndefined()
    })

    it('should return the player whose turn it is', () => {
      playerStore.players[1].isTurn = true

      expect(playerStore.activePlayer.name).toBe('Bob')
    })

    it('should update when turn changes', () => {
      playerStore.players[0].isTurn = true

      expect(playerStore.activePlayer.name).toBe('Alice')

      playerStore.nextTurn()

      expect(playerStore.activePlayer.name).toBe('Bob')
    })
  })
})
