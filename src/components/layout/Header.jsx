import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Avatar,
  Box,
  Fade,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
import { supabase } from '../../lib/supabase'
import { clearAuth } from '../../store/slices/authSlice'

function Header({ onMenuClick }) {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const user = useSelector((state) => state.auth.user)
  const [anchorEl, setAnchorEl] = useState(null)
  
  // Check if any slice has background loading active
  const backgroundLoading = useSelector((state) => {
    return (
      state.transactions?.backgroundLoading ||
      state.accounts?.backgroundLoading ||
      state.categories?.backgroundLoading ||
      state.budgets?.backgroundLoading ||
      state.transfers?.backgroundLoading ||
      state.borrowingsLendings?.backgroundLoading ||
      state.settings?.backgroundLoading ||
      state.exchangeRates?.backgroundLoading
    )
  })

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    dispatch(clearAuth())
    navigate('/login')
    handleMenuClose()
  }

  return (
    <AppBar 
      position="fixed" 
      sx={{ 
        zIndex: (theme) => theme.zIndex.drawer + 1,
        backgroundColor: 'white',
        color: 'text.primary',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
      }}
    >
      <Toolbar>
        <IconButton
          edge="start"
          onClick={onMenuClick}
          sx={{ mr: 2, color: 'text.primary' }}
        >
          <MenuIcon />
        </IconButton>
        <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, color: 'text.primary' }}>
          Personal Finance
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Fade in={backgroundLoading} unmountOnExit>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: 'primary.main',
                mr: 1,
              }}
            />
          </Fade>
          <Typography 
            variant="body2" 
            sx={{ 
              color: 'text.secondary',
              display: { xs: 'none', sm: 'block' },
              maxWidth: { sm: 150, md: 'none' },
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {user?.email}
          </Typography>
          <IconButton
            size="large"
            edge="end"
            onClick={handleMenuOpen}
            sx={{ color: 'text.primary' }}
          >
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'action.hover' }}>
              <AccountCircleIcon />
            </Avatar>
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <MenuItem onClick={handleLogout}>Logout</MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  )
}

export default Header

