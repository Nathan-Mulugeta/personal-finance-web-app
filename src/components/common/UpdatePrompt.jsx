import { Alert, Button, Snackbar } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useRegisterSW } from 'virtual:pwa-register/react'

// How often to ask the server whether a new build is available. Update
// checks also run when the app returns to the foreground.
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000 // 1 hour

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return

      const checkForUpdate = () => {
        // update() rejects on flaky networks; a missed check is fine
        registration.update().catch(() => {})
      }

      setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          checkForUpdate()
        }
      })
    },
  })

  return (
    <Snackbar
      open={needRefresh}
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
        severity="info"
        icon={<RefreshIcon fontSize="small" />}
        onClose={() => setNeedRefresh(false)}
        action={
          <Button
            color="inherit"
            size="small"
            onClick={() => updateServiceWorker(true)}
            sx={{ fontWeight: 600 }}
          >
            Update
          </Button>
        }
        sx={{ width: '100%', alignItems: 'center' }}
      >
        New version available
      </Alert>
    </Snackbar>
  )
}

export default UpdatePrompt
