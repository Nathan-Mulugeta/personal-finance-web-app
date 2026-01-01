import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
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
import { setUser, setSession } from '../store/slices/authSlice'
import { useAutoDismissError } from '../hooks/useAutoDismissError'

function Login() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const user = useSelector((state) => state.auth.user)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Auto-dismiss error after 8 seconds
  useAutoDismissError(setError, error)

  useEffect(() => {
    if (user) {
      navigate('/dashboard')
    }
  }, [user, navigate])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) throw authError

      dispatch(setUser(data.user))
      dispatch(setSession(data.session))
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
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
            Sign in
          </Typography>
          
          <Typography
            variant="body2"
            align="center"
            color="text.secondary"
            sx={{ mb: 3 }}
          >
            to continue to Personal Finance
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleLogin}>
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Don't have an account?{' '}
              <Link
                to="/signup"
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
                  Sign up
                </Typography>
              </Link>
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Container>
  )
}

export default Login
