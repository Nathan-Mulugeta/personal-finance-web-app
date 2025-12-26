import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as exchangeRatesApi from '../../lib/api/exchangeRates'

// Async thunks
export const fetchExchangeRates = createAsyncThunk(
  'exchangeRates/fetchExchangeRates',
  async (filters, { rejectWithValue }) => {
    try {
      return await exchangeRatesApi.getExchangeRates(filters)
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
        state.exchangeRates = action.payload || []
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


