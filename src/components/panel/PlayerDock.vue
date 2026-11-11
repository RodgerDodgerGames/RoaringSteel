<!--
  PlayerDock.vue

  The panel down the right of the game screen. Everything in it is about the
  player whose turn it is, read top to bottom in the order a turn is played:

  1. who they are and their cash          (PlayerCard)
  2. their train                          (TrainPanel)
  3. this turn, step by step:
       1. move the train                  (MoveControls)
       2. build track OR upgrade the train — the Empire Builder rule: a turn's
          money goes on one or the other (a crossgrade leaves some to build
          with), chosen with the switch     (BuildControls, UpgradeControls)
     In the two opening building rounds trains do not run, so step 1 gives
     way to a note saying so, and building is the whole turn.

     The step the player is on is highlighted: moving while the train still
     has something to do (see the trains store's isStillMoving), then
     building. Both stay usable — either may be skipped — the highlight only
     shows the order. As the turn moves on to building, step 1 folds down to
     where the train is; the player can unfold it again. Each new turn, and
     each new step, unfolds "This turn" and scrolls the step into sight.
  4. End Turn, pinned to the bottom so it is always in the same place
     (throwing in the hand of demand cards instead of a turn is offered on
     the demand strip, beside the cards — see DemandStrip)

  Once someone has won, the steps give way to who won, and a button to see
  the final standings again.

  On a computer player's turn there is nothing for a person to do: the
  steps and End Turn give way to a note that the computer player is taking
  its turn (it plays and ends it by itself — see useBotRunner).

  Under the steps, whoever's turn it is and once the game is over, is the
  turn history: what every player has done, so the people at the table can
  catch up on what happened while they waited (TurnHistory).

  The middle scrolls on its own if it outgrows the window, so the player card
  and End Turn never leave the screen.

  @emits show-results - The player wants to see the final standings
-->

<script setup>
import { ref, computed, watch, inject, nextTick, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import PlayerCard from '@/components/panel/PlayerCard.vue'
import TrainPanel from '@/components/panel/TrainPanel.vue'
import CollapsibleSection from '@/components/CollapsibleSection.vue'
import MoveControls from '@/components/panel/MoveControls.vue'
import BuildControls from '@/components/panel/BuildControls.vue'
import UpgradeControls from '@/components/panel/UpgradeControls.vue'
import TurnHistory from '@/components/panel/TurnHistory.vue'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/players'
import { useTrainsStore } from '@/stores/trains'
import { useTurn } from '@/composables/useTurn'
import { reveal } from '@/composables/useRevealOnChange'
import { buildTrackKey } from '@/composables/map/useBuildTrack'
import { gameRules } from '@/config/game'

const emit = defineEmits(['show-results'])

const gameStore = useGameStore()
const { turn, isBuildingRound, isOver, winnerId } = storeToRefs(gameStore)
const playerStore = usePlayerStore()
const trainsStore = useTrainsStore()
const { nextPlayer, playsAgain, endTurn } = useTurn()

// The game view's build-track instance (see BuildControls); null with no map
const buildTrack = inject(buildTrackKey, null)

/**
 * End turn: a line still being drawn is built first, as far as it can be,
 * as Stop building would. It has to be built before the turn ends, while
 * the turn is still the drawing player's; after, it would be thrown away.
 *
 * If the line could not be built whole, the turn stays open: the notice
 * saying why would otherwise be cleared as the turn passed, and the player
 * would never learn part of their line is missing. They click End turn
 * again once they have read it.
 */
function finishTurn() {
  if (buildTrack?.stopDrawing() === false) return
  endTurn()
}

/** Whether the turn is a computer player's, which plays itself */
const isBotTurn = computed(() => playerStore.activePlayer?.isBot === true)

/** The winner, once there is one */
const winner = computed(() => playerStore.players.find((p) => p.id === winnerId.value))

/** What the turn's money is going on: 'build' or 'upgrade' */
const spendOn = ref('build')

// Each turn opens on building, the usual choice
watch(
  () => playerStore.activePlayer?.id,
  () => {
    spendOn.value = 'build'
  }
)

// THE STEP THE PLAYER IS ON

/**
 * The step of the turn the player is on: 'move' while their train still has
 * something to do, then 'build'. Always 'build' in the building rounds, where
 * there is no moving (the trains store answers false there).
 */
const activeStep = computed(() =>
  trainsStore.isStillMoving(playerStore.activePlayer?.id) ? 'move' : 'build'
)

/**
 * The step together with whose turn it is and the round, so it changes with
 * each new turn as well as each new step — including a player who plays
 * twice running, and a turn that starts on the step the last one ended on.
 */
const turnStep = computed(() => `${turn.value}:${playerStore.activePlayer?.id}:${activeStep.value}`)

/**
 * Whether step 1 is unfolded. It is set afresh with each change of
 * `turnStep` — open while moving, folded once on to building — and the
 * player may fold or unfold it in between.
 */
const isMoveStepOpen = ref(activeStep.value === 'move')

const turnSection = useTemplateRef('turnSection')
const moveStep = useTemplateRef('moveStep')
const buildStep = useTemplateRef('buildStep')

// With each new turn or step: fold or unfold step 1, unfold "This turn" if
// the player had folded it, then bring the step now on into sight. After the
// page has updated, so the section is there to unfold on the first turn
// after a computer player's (whose turn shows no steps); and the scroll
// waits one more update, for the unfolding to show — an element that is
// folded away cannot be scrolled to.
watch(
  turnStep,
  async () => {
    isMoveStepOpen.value = activeStep.value === 'move'
    turnSection.value?.expand()
    await nextTick()
    reveal(activeStep.value === 'move' ? moveStep.value : buildStep.value)
  },
  { flush: 'post' }
)
</script>

<template>
  <aside class="player-dock" aria-label="Your turn">
    <PlayerCard />

    <div class="player-dock__body">
      <!-- The game is over: who won -->
      <div v-if="isOver" class="player-dock__over">
        <p class="title is-5 mb-2">{{ winner?.name ?? 'Someone' }} has won!</p>
        <button class="button is-primary is-small" @click="emit('show-results')">
          See the final standings
        </button>
      </div>

      <!-- A computer player's turn: it plays by itself -->
      <div v-else-if="isBotTurn" class="player-dock__bot-turn">
        <span class="icon"><i class="fas fa-robot" aria-hidden="true"></i></span>
        <span>{{ playerStore.activePlayer.name }} is taking their turn…</span>
      </div>

      <template v-else>
        <TrainPanel />

        <CollapsibleSection ref="turnSection" title="This turn" storage-key="dock_turn">
          <!-- Opening rounds: no train movement, so no step 1 -->
          <p v-if="isBuildingRound" class="turn-steps__opening">
            Building round: lay track to get started. Trains start running in round
            {{ gameRules.buildingRounds + 1 }}.
          </p>

          <ol class="turn-steps">
            <!-- Step 1: move the train. Its heading folds it; once the turn is
                 on to building, a tick stands in for its number. -->
            <li
              v-if="!isBuildingRound"
              ref="moveStep"
              class="turn-step"
              :class="{ 'turn-step--active': activeStep === 'move' }"
            >
              <button
                class="turn-step__heading turn-step__toggle"
                :aria-expanded="isMoveStepOpen"
                @click="isMoveStepOpen = !isMoveStepOpen"
              >
                <span class="turn-step__number">
                  <template v-if="activeStep === 'move'">1</template>
                  <template v-else>
                    <i class="fas fa-check" aria-hidden="true"></i>
                    <span class="is-sr-only">1, done:</span>
                  </template>
                </span>
                <span>Move your train</span>
                <span class="icon turn-step__chevron" aria-hidden="true">
                  <i class="fas" :class="isMoveStepOpen ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
                </span>
              </button>
              <p v-if="isMoveStepOpen" class="turn-step__note">
                Run it along the track, stopping in towns to pick up and deliver. Do this before you
                build.
              </p>
              <MoveControls :collapsed="!isMoveStepOpen" />
            </li>

            <!-- Step 2: build or upgrade -->
            <li
              ref="buildStep"
              class="turn-step"
              :class="{ 'turn-step--active': activeStep === 'build' }"
            >
              <div class="turn-step__heading">
                <span class="turn-step__number">{{ isBuildingRound ? 1 : 2 }}</span>
                <span>Build track <em>or</em> upgrade your train</span>
              </div>

              <div class="buttons has-addons turn-step__choice" role="group">
                <button
                  class="button is-small"
                  :class="{ 'is-selected is-primary': spendOn === 'build' }"
                  :aria-pressed="spendOn === 'build'"
                  @click="spendOn = 'build'"
                >
                  Build track
                </button>
                <button
                  class="button is-small"
                  :class="{ 'is-selected is-primary': spendOn === 'upgrade' }"
                  :aria-pressed="spendOn === 'upgrade'"
                  @click="spendOn = 'upgrade'"
                >
                  Upgrade train
                </button>
              </div>

              <!-- v-show, so each side keeps its last report while the other shows -->
              <BuildControls v-show="spendOn === 'build'" />
              <UpgradeControls v-show="spendOn === 'upgrade'" />
            </li>
          </ol>
        </CollapsibleSection>
      </template>

      <!-- What every player has done, the latest first -->
      <TurnHistory />
    </div>

    <footer v-if="!isOver && !isBotTurn" class="player-dock__footer">
      <button class="button is-primary is-medium is-fullwidth" @click="finishTurn">End turn</button>
      <p v-if="nextPlayer" class="player-dock__next">
        Next up: {{ nextPlayer.name }}{{ playsAgain ? ' again' : '' }}
      </p>
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

/* The note that stands in for the movement step in the opening rounds */
.turn-steps__opening {
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
  color: var(--bulma-text-weak);
}

.turn-steps {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  list-style: none;
}

/* Each step reaches out to the dock's edges, so the bar marking the step the
   player is on sits at the very edge. Every step carries the bar's room, in
   a clear color, so nothing shifts as the highlight moves from one to the
   next. */
.turn-step {
  margin: 0 -1rem;
  padding: 0.6rem 1rem 0.75rem calc(1rem - 4px);
  border-left: 4px solid transparent;
}

/* The step the player is on: a bar down its side, and a light wash of the
   same color. Mixed with transparent, so the wash suits light and dark mode
   alike. */
.turn-step--active {
  border-left-color: var(--bulma-primary);
  background: color-mix(in srgb, var(--bulma-primary) 10%, transparent);
}

.turn-step__heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
}

/* Step 1's heading folds the step: a plain heading that happens to be a
   button, across the whole width so it is an easy target */
.turn-step__toggle {
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.turn-step__chevron {
  margin-left: auto;
  color: var(--bulma-text-weak);
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
  margin: 0.25rem 0 0.5rem;
  padding-left: 2rem;
  font-size: 0.85rem;
  color: var(--bulma-text-weak);
}

.turn-step__choice {
  margin: 0.6rem 0 0.75rem;
}

/* Where the steps were, on a computer player's turn */
.player-dock__bot-turn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  font-weight: 700;
}

/* Where the steps were, once the game is over */
.player-dock__over {
  padding: 1rem;
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
