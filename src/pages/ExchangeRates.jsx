import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange';
import PageSkeleton from '../components/common/PageSkeleton';
import ErrorMessage from '../components/common/ErrorMessage';
import EmptyState from '../components/common/EmptyState';
import { fetchExchangeRates } from '../store/slices/exchangeRatesSlice';
import { format } from 'date-fns';
import { usePageRefresh } from '../hooks/usePageRefresh';

function ExchangeRates() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { exchangeRates, loading, isInitialized, error } = useSelector(
    (state) => state.exchangeRates,
  );
  const [showAll, setShowAll] = useState(false);

  // Refresh data on navigation
  usePageRefresh({
    dataTypes: ['exchangeRates'],
  });

  // Sort exchange rates by date descending (most recent first)
  const sortedExchangeRates = useMemo(() => {
    if (!exchangeRates || exchangeRates.length === 0) {
      return [];
    }
    return [...exchangeRates].sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB - dateA; // Descending order
    });
  }, [exchangeRates]);

  // Limit to 10 most recent by default, or show all if showAll is true
  const displayedRates = useMemo(() => {
    if (showAll) {
      return sortedExchangeRates;
    }
    return sortedExchangeRates.slice(0, 10);
  }, [sortedExchangeRates, showAll]);

  if (loading && !isInitialized) {
    return <PageSkeleton />;
  }

  return (
    <Box>
      {/* Page Header */}
      <Box
        sx={{
          mb: { xs: 1.5, sm: 2, md: 3 },
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 1, sm: 1.5 },
        }}
      >
        <CurrencyExchangeIcon
          sx={{ fontSize: { xs: 24, sm: 28 }, color: 'primary.main' }}
        />
        <Typography
          variant="h4"
          sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, fontWeight: 500 }}
        >
          Exchange Rates
        </Typography>
      </Box>

      {error && <ErrorMessage error={error} />}

      {sortedExchangeRates.length === 0 ? (
        <EmptyState
          icon={<CurrencyExchangeIcon />}
          title="No exchange rates yet"
          subtitle="Exchange rates are automatically created when you make multi-currency transfers"
        />
      ) : (
        <>
          {/* Show All / Show Less Button */}
          {sortedExchangeRates.length > 10 && (
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setShowAll(!showAll)}
                sx={{
                  textTransform: 'none',
                  minHeight: 36,
                }}
              >
                {showAll
                  ? 'Show Less (10 Most Recent)'
                  : `Show All (${sortedExchangeRates.length} total)`}
              </Button>
            </Box>
          )}

          {/* Mobile dense-row view */}
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            {displayedRates.map((rate) => (
              <Box
                key={rate.exchange_rate_id}
                sx={{
                  py: 1.25,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{ fontSize: '0.875rem', fontWeight: 500, minWidth: 0 }}
                  >
                    {rate.from_currency} → {rate.to_currency}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontSize: '0.875rem', fontWeight: 600, flexShrink: 0 }}
                  >
                    {rate.rate?.toFixed(4) || 'N/A'}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 1,
                    mt: 0.25,
                  }}
                >
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      fontSize: '0.6875rem',
                      color: 'text.secondary',
                      minWidth: 0,
                    }}
                  >
                    {rate.date
                      ? format(new Date(rate.date), 'MMM dd, yyyy')
                      : 'N/A'}
                    {rate.description?.trim() && ` · ${rate.description.trim()}`}
                  </Typography>
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      fontSize: '0.6875rem',
                      color: 'text.secondary',
                      flexShrink: 0,
                    }}
                  >
                    {rate.from_amount !== null && rate.from_amount !== undefined
                      ? rate.from_amount.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : 'N/A'}{' '}
                    →{' '}
                    {rate.to_amount !== null && rate.to_amount !== undefined
                      ? rate.to_amount.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : 'N/A'}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>

          {/* Desktop Table View */}
          <TableContainer sx={{ display: { xs: 'none', md: 'block' } }}>
            <Table size="small">
              <TableHead>
                <TableRow
                  sx={{
                    backgroundColor: 'background.default',
                    '& th': {
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      py: 1,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    },
                  }}
                >
                  <TableCell>Date</TableCell>
                  <TableCell>From Currency</TableCell>
                  <TableCell>To Currency</TableCell>
                  <TableCell align="right">Rate</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">From Amount</TableCell>
                  <TableCell align="right">To Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayedRates.map((rate) => (
                  <TableRow
                    key={rate.exchange_rate_id}
                    hover
                    sx={{
                      '& td': {
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        py: 1,
                        fontSize: '0.875rem',
                      },
                    }}
                  >
                    <TableCell>
                      {rate.date
                        ? format(new Date(rate.date), 'MMM dd, yyyy')
                        : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        fontWeight={500}
                        sx={{ fontSize: '0.875rem' }}
                      >
                        {rate.from_currency}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        fontWeight={500}
                        sx={{ fontSize: '0.875rem' }}
                      >
                        {rate.to_currency}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        fontWeight={500}
                        sx={{ fontSize: '0.875rem' }}
                      >
                        {rate.rate?.toFixed(6) || 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                        {rate.description?.trim() || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {rate.from_amount !== null &&
                      rate.from_amount !== undefined
                        ? rate.from_amount.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : 'N/A'}
                    </TableCell>
                    <TableCell align="right">
                      {rate.to_amount !== null && rate.to_amount !== undefined
                        ? rate.to_amount.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : 'N/A'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Box>
  );
}

export default ExchangeRates;
