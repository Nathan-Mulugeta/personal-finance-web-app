import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as transactionsApi from '../../lib/api/transactions';
import { mergeIncrementalData, getIdField, getLatestSyncTimestamp } from '../../utils/dataMerge';
import { updateLastSync } from './syncSlice';
import { fetchAccounts } from './accountsSlice';
import { deduplicatedRequest } from '../../lib/api/requestDeduplication';

// Apply client-side filters + sort to produce the visible transactions list
// (exported for selectFilteredTransactions in store/selectors)
export function applyTransactionFilters(allTransactions, filters = {}) {
  let filtered = [...allTransactions];

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

  return filtered;
}

// How long fetched copies of locally-deleted transactions are ignored.
// A fetch that starts before a delete commits on the server can resolve
// after the local removal; without a tombstone the merge would resurrect
// the stale row until the next sync.
const DELETION_TOMBSTONE_TTL_MS = 60000;

// Record local deletions so in-flight fetch responses can't resurrect them
function addDeletionTombstones(state, transactionIds) {
  if (!state.recentlyDeletedIds) state.recentlyDeletedIds = {};
  const now = Date.now();
  transactionIds.forEach((id) => {
    if (id) state.recentlyDeletedIds[id] = now;
  });
}

// Drop fetched rows that were deleted locally within the tombstone TTL,
// pruning expired tombstones along the way
function filterRecentlyDeleted(state, rows) {
  if (!state.recentlyDeletedIds) state.recentlyDeletedIds = {};
  const now = Date.now();
  Object.keys(state.recentlyDeletedIds).forEach((id) => {
    if (now - state.recentlyDeletedIds[id] >= DELETION_TOMBSTONE_TTL_MS) {
      delete state.recentlyDeletedIds[id];
    }
  });
  return (rows || []).filter(
    (t) => !(t.transaction_id in state.recentlyDeletedIds)
  );
}

