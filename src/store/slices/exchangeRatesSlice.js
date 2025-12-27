import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as exchangeRatesApi from '../../lib/api/exchangeRates'
import { mergeIncrementalData, getIdField } from '../../utils/dataMerge'
import { updateLastSync } from './syncSlice'

// Async thunks
export const fetchExchangeRates = createAsyncThunk(
  'exchangeRates/fetchExchangeRates',
  async (filters, { rejectWithValue, getState, dispatch }) => {
    try {
      // Get last sync timestamp for incremental fetch
      const syncState = getState().sync;
      const lastSync = syncState.lastSyncExchangeRates;
      const isIncremental = !!lastSync && !filters?.forceFull;
      
      // Add since parameter if we have a last sync timestamp
      const fetchFilters = isIncremental 
        ? { ...filters, since: lastSync }
        : filters || {};
      
      const data = await exchangeRatesApi.getExchangeRates(fetchFilters);
      
      // Update sync timestamp after successful fetch
      if (data && data.length >= 0) {
        dispatch(updateLastSync({ entity: 'exchangeRates', timestamp: new Date().toISOString() }));
      }
      
      return { data, isIncremental };
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

const initialState = {
  exchangeRates: [],
  loading: false,
  backgroundLoading: false,
  isInitialized: false,
  error: null,
}

const exchangeRatesSlice = createSlice({
  name: 'exchangeRates',
  initialState,
  reducers: {
    setExchangeRates: (state, action) => {
      state.exchangeRates = action.payload
      state.isInitialized = true
    },
    addExchangeRate: (state, action) => {
      state.exchangeRates.push(action.payload)
    },
    clearExchangeRates: (state) => {
      state.exchangeRates = []
      state.isInitialized = false
    },
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchExchangeRates.pending, (state) => {
        if (state.isInitialized) {
          state.backgroundLoading = true
        } else {
          state.loading = true
        }
        state.error = null
      })
      .addCase(fetchExchangeRates.fulfilled, (state, action) => {
        state.loading = false
        state.backgroundLoading = false
        const { data: exchangeRates, isIncremental } = action.payload || { data: [], isIncremental: false };
        
        if (isIncremental && state.exchangeRates.length > 0) {
          // Merge incremental data with existing
          state.exchangeRates = mergeIncrementalData(
            state.exchangeRates,
            exchangeRates,
            getIdField('exchangeRates')
          );
        } else {
          // Full fetch - replace all data
          state.exchangeRates = exchangeRates || [];
        }
        
        state.isInitialized = true
        state.error = null
      })
      .addCase(fetchExchangeRates.rejected, (state, action) => {
        state.loading = false
        state.backgroundLoading = false
        state.error = action.payload || 'Failed to fetch exchange rates'
      })
  },
})

export const { setExchangeRates, addExchangeRate, clearExchangeRates, clearError } = exchangeRatesSlice.actions
export default exchangeRatesSlice.reducer


