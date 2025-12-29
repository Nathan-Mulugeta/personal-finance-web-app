import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as accountsApi from '../../lib/api/accounts'
import { mergeIncrementalData, getIdField } from '../../utils/dataMerge'
import { updateLastSync } from './syncSlice'
import { deduplicatedRequest } from '../../lib/api/requestDeduplication'

// Async thunks
export const fetchAccounts = createAsyncThunk(
  'accounts/fetchAccounts',
  async (filters, { rejectWithValue, getState, dispatch }) => {
    try {
      // Get last sync timestamp for incremental fetch
      const syncState = getState().sync;
      const lastSync = syncState.lastSyncAccounts;
      const isIncremental = !!lastSync && !filters.forceFull;
      
      // Add since parameter if we have a last sync timestamp
      const fetchFilters = isIncremental 
        ? { ...filters, since: lastSync }
        : filters;
      
      // Use deduplication to prevent duplicate concurrent requests
      const data = await deduplicatedRequest(
        'accounts/getAccounts',
        fetchFilters,
        () => accountsApi.getAccounts(fetchFilters)
      );
      
      // Update sync timestamp after successful fetch
      if (data && data.length >= 0) {
        dispatch(updateLastSync({ entity: 'accounts', timestamp: new Date().toISOString() }));
      }
      
      return { data, isIncremental };
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const fetchAccount = createAsyncThunk(
  'accounts/fetchAccount',
  async (accountId, { rejectWithValue }) => {
    try {
      return await accountsApi.getAccountById(accountId)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const createAccount = createAsyncThunk(
  'accounts/createAccount',
  async (accountData, { rejectWithValue }) => {
    try {
      return await accountsApi.createAccount(accountData)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const updateAccount = createAsyncThunk(
  'accounts/updateAccount',
  async ({ accountId, updates }, { rejectWithValue }) => {
    try {
      return await accountsApi.updateAccount(accountId, updates)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const deleteAccount = createAsyncThunk(
  'accounts/deleteAccount',
  async (accountId, { rejectWithValue }) => {
    try {
      await accountsApi.deleteAccount(accountId)
      return accountId
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

// Note: Balance is now stored in account.current_balance and updated by database triggers
// No client-side balance recalculation needed

const initialState = {
  accounts: [],
  currentAccount: null,
  loading: false,
  backgroundLoading: false,
  error: null,
  isInitialized: false,
}

const accountsSlice = createSlice({
  name: 'accounts',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    clearCurrentAccount: (state) => {
      state.currentAccount = null
    },
    // Update a single account in the store (used by realtime sync)
    updateAccountInStore: (state, action) => {
      const updatedAccount = action.payload
      const index = state.accounts.findIndex(acc => acc.account_id === updatedAccount.account_id)
      if (index !== -1) {
        state.accounts[index] = updatedAccount
      } else {
        state.accounts.push(updatedAccount)
      }
    },
    // Remove an account from the store (used by realtime sync)
    removeAccountFromStore: (state, action) => {
      const accountId = action.payload
      state.accounts = state.accounts.filter(acc => acc.account_id !== accountId)
      if (state.currentAccount?.account_id === accountId) {
        state.currentAccount = null
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch accounts
      .addCase(fetchAccounts.pending, (state) => {
        if (!state.isInitialized) {
          state.loading = true
        } else {
          state.backgroundLoading = true
        }
        state.error = null
      })
      .addCase(fetchAccounts.fulfilled, (state, action) => {
        state.loading = false
        state.backgroundLoading = false
        const { data: accounts, isIncremental } = action.payload || { data: [], isIncremental: false };
        
        if (isIncremental && state.accounts.length > 0) {
          // Merge incremental data with existing
          state.accounts = mergeIncrementalData(
            state.accounts,
            accounts,
            getIdField('accounts')
          );
        } else {
          // Full fetch - replace all data
          state.accounts = accounts || [];
        }
        
        state.isInitialized = true
      })
      .addCase(fetchAccounts.rejected, (state, action) => {
        state.loading = false
        state.backgroundLoading = false
        state.error = action.payload
      })
      // Fetch account
      .addCase(fetchAccount.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchAccount.fulfilled, (state, action) => {
        state.loading = false
        state.currentAccount = action.payload
      })
      .addCase(fetchAccount.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Create account
      .addCase(createAccount.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createAccount.fulfilled, (state, action) => {
        state.loading = false
        const newAccount = action.payload
        // current_balance is set by database trigger (defaults to opening_balance for new accounts)
        state.accounts.push(newAccount)
      })
      .addCase(createAccount.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Update account
      .addCase(updateAccount.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateAccount.fulfilled, (state, action) => {
        state.loading = false
        const index = state.accounts.findIndex(acc => acc.account_id === action.payload.account_id)
        if (index !== -1) {
          state.accounts[index] = action.payload
        }
        if (state.currentAccount?.account_id === action.payload.account_id) {
          state.currentAccount = action.payload
        }
      })
      .addCase(updateAccount.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Delete account
      .addCase(deleteAccount.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteAccount.fulfilled, (state, action) => {
        state.loading = false
        state.accounts = state.accounts.filter(acc => acc.account_id !== action.payload)
        if (state.currentAccount?.account_id === action.payload) {
          state.currentAccount = null
        }
      })
      .addCase(deleteAccount.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  },
})

export const { clearError, clearCurrentAccount, updateAccountInStore, removeAccountFromStore } = accountsSlice.actions
export default accountsSlice.reducer
