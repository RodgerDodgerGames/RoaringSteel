/**
 * Save to File Tests
 *
 * Saving the game as a file is offered by both the Save Game and New Game
 * dialogs. The file is named from what the player types, without the spaces
 * round it; a blank name is refused; and a failed download says so.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const exportToFile = vi.fn()
vi.mock('@/composables/useGamePersistence', () => ({
  useGamePersistence: () => ({ exportToFile })
}))

const { useSaveToFile, DEFAULT_SAVE_FILENAME } = await import('@/composables/useSaveToFile')

describe('useSaveToFile', () => {
  beforeEach(() => {
    exportToFile.mockReset().mockReturnValue(true)
  })

  it('should offer the default name until the player types another', () => {
    const { filename, save } = useSaveToFile()

    expect(filename.value).toBe(DEFAULT_SAVE_FILENAME)
    expect(save()).toBe(true)
    expect(exportToFile).toHaveBeenCalledWith(DEFAULT_SAVE_FILENAME)
  })

  it('should save under the typed name without the spaces round it, as it shows', () => {
    const { filename, fileLabel, save } = useSaveToFile()
    filename.value = '  my game '

    expect(fileLabel.value).toBe('my game.json')
    save()
    expect(exportToFile).toHaveBeenCalledWith('my game')
  })

  it('should refuse a blank name and download nothing', () => {
    const { filename, errorMessage, save } = useSaveToFile()
    filename.value = '   '

    expect(save()).toBe(false)
    expect(exportToFile).not.toHaveBeenCalled()
    expect(errorMessage.value).toBe('Please enter a filename')
  })

  it('should say so when the download fails', () => {
    exportToFile.mockReturnValue(false)
    const { errorMessage, save } = useSaveToFile()

    expect(save()).toBe(false)
    expect(errorMessage.value).not.toBe('')
  })

  it('should clear the last failure on the next save', () => {
    const { filename, errorMessage, save } = useSaveToFile()
    filename.value = ''
    save()
    filename.value = 'game'

    expect(save()).toBe(true)
    expect(errorMessage.value).toBe('')
  })
})
