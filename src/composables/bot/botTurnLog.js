/**
 * Bot Turn Log (botTurnLog.js)
 *
 * Prints a computer player's turn to the console in debug mode (see
 * composables/debug.js): one collapsed group per turn, titled with the
 * player, the round and their cash either side of it. Inside:
 * - every demand in hand as a table — where the load would come from and
 *   go to, what connecting it would cost, what it pays and leaves over, and
 *   whether it was a choice (ranked) or rejected (and why);
 * - the plan: the demand ranked first;
 * - the train's run, stop by stop, with the distance left after each move,
 *   and why it stopped;
 * - building, try by try: the town aimed for and why, what could be spent,
 *   what the whole line would cost against what was built, and why building
 *   stopped;
 * - any problem: an action the rules refused, or the turn throwing, neither
 *   of which should ever happen.
 *
 * It only reads the report `playTurn` returns (see useBot.js); the turn is
 * played the same whether or not it is printed. The report's trace is kept
 * on every turn — a little bookkeeping, next to nothing beside the turn's
 * route searches — but out of debug mode the group is never filled, so none
 * of the formatting here is done.
 *
 * @module composables/bot/botTurnLog
 */

import { debug } from '@/composables/debug'
import { formatCurrency } from '@/composables/utils'
import { workableDemands } from './botPlanner'

/** A dollar figure, or a dash for one there is none of */
const money = (value) => (Number.isFinite(value) ? formatCurrency(value) : '—')

/**
 * The demands in hand as table rows, in hand order.
 * @param {Array<Object>} review - From `reviewDemands`
 * @returns {Array<Object>} One row per demand line, keyed by column heading
 */
function demandRows(review) {
  const ranked = workableDemands(review)
  return review.map((entry) => {
    const { cardId, demand, from, to, cost, profit, rejected } = entry
    return {
      Card: cardId,
      Load: demand.industry,
      // null: already on the train; absent: no producer could be reached
      From: from === null ? 'on the train' : (from?.name ?? '—'),
      To: to?.name ?? demand.destination,
      'Build cost': money(cost),
      Payoff: money(demand.payoff),
      Profit: money(profit),
      Verdict: rejected ? `rejected: ${rejected}` : `choice ${ranked.indexOf(entry) + 1}`
    }
  })
}

/**
 * The plan in a line: the demand ranked first, or that there is none.
 * @param {Array<Object>} review - From `reviewDemands`
 * @returns {string} The line
 */
function planLine(review) {
  const [best] = workableDemands(review)
  if (!best) return 'Plan: none — every demand in hand is rejected'
  const from = best.from ? ` from ${best.from.name}` : ' (on the train)'
  return (
    `Plan: ${best.demand.industry}${from} to ${best.to.name} — ` +
    `${money(best.cost)} to connect, pays ${money(best.demand.payoff)}, ` +
    `leaves ${money(best.profit)}`
  )
}

/**
 * What the train and the hand did, a line per event, in order. Building is
 * left to `buildLines`, which has more to say about it.
 * @param {Array<Object>} events - The report's events
 * @returns {Array<string>} The lines
 */
function eventLines(events) {
  return events.flatMap((event) => {
    switch (event.type) {
      case 'discard':
        return ['Threw in the hand: no demand in it can be worked toward']
      case 'place':
        return [`Put the train in ${event.town}`]
      case 'move':
        return [
          `${event.arrived ? 'Ran to' : 'Headed for'} ${event.town} (${Math.round(event.kmLeft)} km left)`
        ]
      case 'deliver':
        return [`Delivered ${event.industry} to ${event.town} for ${money(event.payoff)}`]
      case 'pickup':
        return [`Picked up ${event.industry} in ${event.town}`]
      case 'drop':
        return [`Dropped ${event.industry} in ${event.town}`]
      case 'upgrade':
        return [`Upgraded to a ${event.to}`]
      default:
        return []
    }
  })
}

/**
 * Building, a line per try (see `buildTrack` in useBot.js).
 * @param {Array<Object>} steps - The trace's build steps
 * @returns {Array<string>} The lines
 */
function buildLines(steps) {
  return steps.map((step) => {
    const aim = `Build toward ${step.toward} (${step.why}): ${money(step.available)} available, budget ${money(step.budget)}`
    if (step.noLine) return `${aim} — no buildable line reaches it, given up for this turn`
    if (step.linePrice === undefined) return aim
    const line = `whole line ${money(step.linePrice)} over ${step.lineCells} cells`
    if (step.built === undefined) return `${aim} — ${line}, nothing built`
    return `${aim} — ${line}; built ${money(step.built)} over ${step.builtCells} cells`
  })
}

/**
 * Prints a computer player's turn (see the module notes), when in debug mode.
 * @param {Object} turn
 * @param {string} turn.name - The computer player's name
 * @param {number} turn.round - The round the turn was played in
 * @param {boolean} turn.isBuildingRound - Whether it was a building round
 * @param {Object} turn.report - What `playTurn` returned. A turn that threw
 *   has no trace, only the error in `errors` (see useBotRunner.js).
 * @param {Object} [logger=debug] - Where to print; the game's debug logger
 */
export function logBotTurn({ name, round, isBuildingRound, report }, logger = debug) {
  const trace = report.trace ?? { build: [] }
  const kind = isBuildingRound ? 'building round' : 'operating round'
  const cash =
    trace.cashBefore === undefined
      ? ''
      : ` · ${money(trace.cashBefore)} → ${money(trace.cashAfter)}`

  logger.group(`${name} · round ${round} (${kind})${cash}`, () => {
    if (trace.startCity) logger.log(`No track yet: planning from ${trace.startCity}`)

    if (trace.demands) {
      logger.log(`Demands in hand, as weighed up when ${trace.demandsWhen}:`)
      logger.table(demandRows(trace.demands))
      logger.log(planLine(trace.demands))
    }

    eventLines(report.events).forEach((line) => logger.log(line))
    if (trace.trainStop) logger.log(`Train stopped: ${trace.trainStop}`)

    buildLines(trace.build).forEach((line) => logger.log(line))
    if (trace.buildStop) logger.log(`Building stopped: ${trace.buildStop}`)

    report.errors.forEach(({ action, error }) => logger.log(`Problem — ${action}: ${error}`))
  })
}
