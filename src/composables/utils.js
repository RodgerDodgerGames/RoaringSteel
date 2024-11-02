export function waitRandomly(minWaitTime = 500, maxWaitTime = 2000) {
  const waitTime = Math.floor(Math.random() * (maxWaitTime - minWaitTime)) + minWaitTime
  return new Promise((resolve) => setTimeout(resolve, waitTime))
}

// Define formatCurrency function
export const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0
  }).format(value)
}
