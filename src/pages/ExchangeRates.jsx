import { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Card,
  CardContent,
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

function ExchangeRates() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { exchangeRates, loading, isInitialized, error } = useSelector((state) => state.exchangeRates);
  const appInitialized = useSelector((state) => state.appInit.isInitialized);

  // Fetch exchange rates on mount to ensure fresh data
  useEffect(() => {
    if (appInitialized) {
      dispatch(fetchExchangeRates({}));
    }
  }, [dispatch, appInitialized]);

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

  if (!appInitialized || (loading && !isInitialized)) {
    return <LoadingSpinner />;
  }

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <CurrencyExchangeIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Typography variant="h4" fontWeight="bold">
          Exchange Rates
        </Typography>
      </Box>

      {error && <ErrorMessage error={error} />}

      {sortedExchangeRates.length === 0 ? (
        <Card>
          <CardContent>
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CurrencyExchangeIcon
                sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }}
              />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No exchange rates yet
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Exchange rates are automatically created when you make multi-currency transfers
              </Typography>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>From Currency</TableCell>
                <TableCell>To Currency</TableCell>
                <TableCell align="right">Rate</TableCell>
                <TableCell align="right">From Amount</TableCell>
                <TableCell align="right">To Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedExchangeRates.map((rate) => (
                <TableRow key={rate.exchange_rate_id} hover>
                  <TableCell>
                    {rate.date ? format(new Date(rate.date), 'MMM dd, yyyy') : 'N/A'}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body1" fontWeight="medium">
                      {rate.from_currency}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body1" fontWeight="medium">
                      {rate.to_currency}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body1" fontWeight="medium">
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
      )}
    </Box>
  );
}

export default ExchangeRates;

