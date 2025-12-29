import { configureStore } from '@reduxjs/toolkit'
import { persistStore, persistReducer } from 'redux-persist'
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

// Persist config - persist all slices except auth
const persistConfig = {
  key: 'root',
  storage: persistStorage,
  whitelist: ['accounts', 'categories', 'transactions', 'budgets', 'transfers', 'borrowingsLendings', 'settings', 'exchangeRates', 'appInit', 'sync'],
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
    }),
})

export const persistor = persistStore(store)
export default store

