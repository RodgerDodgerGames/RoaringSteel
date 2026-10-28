/**
 * Image Pixels (imagePixels.js)
 *
 * Downloads an image and reads out its pixels. The grid's terrain arrives as
 * images — elevation tiles whose colors encode height, and pictures of the
 * land cover map — so this is how setup gets at the numbers inside them.
 *
 * Kept on its own, away from the code that interprets the pixels, because it
 * is the one part that needs a real browser to decode images. Tests stand in
 * for it with pixels of their own.
 *
 * @module composables/setup/imagePixels
 */

import { fetchWithTimeout } from '@/composables/utils'

/**
 * Fetches an image and returns its pixels.
 *
 * The browser is told not to adjust the colors while decoding. Normally it
 * may convert an image's colors to the screen's color space, which is fine
 * for a picture but would shift the values an elevation tile stores its
 * heights in, and the colors land cover classes are told apart by.
 *
 * @param {string} url - The image
 * @param {Object} options
 * @param {number} options.timeoutMs - Ceiling for the download
 * @returns {Promise<{width: number, height: number, data: Uint8ClampedArray}>}
 *   The pixels, four bytes each (red, green, blue, alpha), row by row from the
 *   top left
 */
export async function fetchImagePixels(url, { timeoutMs }) {
  const response = await fetchWithTimeout(url, { timeoutMs })
  if (!response.ok) {
    throw new Error(`Image request responded ${response.status}`)
  }
  const blob = await response.blob()

  const bitmap = await createImageBitmap(blob, {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none'
  })
  const { width, height } = bitmap
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(bitmap, 0, 0)
  bitmap.close()

  return context.getImageData(0, 0, width, height)
}
