import { useDispatch, useSelector } from 'react-redux'
import { Box, Fade, IconButton, Snackbar, Typography } from '@mui/material'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded'
import WarningRoundedIcon from '@mui/icons-material/WarningRounded'
import InfoRoundedIcon from '@mui/icons-material/InfoRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import { dismissNotification } from '../../store/slices/notificationsSlice'

// A status icon carries the severity instead of flooding the whole toast with
// colour — the surface stays neutral, which reads quieter and themes properly.
const TONE = {
  success: { Icon: CheckCircleRoundedIcon, color: 'success.main' },
  error: { Icon: ErrorRoundedIcon, color: 'error.main' },
  warning: { Icon: WarningRoundedIcon, color: 'warning.main' },
  info: { Icon: InfoRoundedIcon, color: 'info.main' },
}

// An error is text you have to read, and often the only sign something went
// wrong; everything else is a glance.
const DURATION = { error: 6000, default: 2000 }

/**
 * The app's toast. Sized to its message rather than stretched across the
 * screen, and tapping anywhere on it dismisses — the close button is kept only
 * for errors, which linger long enough to be in the way. It fades in where it
 * sits rather than travelling, so nothing slides across the content below.
 */
function AppSnackbar() {
  const dispatch = useDispatch()
  const notification = useSelector((state) => state.notifications.current)

  const handleClose = (event, reason) => {
    if (reason === 'clickaway') return
    dispatch(dismissNotification())
  }

  const severity = notification?.severity || 'success'
  const { Icon, color } = TONE[severity] || TONE.success
  const isError = severity === 'error'

  return (
    <Snackbar
      key={notification?.key}
      open={Boolean(notification)}
      autoHideDuration={isError ? DURATION.error : DURATION.default}
      onClose={handleClose}
      TransitionComponent={Fade}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{
        // Clear the mobile bottom navigation (56px + iOS safe area)
        bottom: {
          xs: 'calc(64px + env(safe-area-inset-bottom))',
          md: 24,
        },
      }}
    >
      {/* The Snackbar root centres its child, so leaving the child to size
          itself is what keeps a five-character "Saved" from spanning the
          screen. */}
      <Box
        role="status"
        aria-live={isError ? 'assertive' : 'polite'}
        onClick={() => dispatch(dismissNotification())}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          maxWidth: 'min(92vw, 420px)',
          pl: 1.5,
          pr: isError ? 0.5 : 1.75,
          py: 1,
          borderRadius: '10px',
          cursor: 'pointer',
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Icon sx={{ fontSize: 18, color, flexShrink: 0 }} />
        <Typography
          sx={{
            fontSize: '0.8125rem',
            fontWeight: 500,
            lineHeight: 1.35,
            color: 'text.primary',
            minWidth: 0,
          }}
        >
          {notification?.message}
        </Typography>
        {isError && (
          <IconButton
            size="small"
            aria-label="Dismiss"
            onClick={handleClose}
            sx={{ color: 'text.secondary', flexShrink: 0 }}
          >
            <CloseRoundedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Box>
    </Snackbar>
  )
}

export default AppSnackbar