// Async thunks
export const fetchTransactions = createAsyncThunk(
  'transactions/fetchTransactions',
  async (filters = {}, { rejectWithValue, getState, dispatch }) => {
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

      // Advance the sync timestamp using server-side record timestamps,
      // not the client clock (which may be skewed relative to the server)
      const nextSync = getLatestSyncTimestamp(data, lastSync);
      if (nextSync) {
        dispatch(updateLastSync({ entity: 'transactions', timestamp: nextSync }));
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
  async (transactionData, { rejectWithValue, dispatch }) => {
    try {
      const result = await transactionsApi.createTransaction(transactionData);
      // Account balances change via a DB trigger; refresh them locally
      // instead of relying on the realtime echo
      dispatch(fetchAccounts({ status: 'Active' }));
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const batchCreateTransactions = createAsyncThunk(
  'transactions/batchCreateTransactions',
  async (transactionsArray, { rejectWithValue, dispatch }) => {
    try {
      const result = await transactionsApi.batchCreateTransactions(transactionsArray);
      dispatch(fetchAccounts({ status: 'Active' }));
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const updateTransaction = createAsyncThunk(
  'transactions/updateTransaction',
  async ({ transactionId, updates }, { rejectWithValue, dispatch }) => {
    try {
      const result = await transactionsApi.updateTransaction(transactionId, updates);
      dispatch(fetchAccounts({ status: 'Active' }));
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const deleteTransaction = createAsyncThunk(
  'transactions/deleteTransaction',
  async (transactionId, { rejectWithValue, dispatch }) => {
    try {
      const result = await transactionsApi.deleteTransaction(transactionId);
      // API now returns { transactionId, linkedTransactionId?, deletedTransactionIds }
      dispatch(fetchAccounts({ status: 'Active' }));
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const bulkDeleteTransactions = createAsyncThunk(
  'transactions/bulkDeleteTransactions',
  async (transactionIds, { rejectWithValue, dispatch }) => {
    try {
      const result = await transactionsApi.bulkDeleteTransactions(transactionIds);
      // API returns { deletedTransactionIds, requestedTransactionIds }
      dispatch(fetchAccounts({ status: 'Active' }));
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const bulkUpdateTransactions = createAsyncThunk(
  'transactions/bulkUpdateTransactions',
  async ({ transactionIds, updates }, { rejectWithValue, dispatch }) => {
    try {
      const result = await transactionsApi.bulkUpdateTransactions(
        transactionIds,
        updates
      );
      // API returns { updated: [...rows], failed: [...] }
      dispatch(fetchAccounts({ status: 'Active' }));
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  // The visible (filtered) list is DERIVED via selectFilteredTransactions —
  // allTransactions is the single copy of transaction data in the store
  allTransactions: [],
  activeFilters: null, // Current client-side filters (drives selectFilteredTransactions)
  recentlyDeletedIds: {}, // Tombstones: transaction_id -> deletion time (ms), see filterRecentlyDeleted
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
      const allIndex = state.allTransactions.findIndex(
        (txn) => txn.transaction_id === transactionId
      );
      if (allIndex !== -1) {
        state.allTransactions[allIndex] = { ...state.allTransactions[allIndex], ...updates };
      }
    },
    // Optimistic delete
    optimisticDeleteTransaction: (state, action) => {
      const transactionId = action.payload;
      addDeletionTombstones(state, [transactionId]);
      state.allTransactions = state.allTransactions.filter(
        (txn) => txn.transaction_id !== transactionId
      );
    },
    // Bulk delete transactions (for cascading deletes) - reducer action
    removeDeletedTransactions: (state, action) => {
      const transactionIds = Array.isArray(action.payload) ? action.payload : [action.payload];
      addDeletionTombstones(state, transactionIds);
      state.allTransactions = state.allTransactions.filter(
        (txn) => !transactionIds.includes(txn.transaction_id)
      );
      // Clear current transaction if it was deleted
      if (state.currentTransaction && transactionIds.includes(state.currentTransaction.transaction_id)) {
        state.currentTransaction = null;
      }
    },
    // Set the client-side filters; the visible list derives from them
    // via selectFilteredTransactions
    filterTransactions: (state, action) => {
      state.activeFilters = action.payload || {};
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch transactions
      .addCase(fetchTransactions.pending, (state) => {
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
        const { data } = action.payload || { data: [] };

        // Ignore rows deleted locally moments ago: a fetch that started
        // before the delete committed on the server would resurrect them
        const transactions = filterRecentlyDeleted(state, data);

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
        } else {
          // Filtered (server-side) fetch — merge into the single cache
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
        const existsInAllTransactions = state.allTransactions.some(
          (t) => t.transaction_id === transactionId
        );

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
        const existingAllTransactionIds = new Set(
          state.allTransactions.map((t) => t.transaction_id)
        );
        const uniqueForAllTransactions = newTransactions.filter(
          (t) => !existingAllTransactionIds.has(t.transaction_id)
        );
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
        
        // Remove all deleted transaction IDs from the cache
        addDeletionTombstones(state, deletedIds);
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

        // Remove all deleted transaction IDs from the cache
        addDeletionTombstones(state, deletedTransactionIds);
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
      })
      // Bulk update transactions (e.g. bulk category move)
      .addCase(bulkUpdateTransactions.fulfilled, (state, action) => {
        state.loading = false;
        state.lastLocalMutation = Date.now();
        const { updated } = action.payload || { updated: [] };
        (updated || []).forEach((txn) => {
          const index = state.allTransactions.findIndex(
            (t) => t.transaction_id === txn.transaction_id
          );
          if (index !== -1) {
            state.allTransactions[index] = txn;
          }
        });
      })
      .addCase(bulkUpdateTransactions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Cross-slice write-through: a transfer creates/deletes transaction
      // rows in the database — reflect them here immediately instead of
      // waiting for realtime or a refetch. (String action types avoid a
      // circular import with transfersSlice.)
      .addCase('transfers/createTransfer/fulfilled', (state, action) => {
        const { transferOut, transferIn } = action.payload || {};
        [transferOut, transferIn].forEach((txn) => {
          if (
            txn &&
            !state.allTransactions.some(
              (t) => t.transaction_id === txn.transaction_id
            )
          ) {
            state.allTransactions.unshift(txn);
          }
        });
        state.lastLocalMutation = Date.now();
      })
      .addCase('transfers/deleteTransfer/fulfilled', (state, action) => {
        const { transactionIds } = action.payload || {};
        if (!transactionIds || transactionIds.length === 0) return;
        state.allTransactions = state.allTransactions.filter(
          (t) => !transactionIds.includes(t.transaction_id)
        );
        state.lastLocalMutation = Date.now();
      });
  },
});

export const { clearError, clearCurrentTransaction, optimisticUpdateTransaction, optimisticDeleteTransaction, removeDeletedTransactions, filterTransactions } =
  transactionsSlice.actions;

// Selector to get last local mutation timestamp
export const selectLastLocalMutation = (state) => state.transactions.lastLocalMutation;

export default transactionsSlice.reducer;
