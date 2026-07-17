import { Box, Typography } from '@mui/material'

/**
 * Shared empty-state block: centered icon, title, subtitle, optional action.
 * Keeps the "nothing here yet" moments consistent across pages.
 *
 * @param {ReactNode} icon - an icon element, e.g. <ReceiptIcon />
 * @param {string} title
 * @param {string} [subtitle]
 * @param {ReactNode} [action] - e.g. a create Button
 */
function EmptyState({ icon, title, subtitle, action }) {
  return (
    <Box
      sx={{
        textAlign: 'center',
        py: { xs: 4, sm: 6 },
        px: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        backgroundColor: 'background.paper',
      }}
    >
      {icon && (
        <Box
          sx={{
            color: 'text.secondary',
            opacity: 0.5,
            mb: 1.5,
            '& svg': { fontSize: { xs: 44, sm: 56 } },
          }}
        >
          {icon}
        </Box>
      )}
      <Typography
        variant="h6"
        color="text.secondary"
        gutterBottom
        sx={{ fontSize: { xs: '0.9375rem', sm: '1rem' }, fontWeight: 500 }}
      >
        {title}
      </Typography>
      {subtitle && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: action ? 2 : 0, fontSize: { xs: '0.8125rem', sm: '0.875rem' } }}
        >
          {subtitle}
        </Typography>
      )}
      {action}
    </Box>
  )
}

export default EmptyState
