import { Chip } from '@mui/material';
import { currencyLabel } from '../../utils/currencyConversion';

/**
 * A compact chip shown next to a base-currency total that was aggregated from
 * more than one original currency. When `currencies` are provided it shows
 * their short symbols joined by "/" (e.g. "$/Br"), otherwise falls back to
 * "Mix" as a generic indicator.
 */
export default function MixedCurrencyChip({ currencies, ...rest }) {
  // Build a short label from currency symbols: "$", "Br", "€", etc.
  // currencyLabel already converts ETB → "Br" and keeps others as ISO or symbol.
  let label = 'Mix';
  if (currencies && currencies.length > 1) {
    // Get the short symbol for each currency (e.g. USD → "$", ETB → "Br")
    const symbols = currencies.map((c) => {
      const cl = currencyLabel(c);
      // currencyLabel returns ISO code for most; try to get the narrow symbol
      if (cl === c && /^[A-Z]{3}$/.test(c)) {
        try {
          const sym = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: c,
            currencyDisplay: 'narrowSymbol',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })
            .format(0)
            .replace(/[\d\s]/g, '');
          return sym || cl;
        } catch {
          return cl;
        }
      }
      return cl;
    });
    label = symbols.join('/');
  }

  return (
    <Chip
      label={label}
      size="small"
      sx={{ height: 18, fontSize: '0.65rem' }}
      color="default"
      variant="outlined"
      {...rest}
    />
  );
}
