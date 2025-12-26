import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as accountsApi from '../../lib/api/accounts'
import { calculateAccountBalance, calculateAllAccountBalances } from '../../utils/accountBalance'

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

// Recalculate balance for a specific account from transactions
export const recalculateAccountBalance = createAsyncThunk(
  'accounts/recalculateAccountBalance',
  async ({ accountId, transactions }, { getState, rejectWithValue }) => {
    try {
      const state = getState()
      const account = state.accounts.accounts.find(acc => acc.account_id === accountId)
      if (!account) {
        return rejectWithValue('Account not found')
      }
      
      const accountTransactions = (transactions || state.transactions.allTransactions || []).filter(
        (txn) =>
          txn.account_id === accountId &&
          !txn.deleted_at &&
          txn.status !== 'Cancelled'
      )
      
      const balance = calculateAccountBalance(account.opening_balance, accountTransactions)
      
      return {
        account_id: account.account_id,
        name: account.name,
        opening_balance: account.opening_balance,
        current_balance: balance,
        currency: account.currency,
        last_updated: new Date().toISOString(),
      }
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

// Recalculate all account balances from transactions
export const recalculateAllBalances = createAsyncThunk(
  'accounts/recalculateAllBalances',
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState()
      const accounts = state.accounts.accounts
      const transactions = state.transactions.allTransactions || []
      
      const balances = calculateAllAccountBalances(accounts, transactions)
      return balances
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
    // Calculate balances from transactions
    calculateBalancesFromTransactions: (state, action) => {
      const { transactions } = action.payload
      const balances = calculateAllAccountBalances(state.accounts, transactions)
      state.balances = balances
    },
    // Set balances directly (used during initialization)
    setBalances: (state, action) => {
      state.balances = action.payload
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
        const newAccount = action.payload
        state.accounts.push(newAccount)
        
        // Calculate and store balance immediately for new account
        // For new accounts with no transactions, balance equals opening balance
        const balance = calculateAccountBalance(newAccount.opening_balance, [])
        state.balances[newAccount.account_id] = {
          account_id: newAccount.account_id,
          name: newAccount.name,
          opening_balance: newAccount.opening_balance,
          current_balance: balance,
          currency: newAccount.currency,
          last_updated: new Date().toISOString(),
        }
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
      // Recalculate account balance
      .addCase(recalculateAccountBalance.fulfilled, (state, action) => {
        state.balances[action.payload.account_id] = action.payload
      })
      // Recalculate all balances
      .addCase(recalculateAllBalances.fulfilled, (state, action) => {
        state.balances = action.payload
      })
      // Listen to transaction actions to recalculate balances
      .addMatcher(
        (action) => 
          action.type === 'transactions/createTransaction/fulfilled' ||
          action.type === 'transactions/updateTransaction/fulfilled' ||
          action.type === 'transactions/deleteTransaction/fulfilled' ||
          action.type === 'transactions/batchCreateTransactions/fulfilled',
        (state, action) => {
          // Balance will be recalculated by the component/listener
          // This matcher is here for future use if needed
        }
      )
  },
})

export const { clearError, clearCurrentAccount, calculateBalancesFromTransactions, setBalances } = accountsSlice.actions
export default accountsSlice.reducer

