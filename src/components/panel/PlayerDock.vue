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
  4. End Turn, pinned to the bottom so it is always in the same place, with
     the option of throwing in the hand of demand cards instead of a turn

  Once someone has won, the steps give way to who won, and a button to see
  the final standings again.

  On a computer player's turn there is nothing for a person to do: the
  steps and End Turn give way to a note that the computer player is taking
  its turn (it plays and ends it by itself — see useBotRunner). Whenever
  there are computer players, what each did on its last turn is listed too,
  so the people at the table can catch up on what happened while they
  waited.

  The middle scrolls on its own if it outgrows the window, so the player card
  and End Turn never leave the screen.

  @emits show-results - The player wants to see the final standings
-->

<script setup>
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import PlayerCard from '@/components/panel/PlayerCard.vue'
import TrainPanel from '@/components/panel/TrainPanel.vue'
import CollapsibleSection from '@/components/CollapsibleSection.vue'
import MoveControls from '@/components/panel/MoveControls.vue'
import BuildControls from '@/components/panel/BuildControls.vue'
import UpgradeControls from '@/components/panel/UpgradeControls.vue'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/players'
import { useBotsStore } from '@/stores/bots'
import { useTurn } from '@/composables/useTurn'
import { gameRules } from '@/config/game'

const emit = defineEmits(['show-results'])

const gameStore = useGameStore()
const { isBuildingRound, isOver, winnerId } = storeToRefs(gameStore)
const playerStore = usePlayerStore()
const { nextPlayer, playsAgain, endTurn, canDiscardHand, discardHand } = useTurn()

/** Whether the turn is a computer player's, which plays itself */
const isBotTurn = computed(() => playerStore.activePlayer?.isBot === true)

/** Each computer player's last turn, the latest first */
const { reports: botReports } = storeToRefs(useBotsStore())

/** A player's name, by id */
const nameOf = (playerId) => playerStore.players.find((p) => p.id === playerId)?.name ?? ''

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

/**
 * Throws in the hand for a new one, after making sure: it costs the whole
 * turn and cannot be undone.
 */
function confirmDiscardHand() {
  if (window.confirm('Throw in all your demand cards for three new ones? This ends your turn.')) {
    discardHand()
  }
}
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

        <CollapsibleSection title="This turn" storage-key="dock_turn">
          <!-- Opening rounds: no train movement, so no step 1 -->
          <p v-if="isBuildingRound" class="turn-steps__opening">
            Building round: lay track to get started. Trains start running in round
            {{ gameRules.buildingRounds + 1 }}.
          </p>

          <ol class="turn-steps">
            <!-- Step 1: move the train -->
            <li v-if="!isBuildingRound" class="turn-step">
              <div class="turn-step__heading">
                <span class="turn-step__number">1</span>
                <span>Move your train</span>
              </div>
              <p class="turn-step__note">
                Run it along the track, stopping in towns to pick up and deliver. Do this before you
                build.
              </p>
              <MoveControls />
            </li>

            <!-- Step 2: build or upgrade -->
            <li class="turn-step">
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

      <!-- What the computer players did last -->
      <CollapsibleSection v-if="botReports.length" title="Computer players" storage-key="dock_bots">
        <ul class="bot-reports">
          <li v-for="report in botReports" :key="report.playerId" class="bot-report">
            <span class="bot-report__round">Round {{ report.round + 1 }}</span>
            {{ report.summary }}
            <span
              v-if="report.hadProblem"
              class="bot-report__problem"
              :title="`The rules refused something ${nameOf(report.playerId)} tried; see the browser console.`"
            >
              (hit a problem)
            </span>
          </li>
        </ul>
      </CollapsibleSection>
    </div>

    <footer v-if="!isOver && !isBotTurn" class="player-dock__footer">
      <button class="button is-primary is-medium is-fullwidth" @click="endTurn">End turn</button>
      <p v-if="nextPlayer" class="player-dock__next">
        Next up: {{ nextPlayer.name }}{{ playsAgain ? ' again' : '' }}
      </p>
      <button
        v-if="canDiscardHand"
        class="button is-text is-small is-fullwidth mt-1"
        title="Instead of taking a turn, swap all your demand cards for new ones"
        @click="confirmDiscardHand"
      >
        Throw in my demand cards (ends my turn)
      </button>
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
  gap: 1rem;
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

.bot-reports {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  list-style: none;
  font-size: 0.85rem;
}

.bot-report__round {
  margin-right: 0.25rem;
  font-weight: 700;
}

.bot-report__problem {
  color: var(--bulma-danger);
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
