/**
 * API call throttling utility to prevent excessive server requests
 */

interface ThrottleEntry {
  lastCall: number
  pending: boolean
}

const throttleMap = new Map<string, ThrottleEntry>()

/**
 * Throttles API calls to prevent excessive requests
 * @param key - Unique identifier for the API call
 * @param minInterval - Minimum time between calls in milliseconds
 * @returns true if call should proceed, false if throttled
 */
export const shouldThrottle = (key: string, minInterval: number): boolean => {
  const now = Date.now()
  const entry = throttleMap.get(key)
  
  if (!entry) {
    throttleMap.set(key, { lastCall: now, pending: false })
    return true
  }
  
  // If there's a pending call, throttle
  if (entry.pending) {
    return false
  }
  
  // If enough time hasn't passed, throttle
  const timeSinceLastCall = now - entry.lastCall
  if (timeSinceLastCall < minInterval) {
    return false
  }
  
  // Update last call time and mark as pending
  entry.lastCall = now
  entry.pending = true
  
  return true
}

/**
 * Marks a throttled API call as complete
 * @param key - Unique identifier for the API call
 */
export const completeThrottle = (key: string): void => {
  const entry = throttleMap.get(key)
  if (entry) {
    entry.pending = false
  }
}

/**
 * Clears throttle state (useful for testing or reset)
 */
export const clearThrottle = (key?: string): void => {
  if (key) {
    throttleMap.delete(key)
  } else {
    throttleMap.clear()
  }
}

