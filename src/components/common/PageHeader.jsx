import { Box, Typography } from '@mui/material';

/**
 * The standard page header row: a title on the left and an actions cluster on
 * the right. Shared so the title styling (and the header layout) is identical on
 * every page — previously each page hand-rolled this, and the title `variant`
 * drifted (h4 vs h5) even though the font size was pinned.
 *
 * The `actions` slot takes whatever that page needs (filter button, add button,
 * month/date nav, …), so page-specific controls stay flexible.
 *
 * @param {React.ReactNode} title
 * @param {React.ReactNode} [actions]
 * @param {object} [sx] - merged onto the wrapper (e.g. a page-specific margin)
 */
export default function PageHeader({ title, actions, sx }) {
  return (
    <Box
      sx={[
        {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 1,
          mb: { xs: 1.5, sm: 2, md: 3 },
        },
        sx,
      ]}
    >
      <Typography
        variant="h5"
        noWrap
        sx={{
          fontSize: { xs: '1.25rem', sm: '1.5rem' },
          fontWeight: 500,
          minWidth: 0,
        }}
      >
        {title}
      </Typography>
      {/* Page supplies its own actions cluster (as a single element), so its
          internal spacing/layout is preserved exactly. */}
      {actions}
    </Box>
  );
}
