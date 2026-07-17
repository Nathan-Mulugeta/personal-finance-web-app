import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  AppBar,
  Toolbar,
  Typography,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Avatar,
  Box,
  Fade,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness'
import SettingsIcon from '@mui/icons-material/Settings'
import RefreshIcon from '@mui/icons-material/Refresh'
import LogoutIcon from '@mui/icons-material/Logout'
import { supabase } from '../../lib/supabase'
import { clearAuth } from '../../store/slices/authSlice'
import { persistor } from '../../store'
import { useColorMode } from '../../theme'

const APPEARANCE_OPTIONS = [
  { value: 'light', label: 'Light', icon: <LightModeIcon fontSize="small" /> },
  { value: 'dark', label: 'Dark', icon: <DarkModeIcon fontSize="small" /> },
  {
    value: 'system',
    label: 'System',
    icon: <SettingsBrightnessIcon fontSize="small" />,
  },
]

function Header({ onMenuClick }) {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const user = useSelector((state) => state.auth.user)
  const [anchorEl, setAnchorEl] = useState(null)
  const [appearanceAnchorEl, setAppearanceAnchorEl] = useState(null)
  const { mode, resolvedMode, setMode } = useColorMode()
  
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

  // Same recovery as the Settings page's Refresh Data button: wipe the
  // persisted store and reload so everything refetches from scratch
  const handleRefreshData = async () => {
    try {
      await persistor.purge()
    } finally {
      window.location.reload()
    }
  }

  return (
    <AppBar 
      position="fixed" 
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 1,
        backgroundColor: 'background.paper',
        backgroundImage: 'none',
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
          <IconButton
            onClick={(event) => setAppearanceAnchorEl(event.currentTarget)}
            sx={{ color: 'text.secondary' }}
            aria-label="Appearance"
          >
            {resolvedMode === 'dark' ? (
              <DarkModeIcon fontSize="small" />
            ) : (
              <LightModeIcon fontSize="small" />
            )}
          </IconButton>
          <Menu
            anchorEl={appearanceAnchorEl}
            open={Boolean(appearanceAnchorEl)}
            onClose={() => setAppearanceAnchorEl(null)}
          >
            {APPEARANCE_OPTIONS.map((option) => (
              <MenuItem
                key={option.value}
                selected={mode === option.value}
                onClick={() => {
                  setMode(option.value)
                  setAppearanceAnchorEl(null)
                }}
              >
                <ListItemIcon>{option.icon}</ListItemIcon>
                <ListItemText>{option.label}</ListItemText>
              </MenuItem>
            ))}
          </Menu>
          <IconButton
            size="large"
            edge="end"
            onClick={handleMenuOpen}
            sx={{ color: 'text.primary' }}
          >
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'background.paper', color: 'primary.main', border: '2px solid', borderColor: 'primary.main', fontSize: '0.875rem', fontWeight: 600 }}>
              {user?.email?.charAt(0)?.toUpperCase() || '?'}
            </Avatar>
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {user?.email}
              </Typography>
            </Box>
            <Divider sx={{ mb: 0.5 }} />
            <MenuItem
              onClick={() => {
                navigate('/settings')
                handleMenuClose()
              }}
            >
              <ListItemIcon>
                <SettingsIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Settings</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleRefreshData}>
              <ListItemIcon>
                <RefreshIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Refresh data</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Logout</ListItemText>
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  )
}

export default Header

