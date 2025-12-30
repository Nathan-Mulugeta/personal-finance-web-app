import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { Container, Paper, Typography, Box, CircularProgress, Alert } from '@mui/material'
import { supabase } from '../lib/supabase'
import { setUser, setSession } from '../store/slices/authSlice'

function AuthCallback() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [error, setError] = useState(null)

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get the session from the URL hash (Supabase redirects with tokens in hash)
        const { data, error: authError } = await supabase.auth.getSession()

        if (authError) {
          throw authError
        }

        if (data.session) {
          // Successfully authenticated
          dispatch(setUser(data.session.user))
          dispatch(setSession(data.session))
          
          // Small delay to ensure state is updated
          setTimeout(() => {
            navigate('/dashboard', { replace: true })
          }, 100)
        } else {
          // No session found, might need to exchange the token
          // Check if we have an access_token in the URL hash
          const hashParams = new URLSearchParams(window.location.hash.substring(1))
          const accessToken = hashParams.get('access_token')
          const refreshToken = hashParams.get('refresh_token')

          if (accessToken && refreshToken) {
            // Set the session manually
            const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })

            if (setSessionError) {
              throw setSessionError
            }

            if (sessionData.session) {
              dispatch(setUser(sessionData.session.user))
              dispatch(setSession(sessionData.session))
              
              setTimeout(() => {
                navigate('/dashboard', { replace: true })
              }, 100)
              return
            }
          }

          // If we still don't have a session, redirect to login
          setError('Unable to verify your email. Please try signing in.')
          setTimeout(() => {
            navigate('/login', { replace: true })
          }, 3000)
        }
      } catch (err) {
        console.error('Auth callback error:', err)
        setError(err.message || 'An error occurred during authentication')
        setTimeout(() => {
          navigate('/login', { replace: true })
        }, 3000)
      }
    }

    handleAuthCallback()
  }, [navigate, dispatch])

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Paper
          elevation={2}
          sx={{
            p: 4,
            width: '100%',
            borderRadius: 2,
            textAlign: 'center',
          }}
        >
          {error ? (
            <>
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
              <Typography variant="body2" color="text.secondary">
                Redirecting to sign in...
              </Typography>
            </>
          ) : (
            <>
              <CircularProgress size={48} sx={{ mb: 3 }} />
              <Typography component="h1" variant="h6" gutterBottom>
                Verifying your email...
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Please wait while we confirm your account.
              </Typography>
            </>
          )}
        </Paper>
      </Box>
    </Container>
  )
}

export default AuthCallback







