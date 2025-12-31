import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as transactionsApi from '../../lib/api/transactions';
import { mergeIncrementalData, getIdField } from '../../utils/dataMerge';
import { updateLastSync } from './syncSlice';
import { deduplicatedRequest } from '../../lib/api/requestDeduplication';

// Async thunks
export const fetchTransactions = createAsyncThunk(
  'transactions/fetchTransactions',
  async (filters, { rejectWithValue, getState, dispatch }) => {
    try {
      // Get last sync timestamp for incremental fetch
      const syncState = getState().sync;
      const lastSync = syncState.lastSyncTransactions;
      const isIncremental = !!lastSync && !filters.forceFull;
      
      // Add since parameter if we have a last sync timestamp
      const fetchFilters = isIncremental 
        ? { ...filters, since: lastSync }
        : filters;
      
      // Use deduplication to prevent duplicate concurrent requests
      const data = await deduplicatedRequest(
        'transactions/getTransactions',
        fetchFilters,
        () => transactionsApi.getTransactions(fetchFilters)
      );
      
      // Update sync timestamp after successful fetch
      if (data && data.length >= 0) {
        dispatch(updateLastSync({ entity: 'transactions', timestamp: new Date().toISOString() }));
      }
      
      return { data, isIncremental };
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
      const result = await transactionsApi.deleteTransaction(transactionId);
      // API now returns { transactionId, linkedTransactionId?, deletedTransactionIds }
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const bulkDeleteTransactions = createAsyncThunk(
  'transactions/bulkDeleteTransactions',
  async (transactionIds, { rejectWithValue }) => {
    try {
      const result = await transactionsApi.bulkDeleteTransactions(transactionIds);
      // API returns { deletedTransactionIds, requestedTransactionIds }
      return result;
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
  lastLocalMutation: null, // Timestamp of last local create/update/delete to prevent realtime overwrites
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
    // Bulk delete transactions (for cascading deletes) - reducer action
    removeDeletedTransactions: (state, action) => {
      const transactionIds = Array.isArray(action.payload) ? action.payload : [action.payload];
      state.transactions = state.transactions.filter(
        (txn) => !transactionIds.includes(txn.transaction_id)
      );
      state.allTransactions = state.allTransactions.filter(
        (txn) => !transactionIds.includes(txn.transaction_id)
      );
      // Clear current transaction if it was deleted
      if (state.currentTransaction && transactionIds.includes(state.currentTransaction.transaction_id)) {
        state.currentTransaction = null;
      }
    },
    // Filter transactions client-side
    filterTransactions: (state, action) => {
      const filters = action.payload || {};
      let filtered = [...state.allTransactions];
      
      // Always filter out deleted transactions
      filtered = filtered.filter(t => !t.deleted_at);
      
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
      // Date filtering: extract date portion from TIMESTAMPTZ for comparison
      // t.date may be a full ISO timestamp like "2025-12-30T12:00:00+00:00"
      // filters use date-only strings like "2025-12-30"
      if (filters.startDate) {
        filtered = filtered.filter(t => {
          const txnDate = t.date ? t.date.split('T')[0] : '';
          return txnDate >= filters.startDate;
        });
      }
      if (filters.endDate) {
        filtered = filtered.filter(t => {
          const txnDate = t.date ? t.date.split('T')[0] : '';
          return txnDate <= filters.endDate;
        });
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
        const { data: transactions, isIncremental } = action.payload || { data: [], isIncremental: false };
        
        // If no filters, store all transactions but don't update filtered list
        const hasFilters = action.meta.arg && Object.keys(action.meta.arg).length > 0 && !action.meta.arg.forceFull;
        
        // Always merge data to preserve locally-added transactions that may not be in the fetch response yet
        // This prevents race conditions where realtime sync overwrites recently created transactions
        const shouldMerge = state.allTransactions.length > 0;
        
        if (!hasFilters) {
          if (shouldMerge) {
            state.allTransactions = mergeIncrementalData(
              state.allTransactions,
              transactions,
              getIdField('transactions')
            );
            // Remove any transactions that have deleted_at set (from incremental sync)
            state.allTransactions = state.allTransactions.filter(t => !t.deleted_at);
          } else {
            state.allTransactions = (transactions || []).filter(t => !t.deleted_at);
          }
          state.isInitialized = true;
          state.lastFetched = Date.now();
          // Don't update transactions array - let filterTransactions handle it
          // This prevents showing all transactions before filter is applied
        } else {
          // Filtered fetch - update allTransactions and transactions
          if (shouldMerge) {
            state.allTransactions = mergeIncrementalData(
              state.allTransactions,
              transactions,
              getIdField('transactions')
            );
            // Remove any transactions that have deleted_at set (from incremental sync)
            state.allTransactions = state.allTransactions.filter(t => !t.deleted_at);
          } else {
            state.allTransactions = (transactions || []).filter(t => !t.deleted_at);
          }
          state.transactions = (transactions || []).filter(t => !t.deleted_at);
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
        // Track local mutation to prevent realtime sync from overwriting
        state.lastLocalMutation = Date.now();
        
        const newTransaction = action.payload;
        const transactionId = newTransaction.transaction_id;
        
        // Check if transaction already exists to prevent duplicates
        const existsInTransactions = state.transactions.some(
          (t) => t.transaction_id === transactionId
        );
        const existsInAllTransactions = state.allTransactions.some(
          (t) => t.transaction_id === transactionId
        );
        
        // Add to filtered transactions if not already present
        if (!existsInTransactions) {
          state.transactions.push(newTransaction);
        }
        
        // Add to all transactions if not already present
        if (!existsInAllTransactions) {
          state.allTransactions.push(newTransaction);
          // Sort allTransactions by date and created_at (newest first)
          state.allTransactions.sort((a, b) => {
            const dateDiff = new Date(b.date) - new Date(a.date);
            if (dateDiff !== 0) return dateDiff;
            if (a.created_at && b.created_at) {
              return new Date(b.created_at) - new Date(a.created_at);
            }
            return 0;
          });
        }
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
        // Track local mutation to prevent realtime sync from overwriting
        state.lastLocalMutation = Date.now();
        
        const newTransactions = action.payload || [];
        
        // Filter out any transactions that already exist to prevent duplicates
        const existingTransactionIds = new Set(
          state.transactions.map((t) => t.transaction_id)
        );
        const existingAllTransactionIds = new Set(
          state.allTransactions.map((t) => t.transaction_id)
        );
        
        const uniqueForTransactions = newTransactions.filter(
          (t) => !existingTransactionIds.has(t.transaction_id)
        );
        const uniqueForAllTransactions = newTransactions.filter(
          (t) => !existingAllTransactionIds.has(t.transaction_id)
        );
        
        // Add unique transactions
        state.transactions = [...uniqueForTransactions, ...state.transactions];
        state.allTransactions = [...uniqueForAllTransactions, ...state.allTransactions];
        
        // Sort allTransactions by date and created_at (newest first)
        state.allTransactions.sort((a, b) => {
          const dateDiff = new Date(b.date) - new Date(a.date);
          if (dateDiff !== 0) return dateDiff;
          if (a.created_at && b.created_at) {
            return new Date(b.created_at) - new Date(a.created_at);
          }
          return 0;
        });
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
        // Track local mutation to prevent realtime sync from overwriting
        state.lastLocalMutation = Date.now();
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
        // Track local mutation to prevent realtime sync from overwriting
        state.lastLocalMutation = Date.now();
        // Handle new return format: { transactionId, linkedTransactionId?, deletedTransactionIds }
        // Also handle old format for backward compatibility: just transactionId string
        const payload = action.payload;
        let deletedIds;
        let mainTransactionId;
        
        if (typeof payload === 'string') {
          // Old format: just transactionId string
          deletedIds = [payload];
          mainTransactionId = payload;
        } else if (payload && typeof payload === 'object') {
          // New format: object with deletedTransactionIds or transactionId
          deletedIds = payload.deletedTransactionIds || (payload.transactionId ? [payload.transactionId] : []);
          mainTransactionId = payload.transactionId || (deletedIds.length > 0 ? deletedIds[0] : null);
        } else {
          // Fallback: treat payload as transactionId
          deletedIds = [payload];
          mainTransactionId = payload;
        }
        
        // Remove all deleted transaction IDs from both filtered and all transactions
        state.transactions = state.transactions.filter(
          (txn) => !deletedIds.includes(txn.transaction_id)
        );
        state.allTransactions = state.allTransactions.filter(
          (txn) => !deletedIds.includes(txn.transaction_id)
        );
        
        // Clear current transaction if it was deleted
        if (mainTransactionId && state.currentTransaction?.transaction_id === mainTransactionId) {
          state.currentTransaction = null;
        }
      })
      .addCase(deleteTransaction.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Bulk delete transactions
      .addCase(bulkDeleteTransactions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(bulkDeleteTransactions.fulfilled, (state, action) => {
        state.loading = false;
        // Track local mutation to prevent realtime sync from overwriting
        state.lastLocalMutation = Date.now();
        const { deletedTransactionIds } = action.payload;
        
        // Remove all deleted transaction IDs from both filtered and all transactions
        state.transactions = state.transactions.filter(
          (txn) => !deletedTransactionIds.includes(txn.transaction_id)
        );
        state.allTransactions = state.allTransactions.filter(
          (txn) => !deletedTransactionIds.includes(txn.transaction_id)
        );
        
        // Clear current transaction if it was deleted
        if (state.currentTransaction && deletedTransactionIds.includes(state.currentTransaction.transaction_id)) {
          state.currentTransaction = null;
        }
      })
      .addCase(bulkDeleteTransactions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearError, clearCurrentTransaction, optimisticUpdateTransaction, optimisticDeleteTransaction, removeDeletedTransactions, filterTransactions } =
  transactionsSlice.actions;

// Selector to get last local mutation timestamp
export const selectLastLocalMutation = (state) => state.transactions.lastLocalMutation;

export default transactionsSlice.reducer;
