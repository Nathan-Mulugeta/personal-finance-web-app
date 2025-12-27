import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as borrowingsLendingsApi from '../../lib/api/borrowingsLendings'
import { mergeIncrementalData, getIdField } from '../../utils/dataMerge'
import { updateLastSync } from './syncSlice'

// Async thunks
export const fetchBorrowingLendingRecords = createAsyncThunk(
  'borrowingsLendings/fetchBorrowingLendingRecords',
  async (filters, { rejectWithValue, getState, dispatch }) => {
    try {
      // Get last sync timestamp for incremental fetch
      const syncState = getState().sync;
      const lastSync = syncState.lastSyncBorrowingsLendings;
      const isIncremental = !!lastSync && !filters.forceFull;
      
      // Add since parameter if we have a last sync timestamp
      const fetchFilters = isIncremental 
        ? { ...filters, since: lastSync }
        : filters;
      
      const data = await borrowingsLendingsApi.getBorrowingLendingRecords(fetchFilters);
      
      // Update sync timestamp after successful fetch
      if (data && data.length >= 0) {
        dispatch(updateLastSync({ entity: 'borrowingsLendings', timestamp: new Date().toISOString() }));
      }
      
      return { data, isIncremental };
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const fetchBorrowingLendingRecord = createAsyncThunk(
  'borrowingsLendings/fetchBorrowingLendingRecord',
  async (recordId, { rejectWithValue }) => {
    try {
      return await borrowingsLendingsApi.getBorrowingLendingRecordById(recordId)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const createBorrowingLendingRecord = createAsyncThunk(
  'borrowingsLendings/createBorrowingLendingRecord',
  async (recordData, { rejectWithValue }) => {
    try {
      return await borrowingsLendingsApi.createBorrowingLendingRecord(recordData)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const updateBorrowingLendingRecord = createAsyncThunk(
  'borrowingsLendings/updateBorrowingLendingRecord',
  async ({ recordId, updates }, { rejectWithValue }) => {
    try {
      return await borrowingsLendingsApi.updateBorrowingLendingRecord(recordId, updates)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const recordPayment = createAsyncThunk(
  'borrowingsLendings/recordPayment',
  async ({ recordId, paymentData }, { rejectWithValue }) => {
    try {
      return await borrowingsLendingsApi.recordPayment(recordId, paymentData)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const markAsFullyPaid = createAsyncThunk(
  'borrowingsLendings/markAsFullyPaid',
  async (recordId, { rejectWithValue }) => {
    try {
      return await borrowingsLendingsApi.markAsFullyPaid(recordId)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const deleteBorrowingLendingRecord = createAsyncThunk(
  'borrowingsLendings/deleteBorrowingLendingRecord',
  async (recordId, { rejectWithValue }) => {
    try {
      await borrowingsLendingsApi.deleteBorrowingLendingRecord(recordId)
      return recordId
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const fetchSummary = createAsyncThunk(
  'borrowingsLendings/fetchSummary',
  async (filters, { rejectWithValue }) => {
    try {
      return await borrowingsLendingsApi.getBorrowingLendingSummary(filters)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

const initialState = {
  records: [],
  currentRecord: null,
  summary: null,
  loading: false,
  backgroundLoading: false,
  error: null,
  isInitialized: false,
}

const borrowingsLendingsSlice = createSlice({
  name: 'borrowingsLendings',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    clearCurrentRecord: (state) => {
      state.currentRecord = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch records
      .addCase(fetchBorrowingLendingRecords.pending, (state) => {
        if (!state.isInitialized) {
          state.loading = true
        } else {
          state.backgroundLoading = true
        }
        state.error = null
      })
      .addCase(fetchBorrowingLendingRecords.fulfilled, (state, action) => {
        state.loading = false
        state.backgroundLoading = false
        const { data: records, isIncremental } = action.payload || { data: [], isIncremental: false };
        
        if (isIncremental && state.records.length > 0) {
          // Merge incremental data with existing
          state.records = mergeIncrementalData(
            state.records,
            records,
            getIdField('borrowingsLendings')
          );
        } else {
          // Full fetch - replace all data
          state.records = records || [];
        }
        
        state.isInitialized = true
      })
      .addCase(fetchBorrowingLendingRecords.rejected, (state, action) => {
        state.loading = false
        state.backgroundLoading = false
        state.error = action.payload
      })
      // Fetch record
      .addCase(fetchBorrowingLendingRecord.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchBorrowingLendingRecord.fulfilled, (state, action) => {
        state.loading = false
        state.currentRecord = action.payload
      })
      .addCase(fetchBorrowingLendingRecord.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Create record
      .addCase(createBorrowingLendingRecord.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createBorrowingLendingRecord.fulfilled, (state, action) => {
        state.loading = false
        state.records.unshift(action.payload)
      })
      .addCase(createBorrowingLendingRecord.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Update record
      .addCase(updateBorrowingLendingRecord.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateBorrowingLendingRecord.fulfilled, (state, action) => {
        state.loading = false
        const index = state.records.findIndex(rec => rec.record_id === action.payload.record_id)
        if (index !== -1) {
          state.records[index] = action.payload
        }
        if (state.currentRecord?.record_id === action.payload.record_id) {
          state.currentRecord = action.payload
        }
      })
      .addCase(updateBorrowingLendingRecord.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Record payment
      .addCase(recordPayment.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(recordPayment.fulfilled, (state, action) => {
        state.loading = false
        const index = state.records.findIndex(rec => rec.record_id === action.payload.record.record_id)
        if (index !== -1) {
          state.records[index] = action.payload.record
        }
        if (state.currentRecord?.record_id === action.payload.record.record_id) {
          state.currentRecord = action.payload.record
        }
      })
      .addCase(recordPayment.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Mark as fully paid
      .addCase(markAsFullyPaid.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(markAsFullyPaid.fulfilled, (state, action) => {
        state.loading = false
        const index = state.records.findIndex(rec => rec.record_id === action.payload.record_id)
        if (index !== -1) {
          state.records[index] = action.payload
        }
        if (state.currentRecord?.record_id === action.payload.record_id) {
          state.currentRecord = action.payload
        }
      })
      .addCase(markAsFullyPaid.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Delete record
      .addCase(deleteBorrowingLendingRecord.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteBorrowingLendingRecord.fulfilled, (state, action) => {
        state.loading = false
        state.records = state.records.filter(rec => rec.record_id !== action.payload)
        if (state.currentRecord?.record_id === action.payload) {
          state.currentRecord = null
        }
      })
      .addCase(deleteBorrowingLendingRecord.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Fetch summary
      .addCase(fetchSummary.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchSummary.fulfilled, (state, action) => {
        state.loading = false
        state.summary = action.payload
      })
      .addCase(fetchSummary.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  },
})

export const { clearError, clearCurrentRecord } = borrowingsLendingsSlice.actions
export default borrowingsLendingsSlice.reducer

