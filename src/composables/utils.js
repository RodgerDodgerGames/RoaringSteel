export function waitRandomly(minWaitTime = 500, maxWaitTime = 2000) {
  const waitTime = Math.floor(Math.random() * (maxWaitTime - minWaitTime)) + minWaitTime
  return new Promise((resolve) => setTimeout(resolve, waitTime))
}
