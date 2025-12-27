/**
 * Utility to clear persisted Redux state from IndexedDB
 * This is useful when backend data is cleared and we need to reset local cache
 */

import localforage from 'localforage'

/**
 * Clear all persisted Redux state
 */
export async function clearPersistedStorage() {
  try {
    const storage = localforage.createInstance({
      name: 'finance-web-app',
      storeName: 'redux-persist',
    })
    
    await storage.clear()
    return true
  } catch (error) {
    console.error('Error clearing persisted storage:', error)
    return false
  }
}

/**
 * Check if persisted storage has data
 */
export async function hasPersistedData() {
  try {
    const storage = localforage.createInstance({
      name: 'finance-web-app',
      storeName: 'redux-persist',
    })
    
    const keys = await storage.keys()
    const root = await storage.getItem('root')
    
    return keys.length > 0 && root !== null
  } catch (error) {
    console.error('Error checking persisted storage:', error)
    return false
  }
}

