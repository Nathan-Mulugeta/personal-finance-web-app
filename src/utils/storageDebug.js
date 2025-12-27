/**
 * Utility functions to debug and verify IndexedDB storage
 * Use these in the browser console to check if data is being stored
 */

import localforage from 'localforage'

/**
 * Check if data exists in IndexedDB storage
 * Run this in the browser console: window.checkStorage()
 */
export async function checkStorage() {
  try {
    const storage = localforage.createInstance({
      name: 'finance-web-app',
      storeName: 'redux-persist',
    })
    
    const keys = await storage.keys()
    
    for (const key of keys) {
      await storage.getItem(key)
    }
    
    // Check the root key specifically
    const root = await storage.getItem('root')
    
    return { keys, root }
  } catch (error) {
    return null
  }
}

/**
 * Get storage info
 */
export async function getStorageInfo() {
  try {
    const storage = localforage.createInstance({
      name: 'finance-web-app',
      storeName: 'redux-persist',
    })
    
    await storage.ready()
    const driver = storage.driver()
    const keys = await storage.keys()
    
    return {
      driver,
      databaseName: 'finance-web-app',
      storeName: 'redux-persist',
      keyCount: keys.length,
      keys,
    }
  } catch (error) {
    return null
  }
}

// Make functions available globally in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.checkStorage = checkStorage
  window.getStorageInfo = getStorageInfo
}

