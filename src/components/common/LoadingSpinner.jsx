import { CircularProgress, Box } from '@mui/material'

function LoadingSpinner({ size = 40, fullScreen = false }) {
  if (fullScreen) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <CircularProgress size={size} />
      </Box>
    )
  }

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        p: 3,
      }}
    >
      <CircularProgress size={size} />
    </Box>
  )
}

export default LoadingSpinner

