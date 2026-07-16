import { Box, Skeleton } from '@mui/material'

// Content-shaped placeholder for a page's initial load: title row with
// action buttons, a toolbar/search block, and a stack of list rows.
function PageSkeleton({ rows = 6 }) {
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: { xs: 1.5, sm: 2, md: 3 },
        }}
      >
        <Skeleton variant="text" width={150} sx={{ fontSize: '1.5rem' }} />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Skeleton variant="circular" width={36} height={36} />
          <Skeleton variant="circular" width={36} height={36} />
        </Box>
      </Box>
      <Skeleton variant="rounded" height={56} sx={{ mb: 2 }} />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} variant="rounded" height={60} sx={{ mb: 1 }} />
      ))}
    </Box>
  )
}

export default PageSkeleton
