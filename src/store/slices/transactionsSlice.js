import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as transactionsApi from '../../lib/api/transactions';

// Async thunks
export const fetchTransactions = createAsyncThunk(
  'transactions/fetchTransactions',
  async (filters, { rejectWithValue }) => {
    try {
      return await transactionsApi.getTransactions(filters);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchTransaction = createAsyncThunk(
  'transactions/fetchTransaction',
  async (transactionId, { rejectWithValue }) => {
    try {
      return await transactionsApi.getTransactionById(transactionId);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const createTransaction = createAsyncThunk(
  'transactions/createTransaction',
  async (transactionData, { rejectWithValue }) => {
    try {
      return await transactionsApi.createTransaction(transactionData);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const batchCreateTransactions = createAsyncThunk(
  'transactions/batchCreateTransactions',
  async (transactionsArray, { rejectWithValue }) => {
    try {
      return await transactionsApi.batchCreateTransactions(transactionsArray);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const updateTransaction = createAsyncThunk(
  'transactions/updateTransaction',
  async ({ transactionId, updates }, { rejectWithValue }) => {
    try {
      return await transactionsApi.updateTransaction(transactionId, updates);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const deleteTransaction = createAsyncThunk(
  'transactions/deleteTransaction',
  async (transactionId, { rejectWithValue }) => {
    try {
      await transactionsApi.deleteTransaction(transactionId);
      return transactionId;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  transactions: [],
  allTransactions: [], // Cache all transactions for client-side filtering
  currentTransaction: null,
  loading: false,
  backgroundLoading: false, // For background updates
  error: null,
  lastFetched: null,
  isInitialized: false,
};

const transactionsSlice = createSlice({
  name: 'transactions',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearCurrentTransaction: (state) => {
      state.currentTransaction = null;
    },
    // Optimistic update for instant UI feedback
    optimisticUpdateTransaction: (state, action) => {
      const { transactionId, updates } = action.payload;
      const index = state.transactions.findIndex(
        (txn) => txn.transaction_id === transactionId
      );
      const allIndex = state.allTransactions.findIndex(
        (txn) => txn.transaction_id === transactionId
      );
      if (index !== -1) {
        state.transactions[index] = { ...state.transactions[index], ...updates };
      }
      if (allIndex !== -1) {
        state.allTransactions[allIndex] = { ...state.allTransactions[allIndex], ...updates };
      }
    },
    // Optimistic delete
    optimisticDeleteTransaction: (state, action) => {
      const transactionId = action.payload;
      state.transactions = state.transactions.filter(
        (txn) => txn.transaction_id !== transactionId
      );
      state.allTransactions = state.allTransactions.filter(
        (txn) => txn.transaction_id !== transactionId
      );
    },
    // Filter transactions client-side
    filterTransactions: (state, action) => {
      const filters = action.payload || {};
      let filtered = [...state.allTransactions];
      
      if (filters.accountId) {
        filtered = filtered.filter(t => t.account_id === filters.accountId);
      }
      if (filters.categoryId) {
        filtered = filtered.filter(t => t.category_id === filters.categoryId);
      }
      if (filters.type) {
        filtered = filtered.filter(t => t.type === filters.type);
      }
      if (filters.status) {
        filtered = filtered.filter(t => t.status === filters.status);
      }
      if (filters.startDate) {
        filtered = filtered.filter(t => t.date >= filters.startDate);
      }
      if (filters.endDate) {
        filtered = filtered.filter(t => t.date <= filters.endDate);
      }
      
      // Sort by date descending, then by created_at if available (newest first)
      filtered.sort((a, b) => {
        const dateDiff = new Date(b.date) - new Date(a.date);
        if (dateDiff !== 0) return dateDiff;
        // If same date, sort by created_at descending (newest first)
        if (a.created_at && b.created_at) {
          return new Date(b.created_at) - new Date(a.created_at);
        }
        return 0;
      });
      state.transactions = filtered;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch transactions
      .addCase(fetchTransactions.pending, (state, action) => {
        // Only show loading if we don't have cached data
        if (!state.isInitialized || state.allTransactions.length === 0) {
          state.loading = true;
        } else {
          state.backgroundLoading = true;
        }
        state.error = null;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        state.loading = false;
        state.backgroundLoading = false;
        // If no filters, store all transactions but don't update filtered list
        const hasFilters = action.meta.arg && Object.keys(action.meta.arg).length > 0;
        if (!hasFilters) {
          state.allTransactions = action.payload;
          state.isInitialized = true;
          state.lastFetched = Date.now();
          // Don't update transactions array - let filterTransactions handle it
          // This prevents showing all transactions before filter is applied
        } else {
          // Filtered fetch - update allTransactions and transactions
          state.allTransactions = action.payload;
          state.transactions = action.payload;
          state.isInitialized = true;
        }
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        state.loading = false;
        state.backgroundLoading = false;
        state.error = action.payload;
      })
      // Fetch transaction
      .addCase(fetchTransaction.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTransaction.fulfilled, (state, action) => {
        state.loading = false;
        state.currentTransaction = action.payload;
      })
      .addCase(fetchTransaction.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Create transaction
      .addCase(createTransaction.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createTransaction.fulfilled, (state, action) => {
        state.loading = false;
        // Add to both filtered and all transactions
        state.transactions.push(action.payload);
        state.allTransactions.push(action.payload);
        // Sort allTransactions by date and created_at (newest first)
        state.allTransactions.sort((a, b) => {
          const dateDiff = new Date(b.date) - new Date(a.date);
          if (dateDiff !== 0) return dateDiff;
          if (a.created_at && b.created_at) {
            return new Date(b.created_at) - new Date(a.created_at);
          }
          return 0;
        });
        // Re-apply filters to update transactions
      })
      .addCase(createTransaction.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Batch create transactions
      .addCase(batchCreateTransactions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(batchCreateTransactions.fulfilled, (state, action) => {
        state.loading = false;
        state.transactions = [...action.payload, ...state.transactions];
      })
      .addCase(batchCreateTransactions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Update transaction
      .addCase(updateTransaction.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateTransaction.fulfilled, (state, action) => {
        state.loading = false;
        // Update in filtered transactions
        const index = state.transactions.findIndex(
          (txn) => txn.transaction_id === action.payload.transaction_id
        );
        if (index !== -1) {
          state.transactions[index] = action.payload;
        }
        // Update in all transactions
        const allIndex = state.allTransactions.findIndex(
          (txn) => txn.transaction_id === action.payload.transaction_id
        );
        if (allIndex !== -1) {
          state.allTransactions[allIndex] = action.payload;
        }
        if (
          state.currentTransaction?.transaction_id ===
          action.payload.transaction_id
        ) {
          state.currentTransaction = action.payload;
        }
      })
      .addCase(updateTransaction.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Delete transaction
      .addCase(deleteTransaction.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteTransaction.fulfilled, (state, action) => {
        state.loading = false;
        // Remove from both filtered and all transactions
        state.transactions = state.transactions.filter(
          (txn) => txn.transaction_id !== action.payload
        );
        state.allTransactions = state.allTransactions.filter(
          (txn) => txn.transaction_id !== action.payload
        );
        if (state.currentTransaction?.transaction_id === action.payload) {
          state.currentTransaction = null;
        }
      })
      .addCase(deleteTransaction.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearError, clearCurrentTransaction, optimisticUpdateTransaction, optimisticDeleteTransaction, filterTransactions } =
  transactionsSlice.actions;
export default transactionsSlice.reducer;
