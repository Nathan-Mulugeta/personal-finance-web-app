import { Chip } from '@mui/material';

/**
 * The small "Mixed currencies" marker shown next to a base-currency total that
 * was aggregated from more than one original currency. Extracted so every
 * occurrence (Reports has several, across mobile and desktop layouts) stays
 * visually identical.
 */
export default function MixedCurrencyChip(props) {
  return (
    <Chip
      label="Mixed currencies"
      size="small"
      sx={{ height: 18, fontSize: '0.65rem' }}
      color="default"
      variant="outlined"
      {...props}
    />
  );
}
