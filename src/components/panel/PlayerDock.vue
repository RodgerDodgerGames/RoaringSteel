<!--
  PlayerDock.vue

  The panel down the right of the game screen. Everything in it is about the
  player whose turn it is, read top to bottom in the order a turn is played:

  1. who they are and their cash          (PlayerCard)
  2. their train                          (TrainPanel)
  3. this turn, step by step:
       1. move the train                  — not built yet
       2. build track OR upgrade the train — the Empire Builder rule: a player
          spends their turn's money on one or the other, never both
  4. End Turn, pinned to the bottom so it is always in the same place

  The middle scrolls on its own if it outgrows the window, so the player card
  and End Turn never leave the screen.
-->

<script setup>
import { storeToRefs } from 'pinia'
import PlayerCard from '@/components/panel/PlayerCard.vue'
import TrainPanel from '@/components/panel/TrainPanel.vue'
import CollapsibleSection from '@/components/CollapsibleSection.vue'
import BuildControls from '@/components/panel/BuildControls.vue'
import { usePlayerStore } from '@/stores/players'
import { useTurn } from '@/composables/useTurn'

const { nextPlayer } = storeToRefs(usePlayerStore())
const { endTurn } = useTurn()
</script>

<template>
  <aside class="player-dock" aria-label="Your turn">
    <PlayerCard />

    <div class="player-dock__body">
      <TrainPanel />

      <CollapsibleSection title="This turn" storage-key="dock_turn">
        <ol class="turn-steps">
          <!-- Step 1: placeholder until trains can move -->
          <li class="turn-step is-placeholder">
            <div class="turn-step__heading">
              <span class="turn-step__number">1</span>
              <span>Move your train</span>
              <span class="tag is-rounded ml-auto">Not built yet</span>
            </div>
            <p class="turn-step__note">
              Run your train along your track to pick up and deliver loads.
            </p>
          </li>

          <!-- Step 2: build or upgrade -->
          <li class="turn-step">
            <div class="turn-step__heading">
              <span class="turn-step__number">2</span>
              <span>Build track <em>or</em> upgrade your train</span>
            </div>

            <!-- Build is the only choice that works so far; Upgrade shows
                 where the choice will be made once trains exist -->
            <div class="buttons has-addons turn-step__choice">
              <button class="button is-small is-selected is-primary" aria-pressed="true">
                Build track
              </button>
              <button class="button is-small" disabled title="Not built yet">Upgrade train</button>
            </div>

            <BuildControls />
          </li>
        </ol>
      </CollapsibleSection>
    </div>

    <footer class="player-dock__footer">
      <button class="button is-primary is-medium is-fullwidth" @click="endTurn">End turn</button>
      <p v-if="nextPlayer" class="player-dock__next">Next up: {{ nextPlayer.name }}</p>
    </footer>
  </aside>
</template>

<style scoped>
/* Card at the top, footer at the bottom, scrolling body between */
.player-dock {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--bulma-border);
  background: var(--bulma-scheme-main-bis);
}

.player-dock__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

/* A rule under each collapsible section, dividing the dock into its parts.
   The sections' root elements carry this component's scope, so this reaches
   them without :deep. */
.player-dock__body > section {
  border-bottom: 1px solid var(--bulma-border-weak);
}

.turn-steps {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.turn-step__heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
}

.turn-step__heading em {
  font-weight: 400;
}

/* A numbered disc, like the step markers printed on a rules sheet */
.turn-step__number {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: var(--bulma-primary);
  color: var(--bulma-primary-invert);
  font-size: 0.8rem;
}

.turn-step__note {
  margin-top: 0.25rem;
  padding-left: 2rem;
  font-size: 0.85rem;
  color: var(--bulma-text-weak);
}

.turn-step__choice {
  margin: 0.6rem 0 0.75rem;
}

/* Faded, to read as a preview rather than as a step that can be taken */
.turn-step.is-placeholder {
  opacity: 0.55;
}

.turn-step.is-placeholder .turn-step__number {
  background: var(--bulma-text-weak);
}

.player-dock__footer {
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--bulma-border);
  background: var(--bulma-scheme-main);
}

.player-dock__next {
  margin-top: 0.35rem;
  font-size: 0.8rem;
  text-align: center;
  color: var(--bulma-text-weak);
}
</style>
