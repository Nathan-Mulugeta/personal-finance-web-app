import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as settingsApi from '../../lib/api/settings'

// Async thunks
export const fetchSettings = createAsyncThunk(
  'settings/fetchSettings',
  async (_, { rejectWithValue }) => {
    try {
      return await settingsApi.getSettings()
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
  error: null,
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
        state.loading = true
        state.error = null
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.loading = false
        state.settings = action.payload
      })
      .addCase(fetchSettings.rejected, (state, action) => {
        state.loading = false
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

