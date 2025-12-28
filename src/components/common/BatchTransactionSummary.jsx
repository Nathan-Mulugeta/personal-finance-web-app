import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  DialogTitle,
  DialogContent,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { formatCurrency } from '../../utils/currencyConversion';

/**
 * Batch Transaction Summary Component
 * Shows a summary of all queued transactions with total count and combined amount.
 * Has Cancel, Edit, and Submit buttons.
 */
function BatchTransactionSummary({
  transactions,
  onCancel,
  onEdit,
  onSubmit,
  isSubmitting,
  error,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const { accounts } = useSelector((state) => state.accounts);

  // Calculate summary statistics
  const summary = useMemo(() => {
    const totalCount = transactions.length;
    
    // Group by currency and calculate totals
    const byCurrency = {};
    let incomeTotal = 0;
    let expenseTotal = 0;

    transactions.forEach((txn) => {
      const currency = txn.currency || 'USD';
      const amount = Number(txn.amount) || 0;

      if (!byCurrency[currency]) {
        byCurrency[currency] = { income: 0, expense: 0, net: 0 };
      }

      if (txn.type === 'Income') {
        byCurrency[currency].income += amount;
        byCurrency[currency].net += amount;
        incomeTotal++;
      } else {
        byCurrency[currency].expense += amount;
        byCurrency[currency].net -= amount;
        expenseTotal++;
      }
    });

    return {
      totalCount,
      incomeCount: incomeTotal,
      expenseCount: expenseTotal,
      byCurrency,
    };
  }, [transactions]);

  // Get account name helper
  const getAccountName = (accountId) => {
    const account = accounts.find((acc) => acc.account_id === accountId);
    return account?.name || 'Unknown';
  };

  if (transactions.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No transactions queued
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Go back and add some transactions first.
        </Typography>
        <Button onClick={onCancel} sx={{ mt: 2 }}>
          Close
        </Button>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <DialogTitle sx={{ flexShrink: 0, pb: { xs: 1, sm: 2 } }}>
        Batch Summary
      </DialogTitle>

      <DialogContent sx={{ flexGrow: 1, overflow: 'auto', pt: { xs: 1, sm: 2 } }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Summary Stats */}
        <Box
          sx={{
            textAlign: 'center',
            py: { xs: 3, sm: 4 },
            px: 2,
            backgroundColor: 'action.hover',
            borderRadius: 2,
            mb: 3,
          }}
        >
          <Typography
            variant="h3"
            sx={{
              fontWeight: 600,
              color: 'primary.main',
              fontSize: { xs: '2.5rem', sm: '3rem' },
            }}
          >
            {summary.totalCount}
          </Typography>
          <Typography variant="body1" color="text.secondary" gutterBottom>
            transaction{summary.totalCount !== 1 ? 's' : ''} ready to submit
          </Typography>

          {/* Breakdown by type */}
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 2 }}>
            {summary.incomeCount > 0 && (
              <Box>
                <Typography variant="h6" color="success.main">
                  {summary.incomeCount}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Income
                </Typography>
              </Box>
            )}
            {summary.expenseCount > 0 && (
              <Box>
                <Typography variant="h6" color="error.main">
                  {summary.expenseCount}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Expense
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        {/* Totals by Currency */}
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Totals by Currency
        </Typography>
        <Box sx={{ mb: 3 }}>
          {Object.entries(summary.byCurrency).map(([currency, amounts]) => (
            <Box
              key={currency}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                py: 1.5,
                px: 2,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                mb: 1,
              }}
            >
              <Typography variant="body1" fontWeight="medium">
                {currency}
              </Typography>
              <Box sx={{ textAlign: 'right' }}>
                {amounts.income > 0 && (
                  <Typography variant="body2" color="success.main">
                    +{formatCurrency(amounts.income, currency)}
                  </Typography>
                )}
                {amounts.expense > 0 && (
                  <Typography variant="body2" color="error.main">
                    -{formatCurrency(amounts.expense, currency)}
                  </Typography>
                )}
                <Typography
                  variant="body1"
                  fontWeight="medium"
                  color={amounts.net >= 0 ? 'success.main' : 'error.main'}
                >
                  Net: {amounts.net >= 0 ? '+' : ''}
                  {formatCurrency(Math.abs(amounts.net), currency)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>

        {/* Quick transaction list */}
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Transactions
        </Typography>
        <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
          {transactions.map((txn, index) => (
            <Box
              key={txn.tempId}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                py: 1,
                px: 1.5,
                borderBottom: index < transactions.length - 1 ? '1px solid' : 'none',
                borderColor: 'divider',
              }}
            >
              <Box>
                <Typography variant="body2" fontWeight="medium">
                  {txn.description || 'No description'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {getAccountName(txn.accountId)} • {txn.date}
                </Typography>
              </Box>
              <Typography
                variant="body2"
                fontWeight="medium"
                color={txn.type === 'Income' ? 'success.main' : 'error.main'}
              >
                {txn.type === 'Income' ? '+' : '-'}
                {formatCurrency(Math.abs(Number(txn.amount)), txn.currency)}
              </Typography>
            </Box>
          ))}
        </Box>
      </DialogContent>

      {/* Action Buttons */}
      <Box
        sx={{
          flexShrink: 0,
          p: { xs: 1.5, sm: 2 },
          borderTop: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Button
          onClick={onCancel}
          disabled={isSubmitting}
          size={isMobile ? 'medium' : 'medium'}
          sx={{
            textTransform: 'none',
            flex: 1,
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={onEdit}
          variant="outlined"
          disabled={isSubmitting}
          size={isMobile ? 'medium' : 'medium'}
          sx={{
            textTransform: 'none',
            flex: 1,
          }}
        >
          Edit
        </Button>
        <Button
          onClick={onSubmit}
          variant="contained"
          disabled={isSubmitting}
          size={isMobile ? 'medium' : 'medium'}
          startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : null}
          sx={{
            textTransform: 'none',
            flex: 1,
          }}
        >
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </Button>
      </Box>
    </Box>
  );
}

export default BatchTransactionSummary;

