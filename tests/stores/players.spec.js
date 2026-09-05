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

  describe('startGame', () => {
    it('should give the first player the turn', () => {
      playerStore.addPlayer({ name: 'Alice', color: 'red' })
      playerStore.addPlayer({ name: 'Bob', color: 'blue' })

      expect(playerStore.startGame()).toBe(true)

      expect(playerStore.players[0].isTurn).toBe(true)
      expect(playerStore.players[1].isTurn).toBe(false)
      expect(playerStore.activePlayer.name).toBe('Alice')
    })

    it('should clear any turn already assigned to another player', () => {
      playerStore.addPlayer({ name: 'Alice', color: 'red' })
      playerStore.addPlayer({ name: 'Bob', color: 'blue' })
      playerStore.players[1].isTurn = true

      playerStore.startGame()

      expect(playerStore.players.filter((p) => p.isTurn)).toHaveLength(1)
      expect(playerStore.activePlayer.name).toBe('Alice')
    })

    it('should fail when there are no players', () => {
      expect(playerStore.startGame()).toBe(false)
      expect(playerStore.error).toBe('No players in game')
    })
  })

  describe('setActivePlayer', () => {
    beforeEach(() => {
      playerStore.addPlayer({ name: 'Alice', color: 'red' })
      playerStore.addPlayer({ name: 'Bob', color: 'blue' })
      playerStore.addPlayer({ name: 'Charlie', color: 'green' })
    })

    it('should give the named player the turn', () => {
      expect(playerStore.setActivePlayer(2)).toBe(true)

      expect(playerStore.activePlayer.name).toBe('Bob')
    })

    it('should clear the turn from every other player', () => {
      playerStore.players[0].isTurn = true
      playerStore.players[2].isTurn = true

      playerStore.setActivePlayer(2)

      expect(playerStore.players.map((p) => p.isTurn)).toEqual([false, true, false])
    })

    it('should fail for an unknown player ID', () => {
      playerStore.startGame()

      expect(playerStore.setActivePlayer(99)).toBe(false)
      expect(playerStore.error).toBe('Player with ID 99 not found')
      expect(playerStore.activePlayer.name).toBe('Alice')
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

  describe('draft players', () => {
    it('should start with an empty draft roster', () => {
      expect(playerStore.draftPlayers).toEqual([])
    })

    it('should add drafts with unique ids and no validation', () => {
      const first = playerStore.addDraftPlayer({ color: '#FF5733' })
      const second = playerStore.addDraftPlayer({ name: 'Alice', color: '#80FF80' })

      expect(playerStore.draftPlayers).toHaveLength(2)
      expect(first.name).toBe('')
      expect(second.id).not.toBe(first.id)
    })

    it('should update a draft by id', () => {
      const draft = playerStore.addDraftPlayer({ color: '#FF5733' })

      expect(playerStore.updateDraftPlayer(draft.id, { name: 'Alice' })).toBe(true)
      expect(playerStore.draftPlayers[0].name).toBe('Alice')
      expect(playerStore.draftPlayers[0].color).toBe('#FF5733')
    })

    it('should reject updates to an unknown draft', () => {
      expect(playerStore.updateDraftPlayer(99, { name: 'Nobody' })).toBe(false)
    })

    it('should remove a draft by id without shifting the others', () => {
      const first = playerStore.addDraftPlayer({ name: 'Alice', color: '#FF5733' })
      const second = playerStore.addDraftPlayer({ name: 'Bob', color: '#80FF80' })

      expect(playerStore.removeDraftPlayer(first.id)).toBe(true)
      expect(playerStore.draftPlayers).toHaveLength(1)
      expect(playerStore.draftPlayers[0].id).toBe(second.id)

      // The surviving draft is still addressable by its original id
      expect(playerStore.updateDraftPlayer(second.id, { name: 'Bobby' })).toBe(true)
      expect(playerStore.draftPlayers[0].name).toBe('Bobby')
    })

    it('should report removing an unknown draft as a failure', () => {
      expect(playerStore.removeDraftPlayer(99)).toBe(false)
    })

    it('should commit drafts as players with starting cash', () => {
      playerStore.addDraftPlayer({ name: 'Alice', color: '#FF5733' })
      playerStore.addDraftPlayer({ name: '  Bob  ', color: '#80FF80' })

      expect(playerStore.commitDraftPlayers({ cash: 20000 })).toBe(true)
      expect(playerStore.players).toHaveLength(2)
      expect(playerStore.players[0]).toMatchObject({ id: 1, name: 'Alice', cash: 20000 })
      expect(playerStore.players[1]).toMatchObject({ id: 2, name: 'Bob', cash: 20000 })
    })

    it('should replace any players already in the game when committing', () => {
      playerStore.addPlayer({ name: 'Stale', color: 'red' })
      playerStore.addDraftPlayer({ name: 'Alice', color: '#FF5733' })

      playerStore.commitDraftPlayers({ cash: 20000 })

      expect(playerStore.players).toHaveLength(1)
      expect(playerStore.players[0].name).toBe('Alice')
    })

    it('should fail to commit a draft that is not a valid player', () => {
      playerStore.addDraftPlayer({ name: 'Alice', color: '#FF5733' })
      playerStore.addDraftPlayer({ name: '', color: '#80FF80' })

      expect(playerStore.commitDraftPlayers({ cash: 20000 })).toBe(false)
      expect(playerStore.error).toBeTruthy()
    })

    it('should leave the existing roster untouched when a commit fails', () => {
      playerStore.addPlayer({ name: 'Stale', color: 'red' })
      playerStore.addDraftPlayer({ name: '', color: '#80FF80' })

      expect(playerStore.commitDraftPlayers({ cash: 20000 })).toBe(false)
      expect(playerStore.players).toHaveLength(1)
      expect(playerStore.players[0].name).toBe('Stale')
    })

    it('should prune drafts left blank', () => {
      playerStore.addDraftPlayer({ name: 'Alice', color: '#FF5733' })
      playerStore.addDraftPlayer({ name: '', color: '#80FF80' })
      playerStore.addDraftPlayer({ name: '   ', color: '#8080FF' })

      expect(playerStore.pruneEmptyDraftPlayers()).toBe(2)
      expect(playerStore.draftPlayers).toHaveLength(1)
      expect(playerStore.draftPlayers[0].name).toBe('Alice')
    })

    it('should report pruning nothing when every draft is named', () => {
      playerStore.addDraftPlayer({ name: 'Alice', color: '#FF5733' })

      expect(playerStore.pruneEmptyDraftPlayers()).toBe(0)
      expect(playerStore.draftPlayers).toHaveLength(1)
    })

    it('should prune every draft when none are named', () => {
      playerStore.addDraftPlayer({ name: '', color: '#FF5733' })
      playerStore.addDraftPlayer({ name: ' ', color: '#80FF80' })

      expect(playerStore.pruneEmptyDraftPlayers()).toBe(2)
      expect(playerStore.draftPlayers).toEqual([])
    })

    it('should commit the remaining drafts after pruning blank ones', () => {
      playerStore.addDraftPlayer({ name: 'Alice', color: '#FF5733' })
      playerStore.addDraftPlayer({ name: '', color: '#80FF80' })

      playerStore.pruneEmptyDraftPlayers()

      expect(playerStore.commitDraftPlayers({ cash: 20000 })).toBe(true)
      expect(playerStore.players).toHaveLength(1)
      expect(playerStore.players[0].name).toBe('Alice')
    })

    it('should refuse to commit an empty roster', () => {
      playerStore.addPlayer({ name: 'Stale', color: 'red' })

      expect(playerStore.commitDraftPlayers({ cash: 20000 })).toBe(false)
      expect(playerStore.error).toBe('No players to start the game with')
      expect(playerStore.players).toHaveLength(1)
    })

    it('should reject drafts whose names differ only by case or spacing', () => {
      playerStore.addDraftPlayer({ name: 'Alice', color: '#FF5733' })
      playerStore.addDraftPlayer({ name: ' alice ', color: '#80FF80' })

      expect(playerStore.commitDraftPlayers({ cash: 20000 })).toBe(false)
      expect(playerStore.players).toEqual([])
    })

    it('should clear drafts on reset', () => {
      playerStore.addDraftPlayer({ name: 'Alice', color: '#FF5733' })

      playerStore.reset()

      expect(playerStore.draftPlayers).toEqual([])
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
