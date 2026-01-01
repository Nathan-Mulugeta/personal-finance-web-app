import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  DialogTitle,
  DialogContent,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Chip,
  Divider,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ReceiptIcon from '@mui/icons-material/Receipt';
import { formatCurrency } from '../../utils/currencyConversion';

/**
 * Batch Transaction Summary Component
 * Shows a summary of all queued transactions with total count and combined amount.
 * Matches the Edit page layout with totals in the header.
 * Has Cancel, Edit, and Submit buttons.
 */
function BatchTransactionSummary({
  transactions,
  onCancel,
  onEdit,
  onSubmit,
  isSubmitting,
  error,
  onErrorClose,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const { accounts } = useSelector((state) => state.accounts);
  const { categories } = useSelector((state) => state.categories);

  // Calculate summary statistics
  const summary = useMemo(() => {
    const totalCount = transactions.length;
    
    // Group by currency and calculate totals
    const byCurrency = {};

    transactions.forEach((txn) => {
      const currency = txn.currency || 'USD';
      const amount = Number(txn.amount) || 0;

      if (!byCurrency[currency]) {
        byCurrency[currency] = { income: 0, expense: 0, total: 0 };
      }

      if (txn.type === 'Income') {
        byCurrency[currency].income += amount;
        byCurrency[currency].total += amount;
      } else {
        byCurrency[currency].expense += amount;
        byCurrency[currency].total += amount;
      }
    });

    return {
      totalCount,
      byCurrency,
    };
  }, [transactions]);

  // Get category name helper
  const getCategoryName = (categoryId) => {
    const category = categories.find((cat) => cat.category_id === categoryId);
    return category?.name || 'Unknown';
  };

  // Get account name helper
  const getAccountName = (accountId) => {
    const account = accounts.find((acc) => acc.account_id === accountId);
    return account?.name || 'Unknown';
  };

  // Format totals for header display
  const getTotalsDisplay = () => {
    const currencies = Object.keys(summary.byCurrency);
    if (currencies.length === 0) return null;
    
    if (currencies.length === 1) {
      const currency = currencies[0];
      const total = summary.byCurrency[currency].total;
      return formatCurrency(total, currency);
    }
    
    // Multiple currencies - show as list
    return currencies.map((currency) => {
      const total = summary.byCurrency[currency].total;
      return `${formatCurrency(total, currency)}`;
    }).join(' • ');
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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Batch Summary</span>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="body2" color="text.secondary">
              {summary.totalCount} transaction{summary.totalCount !== 1 ? 's' : ''}
              {' • '}
              <Typography component="span" fontWeight="medium" color="text.primary">
                {getTotalsDisplay()}
              </Typography>
            </Typography>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ flexGrow: 1, overflow: 'auto', pt: { xs: 1, sm: 2 }, px: 0 }}>
        {error && (
          <Alert severity="error" sx={{ mx: 2, mb: 2 }} onClose={onErrorClose}>
            {error}
          </Alert>
        )}

        <List disablePadding>
          {transactions.map((txn, index) => (
            <Box key={txn.tempId}>
              <ListItemButton
                onClick={() => onEdit()}
                sx={{ py: { xs: 1.5, sm: 2 }, px: { xs: 2, sm: 3 } }}
              >
                <ListItemIcon sx={{ minWidth: { xs: 40, sm: 48 } }}>
                  <ReceiptIcon
                    color={txn.type === 'Income' ? 'success' : 'error'}
                    sx={{ fontSize: { xs: 20, sm: 24 } }}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box
                      component="span"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Typography
                        component="span"
                        variant="body1"
                        fontWeight="medium"
                        sx={{
                          fontSize: { xs: '0.875rem', sm: '1rem' },
                        }}
                      >
                        {txn.description || 'No description'}
                      </Typography>
                      <Chip
                        label={txn.type}
                        size="small"
                        color={txn.type === 'Income' ? 'success' : 'error'}
                        sx={{ height: 20, fontSize: '0.6875rem' }}
                      />
                    </Box>
                  }
                  secondary={
                    <Box component="span">
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          fontSize: { xs: '0.75rem', sm: '0.8125rem' },
                          display: 'block',
                        }}
                      >
                        {getCategoryName(txn.categoryId)} • {getAccountName(txn.accountId)}
                      </Typography>
                      <Typography
                        component="span"
                        variant="body2"
                        sx={{
                          fontSize: { xs: '0.75rem', sm: '0.8125rem' },
                          display: 'block',
                          fontWeight: 'medium',
                          color: txn.type === 'Income' ? 'success.main' : 'error.main',
                        }}
                      >
                        {txn.type === 'Income' ? '+' : '-'}
                        {formatCurrency(Math.abs(Number(txn.amount)), txn.currency)}
                        {' • '}
                        <Typography component="span" color="text.secondary">
                          {txn.date}
                        </Typography>
                      </Typography>
                    </Box>
                  }
                />
              </ListItemButton>
              {index < transactions.length - 1 && <Divider />}
            </Box>
          ))}
        </List>
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
