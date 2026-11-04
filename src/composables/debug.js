/**
 * Debug Mode (debug.js)
 *
 * A switch for the console output that is only wanted while working on the
 * game: what a computer player weighs up on its turn, what setup fetched,
 * when the game saved. Warnings and errors are not debug output — they say
 * something went wrong, and always print.
 *
 * Debug mode is turned on by adding `?debug` to the page's address
 * (`http://localhost:5173/?debug`), and lasts for that page load. It is read
 * once, when the page loads: nothing in the game changes the address, and
 * nothing about it is remembered or written into saves, so a reload without
 * the flag is back to a quiet console.
 *
 * Everything that prints debug output goes through the `debug` logger here
 * rather than calling `console.log` itself, so the one switch silences all
 * of it.
 *
 * @module composables/debug
 */

/** Values of the `debug` parameter that mean "off", in lower case */
const OFF_VALUES = Object.freeze(['0', 'false', 'off', 'no'])

/**
 * Whether a page address's query string turns debug mode on: it does when
 * it has a `debug` parameter, with no value (`?debug`) or any value except
 * one meaning "off" (`OFF_VALUES`, in any case) — so `?debug=false` reads as
 * meant rather than as "on, because the word is there".
 * @param {string} search - The query string, e.g. `window.location.search`
 * @returns {boolean} True for debug mode
 */
export function isDebugOn(search) {
  const value = new URLSearchParams(search).get('debug')
  return value !== null && !OFF_VALUES.includes(value.toLowerCase())
}

/** Whether this page load is in debug mode (see the module notes) */
export const debugEnabled = typeof window !== 'undefined' && isDebugOn(window.location.search)

/**
 * Makes a logger that prints to the console only when it is enabled, and
 * otherwise does nothing at all.
 *
 * The console's own methods are looked up each time something is printed,
 * not when the logger is made, so a test that replaces `console.log` after
 * the logger exists still sees what it prints.
 *
 * @param {boolean} enabled - Whether to print
 * @param {Object} [target=console] - Where to print; the console, or a stand-in
 * @returns {{enabled: boolean, log: Function, table: Function, group: Function}}
 *   `log(...values)` and `table(rows)` print as `console.log` and
 *   `console.table` do. `group(title, body)` prints a collapsed group titled
 *   `title` and calls `body` to fill it — when disabled, `body` is never
 *   called, so the work of putting a long report together is skipped too.
 *   A `body` that throws is reported as an error and goes no further:
 *   debug output must never change how the game plays, so a bug in it
 *   cannot stop, say, a computer player's turn from ending.
 */
export function createDebugLogger(enabled, target = console) {
  return {
    enabled,
    log(...values) {
      if (enabled) target.log(...values)
    },
    table(rows) {
      if (enabled) target.table(rows)
    },
    group(title, body) {
      if (!enabled) return
      target.groupCollapsed(title)
      try {
        body()
      } catch (error) {
        target.error(`Debug output "${title}" could not be printed:`, error)
      } finally {
        // Closed even when filling it failed, or everything printed after
        // would land inside this group
        target.groupEnd()
      }
    }
  }
}

/** The game's debug logger, on when the page was loaded with `?debug` */
export const debug = createDebugLogger(debugEnabled)
