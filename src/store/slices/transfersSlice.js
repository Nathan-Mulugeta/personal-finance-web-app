import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as transfersApi from '../../lib/api/transfers'

// Async thunks
export const fetchTransfers = createAsyncThunk(
  'transfers/fetchTransfers',
  async (filters, { rejectWithValue }) => {
    try {
      return await transfersApi.getTransfers(filters)
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
  async (transferData, { rejectWithValue }) => {
    try {
      return await transfersApi.createTransfer(transferData)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const deleteTransfer = createAsyncThunk(
  'transfers/deleteTransfer',
  async (transactionId, { rejectWithValue }) => {
    try {
      await transfersApi.deleteTransfer(transactionId)
      return transactionId
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

const initialState = {
  transfers: [],
  currentTransfer: null,
  loading: false,
  error: null,
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
        state.loading = true
        state.error = null
      })
      .addCase(fetchTransfers.fulfilled, (state, action) => {
        state.loading = false
        state.transfers = action.payload
      })
      .addCase(fetchTransfers.rejected, (state, action) => {
        state.loading = false
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
        state.transfers = state.transfers.filter(t => {
          return t.transferOut?.transaction_id !== action.payload &&
                 t.transferIn?.transaction_id !== action.payload
        })
        if (state.currentTransfer?.transferOut?.transaction_id === action.payload ||
            state.currentTransfer?.transferIn?.transaction_id === action.payload) {
          state.currentTransfer = null
        }
      })
      .addCase(deleteTransfer.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  },
})

export const { clearError, clearCurrentTransfer } = transfersSlice.actions
export default transfersSlice.reducer

