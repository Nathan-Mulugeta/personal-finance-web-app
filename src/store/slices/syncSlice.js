import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  lastSyncTransactions: null,
  lastSyncAccounts: null,
  lastSyncCategories: null,
  lastSyncBudgets: null,
  lastSyncTransfers: null,
  lastSyncBorrowingsLendings: null,
  lastSyncSettings: null,
  lastSyncExchangeRates: null,
  // Epoch ms of the last full (non-incremental) sync; used to schedule a
  // periodic full re-sync that self-heals any drift in incremental data
  lastFullSyncAt: null,
}

const syncSlice = createSlice({
  name: 'sync',
  initialState,
  reducers: {
    updateLastSync: (state, action) => {
      const { entity, timestamp } = action.payload
      const key = `lastSync${entity.charAt(0).toUpperCase() + entity.slice(1)}`
      if (key in state) {
        state[key] = timestamp
      }
    },
    markFullSync: (state, action) => {
      state.lastFullSyncAt = action.payload || Date.now()
    },
    clearLastSync: (state, action) => {
      const { entity } = action.payload
      if (entity) {
        const key = `lastSync${entity.charAt(0).toUpperCase() + entity.slice(1)}`
        if (key in state) {
          state[key] = null
        }
      } else {
        // Clear all sync timestamps
        Object.keys(state).forEach(key => {
          if (key.startsWith('lastSync')) {
            state[key] = null
          }
        })
      }
    },
  },
})

export const { updateLastSync, markFullSync, clearLastSync } = syncSlice.actions
export default syncSlice.reducer













