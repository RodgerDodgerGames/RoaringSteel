/**
 * Network Store (network.js)
 *
 * The track and towns as one rail network (see composables/network.js),
 * built once and shared by everything that reads it: the trains running on
 * it, and the victory check counting the major cities it joins. Rebuilt
 * whenever track is built or torn up, or the towns change.
 *
 * @module stores/network
 */

import { defineStore } from 'pinia'
import { computed } from 'vue'
import { buildNetwork } from '@/composables/network'
import { useTownsStore } from './towns'
import { useTrackStore } from './track'

export const useNetworkStore = defineStore('network', () => {
  const townsStore = useTownsStore()
  const trackStore = useTrackStore()

  /** The rail network (see `buildNetwork`) */
  const network = computed(() => buildNetwork(trackStore.segments, townsStore.towns))

  return { network }
})
