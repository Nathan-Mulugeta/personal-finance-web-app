import { useDispatch, useSelector } from 'react-redux'
import { Alert, Snackbar } from '@mui/material'
import { dismissNotification } from '../../store/slices/notificationsSlice'

function AppSnackbar() {
  const dispatch = useDispatch()
  const notification = useSelector((state) => state.notifications.current)

  const handleClose = (event, reason) => {
    if (reason === 'clickaway') return
    dispatch(dismissNotification())
  }

  return (
    <Snackbar
      key={notification?.key}
      open={Boolean(notification)}
      autoHideDuration={3000}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{
        // Clear the mobile bottom navigation (56px + iOS safe area)
        bottom: {
          xs: 'calc(64px + env(safe-area-inset-bottom))',
          md: 24,
        },
      }}
    >
      <Alert
        onClose={handleClose}
        severity={notification?.severity || 'success'}
        variant="filled"
        sx={{ width: '100%' }}
      >
        {notification?.message}
      </Alert>
    </Snackbar>
  )
}

export default AppSnackbar
