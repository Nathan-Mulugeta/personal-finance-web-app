import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { supabase } from '../../lib/supabase'
import { setUser, setSession, setLoading } from '../../store/slices/authSlice'
import { initializeApp } from '../../store/slices/appInitSlice'
import LoadingSpinner from '../common/LoadingSpinner'

function ProtectedRoute({ children }) {
  const dispatch = useDispatch()
  const user = useSelector((state) => state.auth.user)
  const loading = useSelector((state) => state.auth.loading)
  const isInitialized = useSelector((state) => state.appInit.isInitialized)
  const isInitializing = useSelector((state) => state.appInit.isLoading)

  useEffect(() => {
    const checkUser = async () => {
      dispatch(setLoading(true))
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) {
          console.warn('Error checking session:', error.message)
          dispatch(setLoading(false))
          return
        }
        if (session) {
          dispatch(setUser(session.user))
          dispatch(setSession(session))
        }
      } catch (error) {
        console.warn('Error in checkUser:', error.message)
      } finally {
        dispatch(setLoading(false))
      }
    }

    if (!user) {
      checkUser()
    }
  }, [dispatch, user])

  useEffect(() => {
    let subscription = null
    try {
      const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          dispatch(setUser(session.user))
          dispatch(setSession(session))
        } else {
          dispatch(setUser(null))
          dispatch(setSession(null))
        }
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

  if (loading || (user && !isInitialized)) {
    return <LoadingSpinner fullScreen />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default ProtectedRoute

