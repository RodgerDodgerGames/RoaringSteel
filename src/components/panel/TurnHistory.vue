<!--
  TurnHistory.vue

  The turn history in the player dock: what every player has done on each
  of their turns, the latest first, for everyone at the table to catch up on
  (see the history store, and turnHistory.js for the words).

  A switch in the section's header picks how it reads:
  - Summary: a sentence for each turn
  - Full: each turn under a heading, a line for each thing the player did

  Which one is remembered in the browser, like the section being folded: it
  is a per-browser convenience, not part of the game.

  A computer player's turn on which the rules refused something it tried is
  marked, since that should never happen and is worth a look.

  Only shown once there is a turn to show.
-->

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useStorage } from '@vueuse/core'
import CollapsibleSection from '@/components/CollapsibleSection.vue'
import { useHistoryStore } from '@/stores/history'
import { usePlayerStore } from '@/stores/players'
import { summarizeTurn, turnLines } from '@/composables/turnHistory'

const { turns } = storeToRefs(useHistoryStore())
const playerStore = usePlayerStore()

/** 'summary' or 'full'; remembered per browser */
const view = useStorage('roaringsteel_turn_history_view', 'summary')

/** A player's name, by id */
const nameOf = (playerId) => playerStore.players.find((p) => p.id === playerId)?.name ?? 'Someone'

/**
 * The finished turns as shown, the latest first, with the words for the
 * view picked worked out once here rather than on every render. Each is
 * keyed by its place from the start of the game, which never changes as new
 * turns go on the top.
 */
const rows = computed(() =>
  turns.value
    .map((turn, place) => ({
      key: place,
      round: turn.round + 1,
      name: nameOf(turn.playerId),
      color: playerStore.colorOf(turn.playerId) ?? 'transparent',
      summary: view.value === 'summary' ? summarizeTurn(turn, nameOf) : '',
      lines: view.value === 'full' ? turnLines(turn, nameOf) : [],
      problem: turn.hadProblem
        ? `The rules refused something ${nameOf(turn.playerId)} tried; see the browser console.`
        : ''
    }))
    .reverse()
)
</script>

<template>
  <CollapsibleSection v-if="turns.length" title="Turn history" storage-key="dock_history">
    <template #actions>
      <div class="buttons are-small has-addons mb-0" role="group" aria-label="Show the history as">
        <button
          class="button"
          :class="{ 'is-selected is-primary': view === 'summary' }"
          :aria-pressed="view === 'summary'"
          title="A sentence for each turn"
          @click="view = 'summary'"
        >
          Summary
        </button>
        <button
          class="button"
          :class="{ 'is-selected is-primary': view === 'full' }"
          :aria-pressed="view === 'full'"
          title="A line for everything each player did"
          @click="view = 'full'"
        >
          Full
        </button>
      </div>
    </template>

    <ol class="turn-history">
      <li v-for="row in rows" :key="row.key" class="turn-history__turn">
        <span
          class="turn-history__swatch"
          :style="{ background: row.color }"
          aria-hidden="true"
        ></span>
        <div>
          <template v-if="view === 'summary'">
            <span class="turn-history__round">Round {{ row.round }}</span>
            {{ row.summary }}
          </template>

          <template v-else>
            <div class="turn-history__heading">Round {{ row.round }} · {{ row.name }}</div>
            <ul class="turn-history__lines">
              <li v-for="(line, lineIndex) in row.lines" :key="lineIndex">{{ line }}</li>
            </ul>
          </template>

          <span v-if="row.problem" class="turn-history__problem" :title="row.problem">
            (hit a problem)
          </span>
        </div>
      </li>
    </ol>
  </CollapsibleSection>
</template>

<style scoped>
.turn-history {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  list-style: none;
  font-size: 0.85rem;
}

/* The player's color beside each turn, so whose it is shows at a glance */
.turn-history__turn {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

.turn-history__swatch {
  flex: none;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--bulma-border);
}

.turn-history__round,
.turn-history__heading {
  font-weight: 700;
}

.turn-history__round {
  margin-right: 0.25rem;
}

.turn-history__lines {
  margin: 0.15rem 0 0;
  list-style: disc;
  padding-left: 1.1rem;
}

.turn-history__problem {
  color: var(--bulma-danger);
}
</style>
