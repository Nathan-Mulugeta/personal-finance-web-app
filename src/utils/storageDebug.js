/**
 * Utility functions to debug and verify IndexedDB storage
 * Use these in the browser console to check if data is being stored
 */

import localforage from 'localforage'

// redux-persist namespaces every key it writes, so the persisted state lives
// under `persist:<persistConfig.key>` — not the bare key. Reading 'root'
// silently returns null, which is what made this helper useless before.
const PERSIST_KEY = 'persist:root'

// Must mirror the persistStorage instance in store/index.js — the name and
// storeName are what identify the database, so a drift here reads an empty one.
// (store/index.js imports this module, so it can't be imported back from there.)
const storage = localforage.createInstance({
  name: 'finance-web-app',
  storeName: 'redux-persist',
})

/**
 * The persisted state, fully parsed. redux-persist stores each slice as its own
 * JSON string inside the root object, so both levels need decoding.
 *
 * @returns {Promise<Object|null>} slice name -> slice state, or null if absent
 */
async function readPersistedState() {
  const raw = await storage.getItem(PERSIST_KEY)
  if (!raw) return null

  const root = typeof raw === 'string' ? JSON.parse(raw) : raw
  const parsed = {}
  Object.entries(root).forEach(([slice, value]) => {
    try {
      parsed[slice] = typeof value === 'string' ? JSON.parse(value) : value
    } catch {
      parsed[slice] = value
    }
  })
  return parsed
}

/**
 * Check if data exists in IndexedDB storage
 * Run this in the browser console: window.checkStorage()
 *
 * @returns {Promise<{keys: string[], root: Object|null}|null>}
 */
export async function checkStorage() {
  try {
    const keys = await storage.keys()
    const root = await readPersistedState()
    return { keys, root }
  } catch (error) {
    // Surfaced rather than swallowed: a silent null here is indistinguishable
    // from "nothing stored yet", which sends you hunting in the wrong place.
    console.error('[storageDebug] checkStorage failed:', error)
    return null
  }
}

/**
 * Row counts for every array held in the persisted state — the quickest read on
 * how much data the app is actually carrying (transaction count drives most of
 * the client-side aggregation work).
 *
 * Run this in the browser console: window.getStorageCounts()
 *
 * @returns {Promise<Object|null>} e.g. { 'transactions.allTransactions': 1240, ... }
 */
export async function getStorageCounts() {
  try {
    const state = await readPersistedState()
    if (!state) {
      console.warn(`[storageDebug] nothing stored under "${PERSIST_KEY}" yet`)
      return null
    }

    const counts = {}
    Object.entries(state).forEach(([slice, sliceState]) => {
      if (!sliceState || typeof sliceState !== 'object') return
      Object.entries(sliceState).forEach(([field, value]) => {
        if (Array.isArray(value)) counts[`${slice}.${field}`] = value.length
      })
    })

    console.table(counts)
    return counts
  } catch (error) {
    console.error('[storageDebug] getStorageCounts failed:', error)
    return null
  }
}

/**
 * Get storage info
 */
export async function getStorageInfo() {
  try {
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
    console.error('[storageDebug] getStorageInfo failed:', error)
    return null
  }
}

// Make functions available globally in development
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.checkStorage = checkStorage
  window.getStorageCounts = getStorageCounts
  window.getStorageInfo = getStorageInfo
}
