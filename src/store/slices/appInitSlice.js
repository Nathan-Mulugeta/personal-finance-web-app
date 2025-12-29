import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { fetchAccounts } from './accountsSlice'
import { fetchTransactions } from './transactionsSlice'
import { fetchCategories } from './categoriesSlice'
import { fetchBudgets } from './budgetsSlice'
import { fetchTransfers } from './transfersSlice'
import { fetchBorrowingLendingRecords } from './borrowingsLendingsSlice'
import { fetchSettings } from './settingsSlice'
import { setExchangeRates } from './exchangeRatesSlice'
import * as exchangeRatesApi from '../../lib/api/exchangeRates'
import { clearPersistedStorage, hasPersistedData } from '../../utils/clearPersistedStorage'

// Initialize app - fetch all data in parallel
export const initializeApp = createAsyncThunk(
  'appInit/initializeApp',
  async (_, { dispatch, rejectWithValue, getState }) => {
    try {
      // Check if we have persisted data before fetching
      const hasPersisted = await hasPersistedData()
      
      // Fetch all data in parallel
      // Note: Account balances are now stored in account.current_balance
      // and updated automatically by database triggers
      const [
        accountsResult,
        transactionsResult,
        categoriesResult,
        budgetsResult,
        transfersResult,
        borrowingsLendingsResult,
        settingsResult,
        exchangeRates,
      ] = await Promise.all([
        dispatch(fetchAccounts({ status: 'Active' })),
        dispatch(fetchTransactions({})),
        dispatch(fetchCategories({})),
        dispatch(fetchBudgets({})),
        dispatch(fetchTransfers({})),
        dispatch(fetchBorrowingLendingRecords({})),
        dispatch(fetchSettings()),
        exchangeRatesApi.getExchangeRates({}),
      ])

      // Extract data from fulfilled actions (new format: { data, isIncremental })
      const accounts = (accountsResult.payload?.data || accountsResult.payload) || []
      const transactions = (transactionsResult.payload?.data || transactionsResult.payload) || []
      const categories = (categoriesResult.payload?.data || categoriesResult.payload) || []
      const budgets = (budgetsResult.payload?.data || budgetsResult.payload) || []
      const transfers = (transfersResult.payload?.data || transfersResult.payload) || []
      const borrowingsLendings = (borrowingsLendingsResult.payload?.data || borrowingsLendingsResult.payload) || []
      const settings = (settingsResult.payload?.data || settingsResult.payload) || []

      // Detect if backend is empty but we have persisted data
      const state = getState()
      const isFirstInit = !state.appInit.isInitialized
      
      if (isFirstInit) {
        const backendIsEmpty = 
          accounts.length === 0 &&
          transactions.length === 0 &&
          categories.length === 0 &&
          budgets.length === 0 &&
          transfers.length === 0 &&
          borrowingsLendings.length === 0

        if (backendIsEmpty && hasPersisted) {
          // Backend is empty but we have cached data - clear the cache
          await clearPersistedStorage()
          
          // Reload the page to rehydrate with empty state
          window.location.reload()
          return rejectWithValue('Backend cleared, reloading...')
        }
      }
      
      // Store exchange rates
      dispatch(setExchangeRates(exchangeRates || []))

      return {
        accounts,
        transactions,
        categories,
        budgets,
        transfers,
        borrowingsLendings,
        settings,
        exchangeRates,
      }
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

const initialState = {
  isInitialized: false,
  isLoading: false,
  error: null,
}

const appInitSlice = createSlice({
  name: 'appInit',
  initialState,
  reducers: {
    resetInitialization: (state) => {
      state.isInitialized = false
      state.error = null
    },
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeApp.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(initializeApp.fulfilled, (state) => {
        state.isLoading = false
        state.isInitialized = true
        state.error = null
      })
      .addCase(initializeApp.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload
      })
  },
})

// Manual refresh is now handled in the component by purging and reloading
export const manualRefresh = createAsyncThunk(
  'appInit/manualRefresh',
  async (_, { dispatch, rejectWithValue }) => {
    try {
      // Reset initialization state
      dispatch(resetInitialization())
      
      // Reinitialize app (will fetch fresh data from backend)
      await dispatch(initializeApp())
      
      return { success: true }
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const { resetInitialization, clearError } = appInitSlice.actions
export default appInitSlice.reducer
