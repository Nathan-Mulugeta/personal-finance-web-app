import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Button,
  Paper,
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
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { fetchExchangeRates } from '../store/slices/exchangeRatesSlice';
import { format } from 'date-fns';
import { usePageRefresh } from '../hooks/usePageRefresh';

function ExchangeRates() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { exchangeRates, loading, isInitialized, error } = useSelector(
    (state) => state.exchangeRates
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
    return <LoadingSpinner />;
  }

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ mb: { xs: 1.5, sm: 2, md: 3 }, display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 } }}>
        <CurrencyExchangeIcon sx={{ fontSize: { xs: 24, sm: 28 }, color: 'primary.main' }} />
        <Typography variant="h4" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, fontWeight: 500 }}>
          Exchange Rates
        </Typography>
      </Box>

      {error && <ErrorMessage error={error} />}

      {sortedExchangeRates.length === 0 ? (
        <Box
          sx={{
            textAlign: 'center',
            py: { xs: 3, sm: 4 },
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            backgroundColor: 'background.paper',
          }}
        >
          <CurrencyExchangeIcon sx={{ fontSize: { xs: 48, sm: 64 }, color: 'text.secondary', mb: { xs: 1.5, sm: 2 } }} />
          <Typography variant="h6" color="text.secondary" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
            No exchange rates yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.8125rem', sm: '0.875rem' } }}>
            Exchange rates are automatically created when you make multi-currency transfers
          </Typography>
        </Box>
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
                {showAll ? 'Show Less (10 Most Recent)' : `Show All (${sortedExchangeRates.length} total)`}
              </Button>
            </Box>
          )}

          {/* Mobile Card View */}
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            {displayedRates.map((rate) => (
              <Box
                key={rate.exchange_rate_id}
                sx={{
                  mb: 1.5,
                  p: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  backgroundColor: 'background.paper',
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                    {rate.date ? format(new Date(rate.date), 'MMM dd, yyyy') : 'N/A'}
                  </Typography>
                  <Typography variant="body1" fontWeight={600} sx={{ fontSize: '0.875rem' }}>
                    {rate.rate?.toFixed(4) || 'N/A'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <Typography variant="body1" fontWeight={500} sx={{ fontSize: '0.9375rem' }}>
                    {rate.from_currency}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>→</Typography>
                  <Typography variant="body1" fontWeight={500} sx={{ fontSize: '0.9375rem' }}>
                    {rate.to_currency}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                    From: {rate.from_amount !== null && rate.from_amount !== undefined
                      ? rate.from_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : 'N/A'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                    To: {rate.to_amount !== null && rate.to_amount !== undefined
                      ? rate.to_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : 'N/A'}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>

          {/* Desktop Table View */}
          <TableContainer
            component={Paper}
            elevation={0}
            sx={{
              display: { xs: 'none', md: 'block' },
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
            }}
          >
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
                      {rate.date ? format(new Date(rate.date), 'MMM dd, yyyy') : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500} sx={{ fontSize: '0.875rem' }}>
                        {rate.from_currency}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500} sx={{ fontSize: '0.875rem' }}>
                        {rate.to_currency}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={500} sx={{ fontSize: '0.875rem' }}>
                        {rate.rate?.toFixed(6) || 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {rate.from_amount !== null && rate.from_amount !== undefined
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
