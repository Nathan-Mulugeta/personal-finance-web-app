import { configureStore } from '@reduxjs/toolkit'
import { persistStore, persistReducer, createTransform } from 'redux-persist'
import localforage from 'localforage'
import { combineReducers } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice'
import accountsReducer from './slices/accountsSlice'
import categoriesReducer from './slices/categoriesSlice'
import transactionsReducer from './slices/transactionsSlice'
import budgetsReducer from './slices/budgetsSlice'
import transfersReducer from './slices/transfersSlice'
import borrowingsLendingsReducer from './slices/borrowingsLendingsSlice'
import settingsReducer from './slices/settingsSlice'
import exchangeRatesReducer from './slices/exchangeRatesSlice'
import appInitReducer from './slices/appInitSlice'
import syncReducer from './slices/syncSlice'
import notificationsReducer from './slices/notificationsSlice'
import { notificationsMiddleware } from './notificationsMiddleware'
import '../utils/storageDebug' // Import debug utilities

// Configure localforage to explicitly use IndexedDB
// Create a dedicated instance for redux-persist
const persistStorage = localforage.createInstance({
  name: 'finance-web-app',
  storeName: 'redux-persist',
  description: 'Finance app Redux state storage',
  driver: [
    localforage.INDEXEDDB, // Prefer IndexedDB
    localforage.WEBSQL,    // Fallback to WebSQL
    localforage.LOCALSTORAGE // Final fallback
  ],
})

// Verify IndexedDB is available
if (typeof window !== 'undefined') {
  persistStorage.ready().catch(() => {
    // Silently handle initialization errors
  })
}

// Never persist transient request flags: a `true` captured mid-flight would
// be restored on the next launch with no request in flight to clear it,
// leaving the header sync indicator stuck on. Sanitized in both directions
// so already-corrupted persisted state heals on rehydrate.
const TRANSIENT_FLAGS = ['loading', 'backgroundLoading', 'isLoading']
const resetTransientFlags = (sliceState) => {
  if (!sliceState || typeof sliceState !== 'object') return sliceState
  const flags = TRANSIENT_FLAGS.filter((flag) => sliceState[flag] === true)
  if (flags.length === 0) return sliceState
  const next = { ...sliceState }
  flags.forEach((flag) => {
    next[flag] = false
  })
  return next
}
const stripTransientFlags = createTransform(
  resetTransientFlags,
  resetTransientFlags
)

// Bump this whenever the persisted shape or sync semantics change: any
// version mismatch purges the cache and forces a clean full re-sync on the
// next launch instead of limping along on a stale/corrupted local store
const PERSIST_VERSION = 3

// Persist config - persist all slices except auth
const persistConfig = {
  key: 'root',
  version: PERSIST_VERSION,
  storage: persistStorage,
  whitelist: ['accounts', 'categories', 'transactions', 'budgets', 'transfers', 'borrowingsLendings', 'settings', 'exchangeRates', 'appInit', 'sync'],
  // Coalesce writes to at most once/sec. Without this, every state change
  // (each realtime merge, background fetch, optimistic edit) re-serializes the
  // ENTIRE persisted state — including the whole transactions array — to
  // IndexedDB, which gets progressively heavier as the dataset grows. Data is
  // server-backed and redux-persist flushes on unload, so a 1s window is safe.
  throttle: 1000,
  transforms: [stripTransientFlags],
  migrate: (state) => {
    if (!state || state._persist?.version !== PERSIST_VERSION) {
      return Promise.resolve(undefined)
    }
    return Promise.resolve(state)
  },
  // Don't persist auth to prevent stale sessions
}

const rootReducer = combineReducers({
  auth: authReducer,
  accounts: accountsReducer,
  categories: categoriesReducer,
  transactions: transactionsReducer,
  budgets: budgetsReducer,
  transfers: transfersReducer,
  borrowingsLendings: borrowingsLendingsReducer,
  settings: settingsReducer,
  exchangeRates: exchangeRatesReducer,
  appInit: appInitReducer,
  sync: syncReducer,
  // Transient — deliberately absent from the persist whitelist
  notifications: notificationsReducer,
})

const persistedReducer = persistReducer(persistConfig, rootReducer)

const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
      // Increase threshold for immutable check to avoid warnings with large state
      // This only affects development mode - production builds don't include these checks
      immutableCheck: {
        warnAfter: 128, // Increase from default 32ms to 128ms
        // Ignore large transaction arrays which can cause slow checks
        ignoredPaths: ['transactions.allTransactions', 'transactions.transactions'],
      },
    }).concat(notificationsMiddleware),
})

export const persistor = persistStore(store)
export default store

