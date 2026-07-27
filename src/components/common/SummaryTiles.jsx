import { Fragment } from 'react';
import { Box, Divider, Typography } from '@mui/material';

/**
 * A compact at-a-glance summary: N equal columns, each a small label, a coloured
 * value, and an optional sub-caption. A per-tile trend badge (`delta`) sits
 * inline next to the label — so a tile without one (e.g. Net, which has no prior
 * period) still lines its value and sub-caption up with the others. Shared by
 * the Reports mobile summary and the Budgets overview so the read is identical.
 *
 * Values and sub-captions are pre-formatted strings; `delta` is a pre-rendered
 * node so each caller keeps its own formatting rules.
 *
 * @param {Array<{
 *   label: string,
 *   value: string,
 *   valueColor?: string,   // theme colour token for the amount
 *   sub?: string,          // caption under the value (e.g. "of 4,500 Br")
 *   delta?: React.ReactNode
 * }>} tiles
 * @param {boolean} [dividers] - vertical rule between columns
 * @param {'left'|'center'} [align] - text alignment within each tile
 * @param {object} [sx] - forwarded to the flex container
 */
export default function SummaryTiles({
  tiles,
  dividers = false,
  align = 'left',
  sx,
}) {
  if (!tiles?.length) return null;
  const center = align === 'center';
  return (
    <Box
      sx={[
        {
          display: 'flex',
          alignItems: 'stretch',
          gap: dividers ? 0 : { xs: 1.5, md: 3 },
        },
        sx,
      ]}
    >
      {tiles.map((tile, i) => (
        <Fragment key={tile.label}>
          {dividers && i > 0 && (
            <Divider
              orientation="vertical"
              flexItem
              sx={{ mx: { xs: 1, md: 2 } }}
            />
          )}
          <Box
            sx={{ flex: 1, minWidth: 0, textAlign: center ? 'center' : 'left' }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                minWidth: 0,
                justifyContent: center ? 'center' : 'flex-start',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontSize: { xs: '0.6875rem', md: '0.8125rem' },
                  color: 'text.secondary',
                }}
              >
                {tile.label}
              </Typography>
              {tile.delta && (
                <Box sx={{ fontSize: '0.6875rem', display: 'flex', minWidth: 0 }}>
                  {tile.delta}
                </Box>
              )}
            </Box>
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
          </Box>
        </Fragment>
      ))}
    </Box>
  );
}
