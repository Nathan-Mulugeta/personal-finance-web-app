import { configureStore } from '@reduxjs/toolkit'
import { persistStore, persistReducer } from 'redux-persist'
import storage from 'redux-persist/lib/storage'
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

// Persist config - persist all slices except auth
const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['accounts', 'categories', 'transactions', 'budgets', 'transfers', 'borrowingsLendings', 'settings', 'exchangeRates', 'appInit'],
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
})

const persistedReducer = persistReducer(persistConfig, rootReducer)

const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
})

export const persistor = persistStore(store)
export default store

