import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as settingsApi from '../../lib/api/settings'
import { mergeIncrementalData, getIdField } from '../../utils/dataMerge'
import { updateLastSync } from './syncSlice'

// Async thunks
export const fetchSettings = createAsyncThunk(
  'settings/fetchSettings',
  async (filters, { rejectWithValue, getState, dispatch }) => {
    try {
      // Get last sync timestamp for incremental fetch
      const syncState = getState().sync;
      const lastSync = syncState.lastSyncSettings;
      const isIncremental = !!lastSync && !filters?.forceFull;
      
      // Add since parameter if we have a last sync timestamp
      const fetchFilters = isIncremental 
        ? { since: lastSync }
        : {};
      
      const data = await settingsApi.getSettings(fetchFilters);
      
      // Update sync timestamp after successful fetch
      if (data && data.length >= 0) {
        dispatch(updateLastSync({ entity: 'settings', timestamp: new Date().toISOString() }));
      }
      
      return { data, isIncremental };
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const updateSetting = createAsyncThunk(
  'settings/updateSetting',
  async ({ key, value }, { rejectWithValue }) => {
    try {
      return await settingsApi.updateSetting(key, value)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

export const updateSettings = createAsyncThunk(
  'settings/updateSettings',
  async (settingsObject, { rejectWithValue }) => {
    try {
      return await settingsApi.updateSettings(settingsObject)
    } catch (error) {
      return rejectWithValue(error.message)
    }
  }
)

const initialState = {
  settings: [],
  loading: false,
  backgroundLoading: false,
  error: null,
  isInitialized: false,
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch settings
      .addCase(fetchSettings.pending, (state) => {
        if (!state.isInitialized) {
          state.loading = true
        } else {
          state.backgroundLoading = true
        }
        state.error = null
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.loading = false
        state.backgroundLoading = false
        const { data: settings, isIncremental } = action.payload || { data: [], isIncremental: false };
        
        if (isIncremental && state.settings.length > 0) {
          // Merge incremental data with existing
          state.settings = mergeIncrementalData(
            state.settings,
            settings,
            getIdField('settings')
          );
        } else {
          // Full fetch - replace all data
          state.settings = settings || [];
        }
        
        state.isInitialized = true
      })
      .addCase(fetchSettings.rejected, (state, action) => {
        state.loading = false
        state.backgroundLoading = false
        state.error = action.payload
      })
      // Update setting
      .addCase(updateSetting.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateSetting.fulfilled, (state, action) => {
        state.loading = false
        const index = state.settings.findIndex(s => s.setting_key === action.payload.setting_key)
        if (index !== -1) {
          state.settings[index] = action.payload
        } else {
          state.settings.push(action.payload)
        }
      })
      .addCase(updateSetting.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
      // Update settings
      .addCase(updateSettings.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateSettings.fulfilled, (state, action) => {
        state.loading = false
        action.payload.forEach(updated => {
          const index = state.settings.findIndex(s => s.setting_key === updated.setting_key)
          if (index !== -1) {
            state.settings[index] = updated
          } else {
            state.settings.push(updated)
          }
        })
      })
      .addCase(updateSettings.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  },
})

export const { clearError } = settingsSlice.actions
export default settingsSlice.reducer

