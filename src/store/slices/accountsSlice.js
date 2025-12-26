import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as accountsApi from '../../lib/api/accounts'

// Async thunks
export const fetchAccounts = createAsyncThunk(
  'accounts/fetchAccounts',
  async (filters, { rejectWithValue }) => {
    try {
      return await accountsApi.getAccounts(filters)
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

export const fetchAccountBalance = createAsyncThunk(
  'accounts/fetchAccountBalance',
  async (accountId, { rejectWithValue }) => {
    try {
      return await accountsApi.getAccountBalance(accountId)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

const initialState = {
  accounts: [],
  currentAccount: null,
  balances: {},
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
        state.accounts = action.payload
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
        state.accounts.push(action.payload)
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
      // Fetch account balance
      .addCase(fetchAccountBalance.fulfilled, (state, action) => {
        state.balances[action.payload.account_id] = action.payload
      })
  },
})

export const { clearError, clearCurrentAccount } = accountsSlice.actions
export default accountsSlice.reducer

