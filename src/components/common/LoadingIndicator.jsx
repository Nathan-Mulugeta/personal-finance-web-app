import { useSelector } from 'react-redux'
import { Box, CircularProgress, Fade } from '@mui/material'

/**
 * Subtle loading indicator that shows when any background operation is in progress
 * Appears below the header in the top-right corner and doesn't block the UI
 */
export default function LoadingIndicator() {
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

  if (!backgroundLoading) return null

  return (
    <Fade in={backgroundLoading}>
      <Box
        sx={{
          position: 'fixed',
          top: { xs: 64, sm: 72 }, // Account for header height (56px mobile, 64px desktop) + 8px spacing
          right: 16,
          zIndex: 1300, // Above most content but below modals
          pointerEvents: 'none', // Don't block clicks
        }}
      >
        <CircularProgress size={20} thickness={4} />
      </Box>
    </Fade>
  )
}

