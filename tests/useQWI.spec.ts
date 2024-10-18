import { nextTick } from 'vue'
import useQWI from '@/composables/setup/useQWI.js'
import { expect, test } from 'vitest'

// useQWI.spec.ts
// import fetch from 'node-fetch'

// test options
const options = {
  // set timeout to 30 seconds
  timeout: 30000
}

test(
  'fetches QWI data for a state',
  async () => {
    // use Minnesota('27') and Hog and Pig Farming (1122) as an example
    const { data, error, fetchQWI } = useQWI('27', 1122)

    // Call the fetchQWI function
    await fetchQWI()

    // Wait for any asynchronous updates
    await nextTick()

    // Check that the data was fetched successfully
    console.log('data:', data.value)
    console.log('error:', error.value)

    expect(data.value).toEqual(expect.any(Object))
    expect(error.value).toBeNull()
  },
  options
)
