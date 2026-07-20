import { useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { Box, Button, Typography } from '@mui/material'
import { supabase, setCachedUser, clearUserCache } from '../../lib/supabase'
import { setUser, setSession, setLoading, setAuthChecked } from '../../store/slices/authSlice'
import { initializeApp, clearError } from '../../store/slices/appInitSlice'
import LoadingSpinner from '../common/LoadingSpinner'
import { useRealtimeSync } from '../../hooks/useRealtimeSync'
import { useDataRefresh } from '../../hooks/useDataRefresh'

// How many times to silently retry a failed initial sync before surfacing a
// manual "Try again" screen (transient cold-start network errors self-heal)
const MAX_AUTO_RETRIES = 3

function ProtectedRoute({ children }) {
  const dispatch = useDispatch()
  const user = useSelector((state) => state.auth.user)
  const loading = useSelector((state) => state.auth.loading)
  const isAuthChecked = useSelector((state) => state.auth.isAuthChecked)
  const isInitialized = useSelector((state) => state.appInit.isInitialized)
  const isInitializing = useSelector((state) => state.appInit.isLoading)
  const initError = useSelector((state) => state.appInit.error)

  // Initialize realtime subscriptions for instant updates
  useRealtimeSync()

  // Initialize periodic data refresh (focus/background)
  useDataRefresh()

  useEffect(() => {
    const checkUser = async () => {
      dispatch(setLoading(true))
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) {
          console.warn('Error checking session:', error.message)
          dispatch(setLoading(false))
          dispatch(setAuthChecked(true))
          return
        }
        if (session) {
          dispatch(setUser(session.user))
          dispatch(setSession(session))
          // Update user cache
          setCachedUser(session.user)
        }
      } catch (error) {
        console.warn('Error in checkUser:', error.message)
      } finally {
        dispatch(setLoading(false))
        dispatch(setAuthChecked(true))
      }
    }

    // Always check auth on mount if not already checked
    if (!isAuthChecked) {
      checkUser()
    }
  }, [dispatch, isAuthChecked])

  useEffect(() => {
    let subscription = null
    try {
      const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          dispatch(setUser(session.user))
          dispatch(setSession(session))
          // Update user cache
          setCachedUser(session.user)
        } else {
          dispatch(setUser(null))
          dispatch(setSession(null))
          // Clear user cache on logout
          clearUserCache()
        }
        // Mark auth as checked after any auth state change
        dispatch(setAuthChecked(true))
      })
      subscription = authSubscription
    } catch (error) {
      console.warn('Error setting up auth state listener:', error.message)
    }

    return () => {
      if (subscription) {
        subscription.unsubscribe()
      }
    }
  }, [dispatch])

  // Initialize app data when the user is authenticated.
  // isInitialized is rehydrated from persisted storage, so on a warm app open
  // it is already true and the old `!isInitialized` guard alone would skip
  // fetching entirely, leaving the app on stale cached data. Track whether
  // this page load has fetched yet so a warm open still refreshes in the
  // background (cached data keeps rendering; no loading gate is shown).
  // Kick off the initial data fetch exactly once per page load. isInitialized
  // is rehydrated true on a warm open, so we can't gate on it — we'd skip the
  // background refresh. We also must NOT re-dispatch on failure here (that hot-
  // loops the network); retries are handled by the backoff effect below.
  const hasFetchedThisLoad = useRef(false)
  useEffect(() => {
    if (!user || isInitializing || hasFetchedThisLoad.current) return
    hasFetchedThisLoad.current = true
    dispatch(initializeApp())
  }, [user, isInitializing, dispatch])

  // Auto-retry a failed initial sync a few times with backoff. Previously a
  // single rejection (e.g. a transient network error) left the app stuck on
  // the loading spinner forever with no way forward but a manual page reload.
  const autoRetryCountRef = useRef(0)
  useEffect(() => {
    if (!user || isInitialized || isInitializing || !initError) return
    if (autoRetryCountRef.current >= MAX_AUTO_RETRIES) return
    const attempt = autoRetryCountRef.current
    const delay = 2000 * Math.pow(2, attempt) // 2s, 4s, 8s
    const timer = setTimeout(() => {
      autoRetryCountRef.current = attempt + 1
      dispatch(initializeApp())
    }, delay)
    return () => clearTimeout(timer)
  }, [user, isInitialized, isInitializing, initError, dispatch])

  const handleManualRetry = () => {
    autoRetryCountRef.current = 0
    dispatch(clearError())
    dispatch(initializeApp())
  }

  // Auth still resolving
  if (loading || !isAuthChecked) {
    return <LoadingSpinner fullScreen />
  }

  // Only redirect to login after auth has been fully checked
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Authenticated but initial data not loaded yet
  if (!isInitialized) {
    // Exhausted auto-retries and still failing → let the user retry manually
    // instead of spinning forever
    if (initError && !isInitializing && autoRetryCountRef.current >= MAX_AUTO_RETRIES) {
      return (
        <Box
          sx={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            px: 3,
            gap: 1.5,
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Couldn&apos;t load your data
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320 }}>
            Check your connection and try again. Your data is safe.
          </Typography>
          <Button variant="contained" onClick={handleManualRetry} sx={{ mt: 1 }}>
            Try again
          </Button>
        </Box>
      )
    }
    return <LoadingSpinner fullScreen />
  }

  return children
}

export default ProtectedRoute
