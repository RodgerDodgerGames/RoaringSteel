/**
 * Player Store Tests
 *
 * Tests for the player management store including:
 * - Adding/removing players
 * - Updating player data
 * - Turn management
 * - Active player computation
 * - Spending, refunds, and the per-turn build allowance
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { usePlayerStore } from '@/stores/players'
import { gameRules } from '@/config/game'
import { playerColors } from '@/config/playerColors'

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

    it('should reject a color another player already has, whatever its case', () => {
      playerStore.addPlayer({ name: 'Alice', color: '#E8504A' })

      expect(playerStore.addPlayer({ name: 'Bob', color: '#e8504a' })).toBe(false)
      expect(playerStore.error).toBe('Alice already has that color')
      expect(playerStore.players).toHaveLength(1)
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

    it('should refuse a color another player already has', () => {
      playerStore.addPlayer({ name: 'Bob', color: 'blue' })

      expect(playerStore.updatePlayer(2, { color: 'RED' })).toBe(false)
      expect(playerStore.error).toBe('Alice already has that color')
      expect(playerStore.players[1].color).toBe('blue')
    })

    it('should let a player keep their own color', () => {
      expect(playerStore.updatePlayer(1, { color: 'red', cash: 50 })).toBe(true)
      expect(playerStore.players[0].cash).toBe(50)
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

    it('should refuse a draft whose color another draft has, whatever its case', () => {
      playerStore.addDraftPlayer({ name: 'Alice', color: '#FF5733' })

      expect(playerStore.addDraftPlayer({ name: 'Bob', color: '#ff5733' })).toBeNull()
      expect(playerStore.draftPlayers).toHaveLength(1)
    })

    it("should refuse to change a draft's color to one another draft has", () => {
      playerStore.addDraftPlayer({ name: 'Alice', color: '#FF5733' })
      const bob = playerStore.addDraftPlayer({ name: 'Bob', color: '#80FF80' })

      expect(playerStore.updateDraftPlayer(bob.id, { name: 'Bobby', color: '#FF5733' })).toBe(false)
      // Nothing changes, not even the name sent along with the color
      expect(playerStore.draftPlayers[1]).toMatchObject({ name: 'Bob', color: '#80FF80' })
    })

    it('should let a draft move to a free color or keep its own', () => {
      const alice = playerStore.addDraftPlayer({ name: 'Alice', color: '#FF5733' })

      expect(playerStore.updateDraftPlayer(alice.id, { color: '#FF5733' })).toBe(true)
      expect(playerStore.updateDraftPlayer(alice.id, { color: '#8080FF' })).toBe(true)
      expect(playerStore.draftPlayers[0].color).toBe('#8080FF')
    })

    it('should give a draft with no color the first palette color', () => {
      const draft = playerStore.addDraftPlayer({ name: 'Alice' })

      expect(draft.color).toBe(playerColors[0])
    })

    it('should skip palette colors other drafts already have', () => {
      playerStore.addDraftPlayer({ color: playerColors[0] })
      playerStore.addDraftPlayer({ color: playerColors[2] })

      expect(playerStore.addDraftPlayer().color).toBe(playerColors[1])
      expect(playerStore.addDraftPlayer().color).toBe(playerColors[3])
    })

    it('should reuse a color once the draft holding it is removed', () => {
      const first = playerStore.addDraftPlayer()
      playerStore.addDraftPlayer()

      playerStore.removeDraftPlayer(first.id)

      expect(playerStore.addDraftPlayer().color).toBe(playerColors[0])
    })

    it('should add no draft once every palette color is taken', () => {
      playerColors.forEach(() => playerStore.addDraftPlayer())

      expect(playerStore.addDraftPlayer()).toBeNull()
      expect(playerStore.draftPlayers).toHaveLength(playerColors.length)
    })

    it("should list a row's picker colors as its own, taken by another row, or free", () => {
      // Alice's color is stored in lower case, to show case is ignored
      const alice = playerStore.addDraftPlayer({
        name: 'Alice',
        color: playerColors[0].toLowerCase()
      })
      const bob = playerStore.addDraftPlayer({ name: 'Bob', color: playerColors[1] })

      const bobsPicker = playerStore.draftColorOptions(bob.id)
      expect(bobsPicker.map((option) => option.color)).toEqual(playerColors)
      // Alice's color is taken, and by Alice
      expect(bobsPicker[0]).toMatchObject({ isSelected: false, holder: { name: 'Alice' } })
      // Bob's own color is selected, not taken
      expect(bobsPicker[1]).toMatchObject({ isSelected: true, holder: null })
      // Nobody has the rest
      expect(bobsPicker[2]).toMatchObject({ isSelected: false, holder: null })

      // From Alice's side, her own color is selected despite the case difference
      expect(playerStore.draftColorOptions(alice.id)[0]).toMatchObject({
        isSelected: true,
        holder: null
      })
    })

    it('should clear drafts on reset', () => {
      playerStore.addDraftPlayer({ name: 'Alice', color: '#FF5733' })

      playerStore.reset()

      expect(playerStore.draftPlayers).toEqual([])
    })

    it('should clear the computer players asked for on reset', () => {
      playerStore.setDraftBotCount(2)

      playerStore.reset()

      expect(playerStore.draftBotCount).toBe(0)
    })
  })

  describe('computer players', () => {
    it('should put computer players after the people, named and colored for them', () => {
      playerStore.addDraftPlayer({ name: 'Alice', color: playerColors[1] })
      playerStore.setDraftBotCount(2)

      expect(playerStore.draftRoster).toEqual([
        { name: 'Alice', color: playerColors[1], isBot: false },
        // The first colors nobody has: Alice holds the second
        { name: 'Bot 1', color: playerColors[0], isBot: true },
        { name: 'Bot 2', color: playerColors[2], isBot: true }
      ])
    })

    it("should not give a computer player a person's name", () => {
      playerStore.addDraftPlayer({ name: 'bot 1' })
      playerStore.setDraftBotCount(1)

      expect(playerStore.draftRoster.at(-1).name).toBe('Bot 2')
    })

    it('should keep the count between none and the colors left', () => {
      playerStore.addDraftPlayer({ name: 'Alice' })

      expect(playerStore.setDraftBotCount(-3)).toBe(0)
      expect(playerStore.setDraftBotCount(99)).toBe(playerColors.length - 1)
      expect(playerStore.setDraftBotCount(2.7)).toBe(2)
    })

    it('should not add a person when the computer players need every color left', () => {
      playerStore.addDraftPlayer({ name: 'Alice' })
      playerStore.setDraftBotCount(playerColors.length - 1)

      expect(playerStore.addDraftPlayer({ name: 'Bob' })).toBeNull()
      expect(playerStore.draftPlayers).toHaveLength(1)
    })

    it('should start a game of people and computer players', () => {
      playerStore.addDraftPlayer({ name: 'Alice', color: 'red' })
      playerStore.setDraftBotCount(1)

      expect(playerStore.commitDraftPlayers({ cash: 40000 })).toBe(true)
      expect(playerStore.players.map(({ name, isBot, cash }) => ({ name, isBot, cash }))).toEqual([
        { name: 'Alice', isBot: false, cash: 40000 },
        { name: 'Bot 1', isBot: true, cash: 40000 }
      ])
    })

    it('should start a game of computer players only', () => {
      playerStore.setDraftBotCount(3)

      expect(playerStore.commitDraftPlayers({ cash: 40000 })).toBe(true)
      expect(playerStore.players.every(({ isBot }) => isBot)).toBe(true)
      expect(playerStore.players).toHaveLength(3)
    })

    it('should keep who is a computer player when a game is restored', () => {
      playerStore.setPlayers([
        { id: 1, name: 'Alice', color: 'red', cash: 0, isTurn: true },
        { id: 2, name: 'Bot 1', color: 'blue', cash: 0, isTurn: false, isBot: true }
      ])

      // A save from before computer players has only people
      expect(playerStore.players.map(({ isBot }) => isBot)).toEqual([false, true])
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

      playerStore.setActivePlayer(2)

      expect(playerStore.activePlayer.name).toBe('Bob')
    })
  })

  describe('colorOf', () => {
    beforeEach(() => {
      playerStore.addPlayer({ name: 'Alice', color: '#FFC080' })
      playerStore.addPlayer({ name: 'Bob', color: '#80FF80' })
    })

    it("should give each player's own color, so their track is told apart", () => {
      const [alice, bob] = playerStore.players

      expect(playerStore.colorOf(alice.id)).toBe('#FFC080')
      expect(playerStore.colorOf(bob.id)).toBe('#80FF80')
    })

    it('should give null for a player who is not in the game', () => {
      expect(playerStore.colorOf(999)).toBeNull()
      expect(playerStore.colorOf(undefined)).toBeNull()
    })
  })

  describe('money', () => {
    beforeEach(() => {
      playerStore.addPlayer({ name: 'Alice', color: 'red', cash: gameRules.startingCash })
      playerStore.addPlayer({ name: 'Bob', color: 'blue', cash: gameRules.startingCash })
      playerStore.startGame()
    })

    describe('spendCash', () => {
      it('should take the amount off the player', () => {
        expect(playerStore.spendCash(1, 5000)).toBe(true)

        expect(playerStore.players[0].cash).toBe(gameRules.startingCash - 5000)
      })

      it('should let a player spend down to exactly zero', () => {
        expect(playerStore.spendCash(1, gameRules.startingCash)).toBe(true)

        expect(playerStore.players[0].cash).toBe(0)
      })

      it('should refuse to take a player below zero', () => {
        expect(playerStore.spendCash(1, gameRules.startingCash + 1)).toBe(false)

        // Refused, not clamped: a partial charge would hand over the goods anyway
        expect(playerStore.players[0].cash).toBe(gameRules.startingCash)
        expect(playerStore.error).toContain('cannot spend')
      })

      it('should not touch other players', () => {
        playerStore.spendCash(1, 5000)

        expect(playerStore.players[1].cash).toBe(gameRules.startingCash)
      })

      it('should reject an unknown player', () => {
        expect(playerStore.spendCash(999, 100)).toBe(false)
      })

      it('should reject a negative amount', () => {
        expect(playerStore.spendCash(1, -100)).toBe(false)

        // Otherwise "spending" a negative would be a way to print money
        expect(playerStore.players[0].cash).toBe(gameRules.startingCash)
      })

      it('should reject an amount that is not a number', () => {
        expect(playerStore.spendCash(1, NaN)).toBe(false)
        expect(playerStore.spendCash(1, undefined)).toBe(false)

        expect(playerStore.players[0].cash).toBe(gameRules.startingCash)
      })
    })

    describe('hasSpentThisTurn', () => {
      it('should be false at the start of a turn', () => {
        expect(playerStore.hasSpentThisTurn(1)).toBe(false)
      })

      it('should stay true after the spend is refunded', () => {
        playerStore.spendOnTrack(1, 1000)
        playerStore.refundTrackSpend(1, 1000)

        expect(playerStore.hasSpentThisTurn(1)).toBe(true)
      })

      it('should be cleared as the turn ends', () => {
        playerStore.spendOnTrack(1, 1000)

        playerStore.resetTrackSpend(1)

        expect(playerStore.hasSpentThisTurn(1)).toBe(false)
      })

      it('should be true for a player saved mid-build before the flag existed', () => {
        playerStore.setPlayers([{ id: 1, name: 'Alice', cash: 100, trackSpentThisTurn: 500 }])

        expect(playerStore.hasSpentThisTurn(1)).toBe(true)
      })
    })

    describe('earnCash', () => {
      it('should add the amount to the player', () => {
        expect(playerStore.earnCash(1, 9000)).toBe(true)

        expect(playerStore.players[0].cash).toBe(gameRules.startingCash + 9000)
      })

      it('should reject a negative amount', () => {
        expect(playerStore.earnCash(1, -100)).toBe(false)

        expect(playerStore.players[0].cash).toBe(gameRules.startingCash)
      })

      it('should reject an unknown player', () => {
        expect(playerStore.earnCash(999, 100)).toBe(false)
      })
    })

    describe('spendOnTrack', () => {
      it('should charge the player and record it against the turn', () => {
        expect(playerStore.spendOnTrack(1, 5000)).toBe(true)

        expect(playerStore.players[0].cash).toBe(gameRules.startingCash - 5000)
        expect(playerStore.players[0].trackSpentThisTurn).toBe(5000)
      })

      it('should accumulate across several sections in one turn', () => {
        playerStore.spendOnTrack(1, 5000)
        playerStore.spendOnTrack(1, 3000)

        expect(playerStore.players[0].trackSpentThisTurn).toBe(8000)
        expect(playerStore.players[0].cash).toBe(gameRules.startingCash - 8000)
      })

      it('should refuse a section that exceeds the turn budget', () => {
        playerStore.updatePlayer(1, { cash: 100000 })
        playerStore.spendOnTrack(1, gameRules.trackBudgetPerTurn)

        // Cash is not the limit here — the turn's allowance is
        expect(playerStore.spendOnTrack(1, 1)).toBe(false)
        expect(playerStore.players[0].cash).toBe(100000 - gameRules.trackBudgetPerTurn)
        expect(playerStore.error).toContain('left to build with this turn')
      })

      it('should refuse a section the player cannot pay for', () => {
        playerStore.updatePlayer(1, { cash: 500 })

        expect(playerStore.spendOnTrack(1, 800)).toBe(false)

        expect(playerStore.players[0].cash).toBe(500)
        expect(playerStore.players[0].trackSpentThisTurn).toBe(0)
      })

      it('should still hold a player with no spend counter to the budget', () => {
        // `budget - undefined` is NaN, and every comparison against NaN is
        // false, so an unguarded check would let this player build for free
        playerStore.updatePlayer(1, { cash: 100000, trackSpentThisTurn: undefined })

        expect(playerStore.spendOnTrack(1, gameRules.trackBudgetPerTurn)).toBe(true)
        expect(playerStore.players[0].trackSpentThisTurn).toBe(gameRules.trackBudgetPerTurn)
        expect(playerStore.spendOnTrack(1, 1)).toBe(false)
      })

      it('should not count a refused section against the budget', () => {
        playerStore.updatePlayer(1, { cash: 500 })
        playerStore.spendOnTrack(1, 800)

        expect(playerStore.trackBudgetRemaining(1)).toBe(gameRules.trackBudgetPerTurn)
      })
    })

    describe('refundTrackSpend', () => {
      it('should give back the cash and the allowance', () => {
        playerStore.spendOnTrack(1, 5000)

        expect(playerStore.refundTrackSpend(1, 5000)).toBe(true)

        expect(playerStore.players[0].cash).toBe(gameRules.startingCash)
        expect(playerStore.players[0].trackSpentThisTurn).toBe(0)
      })

      it('should let a player rebuild with the refunded allowance', () => {
        playerStore.spendOnTrack(1, gameRules.trackBudgetPerTurn)
        playerStore.refundTrackSpend(1, gameRules.trackBudgetPerTurn)

        expect(playerStore.spendOnTrack(1, gameRules.trackBudgetPerTurn)).toBe(true)
      })

      it('should not push the spend counter below zero', () => {
        playerStore.spendOnTrack(1, 1000)
        playerStore.refundTrackSpend(1, 5000)

        // A larger allowance than the rules give would be the alternative
        expect(playerStore.players[0].trackSpentThisTurn).toBe(0)
        expect(playerStore.trackBudgetRemaining(1)).toBe(gameRules.trackBudgetPerTurn)
      })

      it('should reject a negative refund', () => {
        expect(playerStore.refundTrackSpend(1, -100)).toBe(false)

        expect(playerStore.players[0].cash).toBe(gameRules.startingCash)
      })

      it('should reject an unknown player', () => {
        expect(playerStore.refundTrackSpend(999, 100)).toBe(false)
      })
    })

    describe('availableForTrack', () => {
      it('should be the full budget at the start of a turn', () => {
        expect(playerStore.availableForTrack(1)).toBe(gameRules.trackBudgetPerTurn)
      })

      it('should fall as the player builds', () => {
        playerStore.spendOnTrack(1, 5000)

        expect(playerStore.availableForTrack(1)).toBe(gameRules.trackBudgetPerTurn - 5000)
      })

      it('should be capped by cash when the player is poorer than the budget', () => {
        playerStore.updatePlayer(1, { cash: 300 })

        expect(playerStore.availableForTrack(1)).toBe(300)
      })

      it('should be capped by the budget when the player is richer than it', () => {
        playerStore.updatePlayer(1, { cash: 500000 })

        expect(playerStore.availableForTrack(1)).toBe(gameRules.trackBudgetPerTurn)
      })

      it('should be zero for an unknown player', () => {
        expect(playerStore.availableForTrack(999)).toBe(0)
      })
    })

    describe('trackSpendThisTurn', () => {
      it('should be zero at the start of a turn', () => {
        expect(playerStore.trackSpendThisTurn(1)).toBe(0)
      })

      it('should add up everything built this turn', () => {
        playerStore.spendOnTrack(1, 5000)
        playerStore.spendOnTrack(1, 2500)

        expect(playerStore.trackSpendThisTurn(1)).toBe(7500)
      })

      it('should drop by what a removed section refunds', () => {
        playerStore.spendOnTrack(1, 5000)
        playerStore.refundTrackSpend(1, 2000)

        expect(playerStore.trackSpendThisTurn(1)).toBe(3000)
      })

      it('should treat a missing counter from an old save as zero', () => {
        playerStore.updatePlayer(1, { trackSpentThisTurn: undefined })

        expect(playerStore.trackSpendThisTurn(1)).toBe(0)
      })

      it('should be zero for an unknown player', () => {
        expect(playerStore.trackSpendThisTurn(999)).toBe(0)
      })
    })

    describe('resetTrackSpend', () => {
      it('should clear the counter without touching cash', () => {
        playerStore.spendOnTrack(1, 5000)

        expect(playerStore.resetTrackSpend(1)).toBe(true)

        expect(playerStore.players[0].trackSpentThisTurn).toBe(0)
        expect(playerStore.players[0].cash).toBe(gameRules.startingCash - 5000)
      })

      it('should return false for an unknown player', () => {
        expect(playerStore.resetTrackSpend(999)).toBe(false)
      })
    })
  })

  describe('setPlayers', () => {
    it('should give restored players a spend counter when the save has none', () => {
      // Saves written before track was charged for carry no counter, and an
      // undefined one turns every later budget check into NaN
      playerStore.setPlayers([
        { id: 1, name: 'Alice', color: 'red', cash: 20000, isTurn: true, position: 0 }
      ])

      expect(playerStore.players[0].trackSpentThisTurn).toBe(0)
      expect(playerStore.availableForTrack(1)).toBe(gameRules.trackBudgetPerTurn)
    })

    it('should keep a spend counter the save does carry', () => {
      playerStore.setPlayers([
        {
          id: 1,
          name: 'Alice',
          color: 'red',
          cash: 15000,
          isTurn: true,
          position: 0,
          trackSpentThisTurn: 5000
        }
      ])

      expect(playerStore.availableForTrack(1)).toBe(gameRules.trackBudgetPerTurn - 5000)
    })
  })
})
