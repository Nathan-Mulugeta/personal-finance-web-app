import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  Divider,
} from '@mui/material'
import { supabase } from '../lib/supabase'
import { useAutoDismissError } from '../hooks/useAutoDismissError'

function Signup() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [emailSent, setEmailSent] = useState(false)

  // Auto-dismiss error after 8 seconds
  useAutoDismissError(setError, error)

  const validateForm = () => {
    if (!email) {
      setError('Email is required')
      return false
    }
    if (!password) {
      setError('Password is required')
      return false
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return false
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return false
    }
    return true
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    setError(null)

    if (!validateForm()) return

    setLoading(true)

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (authError) throw authError

      if (data.user) {
        // Check if email confirmation is required
        if (data.user.identities && data.user.identities.length === 0) {
          setError('An account with this email already exists. Please sign in instead.')
        } else if (data.session) {
          // User is immediately signed in (email confirmation disabled in Supabase)
          navigate('/dashboard')
        } else {
          // Email confirmation required
          setEmailSent(true)
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Show email confirmation screen
  if (emailSent) {
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
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                backgroundColor: 'success.light',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
              }}
            >
              <Typography variant="h4" sx={{ color: 'success.contrastText' }}>
                ✓
              </Typography>
            </Box>
            
            <Typography component="h1" variant="h5" gutterBottom>
              Check your email
            </Typography>
            
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              We've sent a confirmation link to
            </Typography>
            
            <Typography variant="body1" fontWeight="medium" sx={{ mb: 3 }}>
              {email}
            </Typography>
            
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Click the link in the email to verify your account and complete sign up.
            </Typography>

            <Divider sx={{ my: 3 }} />

            <Typography variant="body2" color="text.secondary">
              Didn't receive the email?{' '}
              <Button
                variant="text"
                size="small"
                onClick={handleSignUp}
                disabled={loading}
                sx={{ textTransform: 'none', p: 0, minWidth: 'auto' }}
              >
                Resend
              </Button>
            </Typography>

            <Box sx={{ mt: 2 }}>
              <Link
                to="/login"
                style={{
                  color: 'inherit',
                  textDecoration: 'none',
                }}
              >
                <Typography variant="body2" color="primary">
                  Back to sign in
                </Typography>
              </Link>
            </Box>
          </Paper>
        </Box>
      </Container>
    )
  }

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
          }}
        >
          <Typography
            component="h1"
            variant="h5"
            align="center"
            gutterBottom
            sx={{ fontWeight: 500 }}
          >
            Create your account
          </Typography>
          
          <Typography
            variant="body2"
            align="center"
            color="text.secondary"
            sx={{ mb: 3 }}
          >
            Enter your details to get started
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSignUp}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              helperText="Must be at least 6 characters"
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="confirmPassword"
              label="Confirm password"
              type="password"
              id="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
            />
            
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              sx={{ mt: 3, mb: 2, py: 1.5 }}
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Sign up'}
            </Button>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Already have an account?{' '}
              <Link
                to="/login"
                style={{
                  color: 'inherit',
                  textDecoration: 'none',
                }}
              >
                <Typography
                  component="span"
                  variant="body2"
                  color="primary"
                  sx={{ fontWeight: 500 }}
                >
                  Sign in
                </Typography>
              </Link>
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Container>
  )
}

export default Signup

