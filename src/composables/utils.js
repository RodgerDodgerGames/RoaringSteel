/**
 * Utility Functions (utils.js)
 *
 * General-purpose utilities used across the application.
 *
 * @module composables/utils
 */

/**
 * Waits for a random amount of time between min and max milliseconds.
 * Used to add jitter to API requests to avoid rate limiting.
 *
 * @param {number} minWaitTime - Minimum wait time in ms (default: 500)
 * @param {number} maxWaitTime - Maximum wait time in ms (default: 2000)
 * @returns {Promise<void>} Resolves after the random delay
 */
export function waitRandomly(minWaitTime = 500, maxWaitTime = 2000) {
  const waitTime = Math.floor(Math.random() * (maxWaitTime - minWaitTime)) + minWaitTime
  return new Promise((resolve) => setTimeout(resolve, waitTime))
}

/**
 * Formats a number as US currency (e.g., "$1,234").
 *
 * @param {number} value - The numeric value to format
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0
  }).format(value)
}
