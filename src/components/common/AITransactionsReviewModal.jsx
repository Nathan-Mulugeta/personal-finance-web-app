import { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Alert,
  Divider,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import CategoryAutocomplete from './CategoryAutocomplete';
import { batchCreateTransactions } from '../../store/slices/transactionsSlice';
import { refreshAllData } from '../../utils/refreshAllData';
import { format } from 'date-fns';
import { formatCurrency } from '../../utils/currencyConversion';

/**
 * AI Transactions Review Modal
 * Allows users to review, edit, and save transactions parsed by AI
 * from receipt images or natural language input.
 *
 * Features:
 * - Inline editing of description, amount, and category
 * - 15% tax toggle per item (for receipt parsing)
 * - Account and date selection at the top
 * - Summary with subtotal, tax, and grand total
 */
function AITransactionsReviewModal({
  open,
  onClose,
  parsedData, // { transactions, merchant, receiptDate, type }
  isReceipt = false, // Whether this is from receipt parsing (enables tax toggles)
}) {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Get data from Redux
  const { categories } = useSelector((state) => state.categories);
  const { accounts } = useSelector((state) => state.accounts);
  const { settings } = useSelector((state) => state.settings);

  // Get default account from settings
  const defaultAccountId = useMemo(() => {
    const setting = settings.find((s) => s.setting_key === 'DefaultAccountID');
    return setting?.setting_value || '';
  }, [settings]);

  // State
  const [transactions, setTransactions] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedDate, setSelectedDate] = useState(
    format(new Date(), 'yyyy-MM-dd')
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Get active accounts
  const activeAccounts = useMemo(() => {
    return accounts.filter((acc) => acc.status === 'Active');
  }, [accounts]);

  // Get selected account currency
  const selectedCurrency = useMemo(() => {
    const account = accounts.find(
      (acc) => acc.account_id === selectedAccountId
    );
    return account?.currency || 'USD';
  }, [accounts, selectedAccountId]);

  // Initialize state when modal opens
  useEffect(() => {
    if (open && parsedData) {
      // Initialize transactions with tax toggle (default ON for receipts)
      const initialTransactions = (parsedData.transactions || []).map(
        (txn, index) => ({
          id: `ai_${Date.now()}_${index}`,
          description: txn.description || '',
          amount: txn.amount || 0,
          categoryId: txn.suggestedCategoryId || '',
          categoryName: txn.suggestedCategoryName || '',
          type: txn.type || 'Expense',
          applyTax: isReceipt, // Default to true for receipts
        })
      );

      setTransactions(initialTransactions);

      // Set date from receipt or default to today
      if (parsedData.receiptDate) {
        setSelectedDate(parsedData.receiptDate);
      } else {
        setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
      }

      // Set default account
      setSelectedAccountId(defaultAccountId);
      setError(null);
    }
  }, [open, parsedData, isReceipt, defaultAccountId]);

  // Calculate totals
  const totals = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;

    transactions.forEach((txn) => {
      const amount = parseFloat(txn.amount) || 0;
      subtotal += amount;
      if (txn.applyTax) {
        taxTotal += amount * 0.15;
      }
    });

    return {
      subtotal,
      taxTotal,
      grandTotal: subtotal + taxTotal,
    };
  }, [transactions]);

  // Handle transaction field changes
  const handleTransactionChange = (id, field, value) => {
    setTransactions((prev) =>
      prev.map((txn) => (txn.id === id ? { ...txn, [field]: value } : txn))
    );
  };

  // Handle removing a transaction
  const handleRemoveTransaction = (id) => {
    setTransactions((prev) => prev.filter((txn) => txn.id !== id));
  };

  // Handle adding a new empty transaction
  const handleAddTransaction = () => {
    const newTransaction = {
      id: `ai_${Date.now()}_new`,
      description: '',
      amount: 0,
      categoryId: '',
      categoryName: '',
      type: 'Expense',
      applyTax: isReceipt,
    };
    setTransactions((prev) => [...prev, newTransaction]);
  };

  // Calculate final amount for a transaction
  const getFinalAmount = (txn) => {
    const amount = parseFloat(txn.amount) || 0;
    return txn.applyTax ? amount * 1.15 : amount;
  };

  // Handle save all transactions
  const handleSave = async () => {
    // Validate account selection
    if (!selectedAccountId) {
      setError('Please select an account');
      return;
    }

    // Filter out empty transactions
    const validTransactions = transactions.filter(
      (txn) => txn.amount > 0 && txn.categoryId
    );

    if (validTransactions.length === 0) {
      setError(
        'No valid transactions to save. Each transaction needs an amount and category.'
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Prepare transactions for batch create
      const transactionsToCreate = validTransactions.map((txn) => ({
        accountId: selectedAccountId,
        categoryId: txn.categoryId,
        amount: getFinalAmount(txn),
        currency: selectedCurrency,
        description: txn.description,
        type: txn.type,
        status: 'Cleared',
        date: selectedDate,
      }));

      // Use batch create
      await dispatch(batchCreateTransactions(transactionsToCreate)).unwrap();

      // Refresh all data
      await refreshAllData(dispatch);

      // Close modal on success
      onClose();
    } catch (err) {
      console.error('Error saving transactions:', err);
      setError(
        err?.message || 'Failed to save transactions. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle close
  const handleClose = () => {
    if (!isSubmitting) {
      setTransactions([]);
      setError(null);
      onClose();
    }
  };

  // Get filtered categories by type
  const getCategoriesForType = (type) => {
    return categories.filter(
      (cat) => cat.type === type && cat.status === 'Active'
    );
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: isMobile
          ? {
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              maxHeight: '100%',
            }
          : {
              maxHeight: '90vh',
            },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" component="span">
          Review Transactions
        </Typography>
        {parsedData?.merchant && (
          <Typography variant="body2" color="text.secondary">
            From: {parsedData.merchant}
          </Typography>
        )}
      </DialogTitle>

      <DialogContent sx={{ pt: 2, overflow: 'auto' }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Account and Date Selection */}
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            mb: 2,
            mt: 1,
            flexDirection: { xs: 'column', sm: 'row' },
          }}
        >
          <FormControl fullWidth size="small">
            <InputLabel shrink={!!selectedAccountId}>Account *</InputLabel>
            <Select
              value={selectedAccountId}
              label="Account *"
              onChange={(e) => setSelectedAccountId(e.target.value)}
              notched={!!selectedAccountId}
            >
              {activeAccounts.map((account) => (
                <MenuItem key={account.account_id} value={account.account_id}>
                  {account.name} ({account.currency})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            type="date"
            label="Date *"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            size="small"
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Transaction List */}
        {transactions.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary">
              No transactions found. Add one manually or try again.
            </Typography>
            <Button
              startIcon={<AddIcon />}
              onClick={handleAddTransaction}
              sx={{ mt: 2 }}
            >
              Add Transaction
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {transactions.map((txn, index) => (
              <Box
                key={txn.id}
                sx={{
                  p: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  backgroundColor: 'background.paper',
                }}
              >
                {/* Row header with item number and delete */}
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 1.5,
                  }}
                >
                  <Typography variant="subtitle2" color="text.secondary">
                    Item {index + 1}
                  </Typography>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleRemoveTransaction(txn.id)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>

                {/* Description and Amount row */}
                <Box
                  sx={{
                    display: 'flex',
                    gap: 2,
                    mb: 1.5,
                    flexDirection: { xs: 'column', sm: 'row' },
                  }}
                >
                  <TextField
                    label="Description"
                    value={txn.description}
                    onChange={(e) =>
                      handleTransactionChange(
                        txn.id,
                        'description',
                        e.target.value
                      )
                    }
                    size="small"
                    fullWidth
                    sx={{ flex: 2 }}
                  />
                  <TextField
                    label="Amount"
                    type="number"
                    value={txn.amount}
                    onChange={(e) =>
                      handleTransactionChange(
                        txn.id,
                        'amount',
                        parseFloat(e.target.value) || 0
                      )
                    }
                    size="small"
                    inputProps={{ step: '0.01', min: '0' }}
                    sx={{ flex: 1, minWidth: 100 }}
                  />
                </Box>

                {/* Category row */}
                <Box sx={{ mb: isReceipt ? 1.5 : 0 }}>
                  <CategoryAutocomplete
                    categories={getCategoriesForType(txn.type)}
                    value={txn.categoryId}
                    onChange={(id) =>
                      handleTransactionChange(txn.id, 'categoryId', id)
                    }
                    label="Category"
                    size="small"
                  />
                </Box>

                {/* Tax toggle (only for receipts) */}
                {isReceipt && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: 'action.hover',
                      borderRadius: 1,
                      px: 1.5,
                      py: 0.5,
                    }}
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={txn.applyTax}
                          onChange={(e) =>
                            handleTransactionChange(
                              txn.id,
                              'applyTax',
                              e.target.checked
                            )
                          }
                          size="small"
                        />
                      }
                      label={
                        <Typography variant="body2">Add 15% tax</Typography>
                      }
                    />
                    <Typography variant="body2" fontWeight={500}>
                      {txn.applyTax ? (
                        <>
                          {formatCurrency(txn.amount, selectedCurrency)} +{' '}
                          {formatCurrency(txn.amount * 0.15, selectedCurrency)}{' '}
                          ={' '}
                          <strong>
                            {formatCurrency(
                              getFinalAmount(txn),
                              selectedCurrency
                            )}
                          </strong>
                        </>
                      ) : (
                        formatCurrency(txn.amount, selectedCurrency)
                      )}
                    </Typography>
                  </Box>
                )}
              </Box>
            ))}

            {/* Add Transaction Button */}
            <Button
              startIcon={<AddIcon />}
              onClick={handleAddTransaction}
              variant="outlined"
              size="small"
              sx={{ alignSelf: 'flex-start' }}
            >
              Add Item
            </Button>
          </Box>
        )}

        {/* Summary Section */}
        {transactions.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Box
              sx={{
                p: 2,
                backgroundColor: 'action.hover',
                borderRadius: 1,
              }}
            >
              <Typography variant="subtitle2" gutterBottom>
                Summary
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    Subtotal ({transactions.length} items)
                  </Typography>
                  <Typography variant="body2">
                    {formatCurrency(totals.subtotal, selectedCurrency)}
                  </Typography>
                </Box>
                {isReceipt && totals.taxTotal > 0 && (
                  <Box
                    sx={{ display: 'flex', justifyContent: 'space-between' }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      Tax (15%)
                    </Typography>
                    <Typography variant="body2">
                      +{formatCurrency(totals.taxTotal, selectedCurrency)}
                    </Typography>
                  </Box>
                )}
                <Divider sx={{ my: 0.5 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle2">Total</Typography>
                  <Typography variant="subtitle2" color="primary.main">
                    {formatCurrency(totals.grandTotal, selectedCurrency)}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </>
        )}
      </DialogContent>

      <DialogActions
        sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}
      >
        <Button onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={isSubmitting || transactions.length === 0}
          startIcon={
            isSubmitting ? <CircularProgress size={16} color="inherit" /> : null
          }
        >
          {isSubmitting
            ? 'Saving...'
            : `Save ${transactions.length} Transaction${
                transactions.length !== 1 ? 's' : ''
              }`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default AITransactionsReviewModal;
