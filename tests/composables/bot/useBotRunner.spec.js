/**
 * Bot Runner Tests
 *
 * Computer players' turns coming round by themselves, at a pace people can
 * follow: a moment's wait, the turn, a pause, and on to the next player. And
 * never a turn played or ended in a game that has since been loaded over or
 * won.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { usePlayerStore } from '@/stores/players'
import { useGameStore } from '@/stores/game'
import { useBotsStore } from '@/stores/bots'
import { useBotRunner, BOT_PAUSE_MS, THINK_DELAY_MS } from '@/composables/bot/useBotRunner'

// The turn itself is tested in useBot.spec.js; here it only has to be called
const playTurn = vi.fn()
vi.mock('@/composables/bot/useBot', () => ({
  useBot: () => ({ playTurn }),
  describeTurn: (name) => `${name} played.`
}))

describe('useBotRunner', () => {
  let scope
  let playerStore

  /** Sets the players up and starts the runner, as the game screen does */
  function start(roster) {
    playerStore = usePlayerStore()
    roster.forEach(({ name, isBot }, i) =>
      playerStore.addPlayer({ name, isBot, color: ['red', 'blue', 'green'][i], cash: 0 })
    )
    playerStore.startGame()
    scope = effectScope()
    scope.run(() => useBotRunner())
  }

  /** Lets the wait before a turn and the pause after it go by */
  async function wholeTurn() {
    await vi.advanceTimersByTimeAsync(THINK_DELAY_MS)
    await vi.advanceTimersByTimeAsync(BOT_PAUSE_MS)
    await nextTick()
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    playTurn.mockReset()
    playTurn.mockReturnValue({ events: [], errors: [], endedTurn: false })
  })

  afterEach(() => {
    scope?.stop()
    vi.useRealTimers()
  })

  it("should play a computer player's turn and end it after the pause", async () => {
    start([
      { name: 'Bot 1', isBot: true },
      { name: 'Ann', isBot: false }
    ])

    await vi.advanceTimersByTimeAsync(THINK_DELAY_MS)
    expect(playTurn).toHaveBeenCalledWith(1)
    // Still up for people to read
    expect(playerStore.activePlayer.name).toBe('Bot 1')
    expect(useBotsStore().reports[0]).toMatchObject({ playerId: 1, summary: 'Bot 1 played.' })

    await vi.advanceTimersByTimeAsync(BOT_PAUSE_MS)
    expect(playerStore.activePlayer.name).toBe('Ann')
  })

  it("should leave a person's turn alone", async () => {
    start([
      { name: 'Ann', isBot: false },
      { name: 'Bot 1', isBot: true }
    ])

    await vi.advanceTimersByTimeAsync(10 * BOT_PAUSE_MS)

    expect(playTurn).not.toHaveBeenCalled()
    expect(playerStore.activePlayer.name).toBe('Ann')
  })

  it('should play computer players one after another', async () => {
    start([
      { name: 'Bot 1', isBot: true },
      { name: 'Bot 2', isBot: true },
      { name: 'Ann', isBot: false }
    ])

    await wholeTurn()
    await wholeTurn()

    expect(playTurn.mock.calls).toEqual([[1], [2]])
    expect(playerStore.activePlayer.name).toBe('Ann')
  })

  it('should play a computer player that plays twice running both times', async () => {
    // The second building round runs backward, so the last player goes twice
    start([
      { name: 'Ann', isBot: false },
      { name: 'Bot 1', isBot: true }
    ])
    playerStore.setActivePlayer(2)
    await nextTick()

    await wholeTurn()
    await wholeTurn()

    expect(playTurn.mock.calls).toEqual([[2], [2]])
  })

  it('should not end a turn in a game loaded during the pause', async () => {
    start([
      { name: 'Bot 1', isBot: true },
      { name: 'Ann', isBot: false }
    ])
    await vi.advanceTimersByTimeAsync(THINK_DELAY_MS)

    // Another game, where it is Bot 1's turn too, loaded mid-pause
    playerStore.setPlayers([
      { id: 1, name: 'Bot 1', color: 'red', cash: 0, isTurn: true, isBot: true },
      { id: 2, name: 'Ann', color: 'blue', cash: 0, isTurn: false }
    ])
    await nextTick()
    await vi.advanceTimersByTimeAsync(BOT_PAUSE_MS - THINK_DELAY_MS)

    // The loaded game's turn has started afresh, not been ended
    expect(playerStore.activePlayer.name).toBe('Bot 1')
    expect(playTurn).toHaveBeenCalledTimes(2)
  })

  it('should stop once someone has won', async () => {
    start([
      { name: 'Bot 1', isBot: true },
      { name: 'Bot 2', isBot: true }
    ])
    playTurn.mockImplementation(() => {
      useGameStore().declareWinner(1)
      return { events: [], errors: [], endedTurn: false }
    })

    await vi.advanceTimersByTimeAsync(10 * BOT_PAUSE_MS)

    expect(playTurn).toHaveBeenCalledTimes(1)
    expect(playerStore.activePlayer.name).toBe('Bot 1')
  })

  it('should not end the turn again when throwing in the hand has ended it', async () => {
    start([
      { name: 'Bot 1', isBot: true },
      { name: 'Ann', isBot: false },
      { name: 'Cy', isBot: false }
    ])
    playTurn.mockImplementation(() => {
      // As throwing in the hand does: the turn passes on there and then
      playerStore.setActivePlayer(2)
      return { events: [{ type: 'discard' }], errors: [], endedTurn: true }
    })

    await vi.advanceTimersByTimeAsync(10 * BOT_PAUSE_MS)

    expect(playerStore.activePlayer.name).toBe('Ann')
  })

  it('should end the turn of a computer player whose turn went wrong, and say so', async () => {
    start([
      { name: 'Bot 1', isBot: true },
      { name: 'Ann', isBot: false }
    ])
    playTurn.mockImplementation(() => {
      throw new Error('lost')
    })

    await wholeTurn()

    expect(useBotsStore().reports[0]).toMatchObject({ playerId: 1, hadProblem: true })
    expect(playerStore.activePlayer.name).toBe('Ann')
  })
})
