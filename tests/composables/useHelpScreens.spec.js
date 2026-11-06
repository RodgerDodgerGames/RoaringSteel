/**
 * Help Screens Tests
 *
 * A help screen shows unless help is turned off in Settings, or the player
 * dismissed that one screen for the rest of the game. Dismissing one must
 * leave the others showing, and a new game must show them all again.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'
import { useHelpScreens, HELP_SCREENS } from '@/composables/useHelpScreens'

describe('useHelpScreens', () => {
  let help

  beforeEach(() => {
    localStorage.clear()
    help = useHelpScreens()
  })

  it('should show every help screen to a player who has not changed anything', () => {
    Object.values(HELP_SCREENS).forEach((name) => expect(help.isShown(name)).toBe(true))
  })

  it('should hide a dismissed screen and leave the others showing', () => {
    help.dismiss(HELP_SCREENS.building)

    expect(help.isShown(HELP_SCREENS.building)).toBe(false)
    expect(help.isShown(HELP_SCREENS.removing)).toBe(true)
    expect(help.isShown(HELP_SCREENS.choosingTown)).toBe(true)
  })

  it('should hide every screen while help is turned off', () => {
    useSettingsStore().settings.showHelp = false

    Object.values(HELP_SCREENS).forEach((name) => expect(help.isShown(name)).toBe(false))
  })

  it('should show a dismissed screen again in a new game', () => {
    help.dismiss(HELP_SCREENS.removing)

    useGameStore().reset()

    expect(help.isShown(HELP_SCREENS.removing)).toBe(true)
  })
})
