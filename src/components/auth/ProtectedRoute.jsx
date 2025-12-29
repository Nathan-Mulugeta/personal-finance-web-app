import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { supabase, setCachedUser, clearUserCache } from '../../lib/supabase'
import { setUser, setSession, setLoading, setAuthChecked } from '../../store/slices/authSlice'
import { initializeApp } from '../../store/slices/appInitSlice'
import LoadingSpinner from '../common/LoadingSpinner'
import { useRealtimeSync } from '../../hooks/useRealtimeSync'
import { useDataRefresh } from '../../hooks/useDataRefresh'

function ProtectedRoute({ children }) {
  const dispatch = useDispatch()
  const user = useSelector((state) => state.auth.user)
  const loading = useSelector((state) => state.auth.loading)
  const isAuthChecked = useSelector((state) => state.auth.isAuthChecked)
  const isInitialized = useSelector((state) => state.appInit.isInitialized)
  const isInitializing = useSelector((state) => state.appInit.isLoading)

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

  // Initialize app data when user is authenticated but app is not initialized
  useEffect(() => {
    if (user && !isInitialized && !isInitializing) {
      dispatch(initializeApp())
    }
  }, [user, isInitialized, isInitializing, dispatch])

  // Show loading spinner while:
  // 1. Auth check is in progress (loading or not yet checked)
  // 2. User is authenticated but app data not yet loaded
  if (loading || !isAuthChecked || (user && !isInitialized)) {
    return <LoadingSpinner fullScreen />
  }

  // Only redirect to login after auth has been fully checked
  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default ProtectedRoute
