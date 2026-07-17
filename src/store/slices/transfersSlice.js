import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as transfersApi from '../../lib/api/transfers'
import { mergeTransfers, getLatestSyncTimestamp } from '../../utils/dataMerge'
import { updateLastSync } from './syncSlice'
import { fetchAccounts } from './accountsSlice'

// Async thunks
export const fetchTransfers = createAsyncThunk(
  'transfers/fetchTransfers',
  async (filters = {}, { rejectWithValue, getState, dispatch }) => {
    try {
      // Get last sync timestamp for incremental fetch
      const syncState = getState().sync;
      const lastSync = syncState.lastSyncTransfers;
      const isIncremental = !!lastSync && !filters.forceFull;

      // Add since parameter if we have a last sync timestamp
      const fetchFilters = isIncremental
        ? { ...filters, since: lastSync }
        : filters;

      const data = await transfersApi.getTransfers(fetchFilters);

      // Advance the sync timestamp using server-side record timestamps,
      // not the client clock (which may be skewed relative to the server).
      // Transfers are nested { transferOut, transferIn } transaction pairs,
      // so flatten the legs before extracting timestamps.
      const transferLegs = (data || []).flatMap(
        (t) => [t.transferOut, t.transferIn].filter(Boolean)
      );
      const nextSync = getLatestSyncTimestamp(transferLegs, lastSync);
      if (nextSync) {
        dispatch(updateLastSync({ entity: 'transfers', timestamp: nextSync }));
      }

      return { data, isIncremental };
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const fetchTransfer = createAsyncThunk(
  'transfers/fetchTransfer',
  async (transferId, { rejectWithValue }) => {
    try {
      return await transfersApi.getTransferById(transferId)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const createTransfer = createAsyncThunk(
  'transfers/createTransfer',
  async (transferData, { rejectWithValue, dispatch }) => {
    try {
      const result = await transfersApi.createTransfer(transferData)
      // Account balances change via a DB trigger; refresh them locally
      // instead of relying on the realtime echo
      dispatch(fetchAccounts({ status: 'Active' }))
      return result
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const deleteTransfer = createAsyncThunk(
  'transfers/deleteTransfer',
  async (transactionId, { rejectWithValue, dispatch }) => {
    try {
      const result = await transfersApi.deleteTransfer(transactionId)
      // result is { transferId, transactionIds }
      dispatch(fetchAccounts({ status: 'Active' }))
      return result
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

const initialState = {
  transfers: [],
  currentTransfer: null,
  loading: false,
  backgroundLoading: false,
  error: null,
  isInitialized: false,
}

const transfersSlice = createSlice({
  name: 'transfers',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    clearCurrentTransfer: (state) => {
      state.currentTransfer = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch transfers
      .addCase(fetchTransfers.pending, (state) => {
        if (!state.isInitialized) {
          state.loading = true
        } else {
          state.backgroundLoading = true
        }
        state.error = null
      })
      .addCase(fetchTransfers.fulfilled, (state, action) => {
        state.loading = false
        state.backgroundLoading = false
        const { data: transfers, isIncremental } = action.payload || { data: [], isIncremental: false };
        
        if (isIncremental && state.transfers.length > 0) {
          // Merge incremental data with existing (transfers have special structure)
          state.transfers = mergeTransfers(state.transfers, transfers);
        } else {
          // Full fetch - replace all data
          state.transfers = transfers || [];
        }
        
        state.isInitialized = true
      })
      .addCase(fetchTransfers.rejected, (state, action) => {
        state.loading = false
        state.backgroundLoading = false
        state.error = action.payload
      })
      // Fetch transfer
      .addCase(fetchTransfer.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchTransfer.fulfilled, (state, action) => {
        state.loading = false
        state.currentTransfer = action.payload
      })
      .addCase(fetchTransfer.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Create transfer
      .addCase(createTransfer.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createTransfer.fulfilled, (state, action) => {
        state.loading = false
        state.transfers.unshift(action.payload)
      })
      .addCase(createTransfer.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Delete transfer
      .addCase(deleteTransfer.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteTransfer.fulfilled, (state, action) => {
        state.loading = false
        const { transferId, transactionIds } = action.payload || {}
        
        // Remove transfer from transfers array
        if (transferId) {
          state.transfers = state.transfers.filter(t => t.transferId !== transferId)
        } else {
          // Fallback: filter by transaction IDs
          state.transfers = state.transfers.filter(t => {
            const outId = t.transferOut?.transaction_id
            const inId = t.transferIn?.transaction_id
            return !transactionIds?.includes(outId) && !transactionIds?.includes(inId)
          })
        }
        
        // Clear current transfer if it was deleted
        if (state.currentTransfer) {
          const outId = state.currentTransfer.transferOut?.transaction_id
          const inId = state.currentTransfer.transferIn?.transaction_id
          if (transactionIds?.includes(outId) || transactionIds?.includes(inId)) {
            state.currentTransfer = null
          }
        }
      })
      .addCase(deleteTransfer.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Cross-slice write-through: deleting a transfer-linked transaction
      // from the transactions UI also deletes its pair — drop the transfer
      // record here immediately. (String action types avoid a circular
      // import with transactionsSlice.)
      .addCase('transactions/deleteTransaction/fulfilled', (state, action) => {
        const payload = action.payload
        const deletedIds =
          typeof payload === 'string'
            ? [payload]
            : payload?.deletedTransactionIds || []
        if (deletedIds.length === 0) return
        state.transfers = state.transfers.filter((transfer) => {
          const outId = transfer.transferOut?.transaction_id
          const inId = transfer.transferIn?.transaction_id
          return !deletedIds.includes(outId) && !deletedIds.includes(inId)
        })
      })
      .addCase('transactions/bulkDeleteTransactions/fulfilled', (state, action) => {
        const deletedIds = action.payload?.deletedTransactionIds || []
        if (deletedIds.length === 0) return
        state.transfers = state.transfers.filter((transfer) => {
          const outId = transfer.transferOut?.transaction_id
          const inId = transfer.transferIn?.transaction_id
          return !deletedIds.includes(outId) && !deletedIds.includes(inId)
        })
      })
  },
})

export const { clearError, clearCurrentTransfer } = transfersSlice.actions
export default transfersSlice.reducer

