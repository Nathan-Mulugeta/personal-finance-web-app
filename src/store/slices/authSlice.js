import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  user: null,
  session: null,
  loading: true,        // Start as true to prevent flash before auth check
  isAuthChecked: false, // Track if initial auth check has completed
  error: null,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload
    },
    setSession: (state, action) => {
      state.session = action.payload
    },
    setLoading: (state, action) => {
      state.loading = action.payload
    },
    setAuthChecked: (state, action) => {
      state.isAuthChecked = action.payload
    },
    setError: (state, action) => {
      state.error = action.payload
    },
    clearAuth: (state) => {
      state.user = null
      state.session = null
      state.error = null
      state.isAuthChecked = true // Keep as checked after logout
    },
  },
})

export const { setUser, setSession, setLoading, setAuthChecked, setError, clearAuth } = authSlice.actions
export default authSlice.reducer
