import { createSlice } from '@reduxjs/toolkit'

// Transient UI notifications (snackbar). Intentionally NOT in the
// redux-persist whitelist — a toast should never survive a reload.
const notificationsSlice = createSlice({
  name: 'notifications',
  initialState: {
    current: null, // { key, message, severity }
  },
  reducers: {
    showNotification: {
      reducer(state, action) {
        state.current = action.payload
      },
      prepare({ message, severity = 'success' }) {
        // key forces the Snackbar to restart its auto-hide timer when a
        // new notification replaces a visible one
        return {
          payload: { key: Date.now(), message, severity },
        }
      },
    },
    dismissNotification(state) {
      state.current = null
    },
  },
})

export const { showNotification, dismissNotification } =
  notificationsSlice.actions
export default notificationsSlice.reducer
