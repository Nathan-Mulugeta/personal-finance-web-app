import { Box, Grid, Typography } from '@mui/material';

/**
 * A compact at-a-glance summary: N equal columns, each a small label, a coloured
 * value, and an optional trend badge + sub-caption. Shared by the Reports mobile
 * summary and the Budgets overview so the "Income / Expenses / Net" read is
 * identical and dense (no wide blank gaps).
 *
 * Values and sub-captions are pre-formatted strings; `delta` is a pre-rendered
 * node (e.g. a trend badge) so each caller keeps its own formatting rules.
 *
 * @param {Array<{
 *   label: string,
 *   value: string,
 *   valueColor?: string,   // theme colour token for the amount
 *   sub?: string,          // caption under the value (e.g. "of 4,500 Br")
 *   delta?: React.ReactNode
 * }>} tiles
 * @param {object} [sx] - forwarded to the Grid container
 */
export default function SummaryTiles({ tiles, sx }) {
  if (!tiles?.length) return null;
  const columns = Math.max(1, Math.round(12 / tiles.length));
  return (
    <Grid container spacing={{ xs: 1.5, md: 3 }} sx={sx}>
      {tiles.map((tile) => (
        <Grid item xs={columns} key={tile.label} sx={{ minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{
              fontSize: { xs: '0.6875rem', md: '0.8125rem' },
              color: 'text.secondary',
            }}
          >
            {tile.label}
          </Typography>
          <Typography
            noWrap
            sx={{
              fontSize: { xs: '0.9375rem', md: '1.375rem' },
              fontWeight: 600,
              color: tile.valueColor || 'text.primary',
            }}
          >
            {tile.value}
          </Typography>
          {tile.delta && (
            <Box sx={{ fontSize: '0.6875rem', mt: 0.25 }}>{tile.delta}</Box>
          )}
          {tile.sub && (
            <Typography
              noWrap
              variant="caption"
              sx={{
                fontSize: { xs: '0.625rem', md: '0.75rem' },
                color: 'text.secondary',
                display: 'block',
              }}
            >
              {tile.sub}
            </Typography>
          )}
        </Grid>
      ))}
    </Grid>
  );
}
