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
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

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
      // Store base amount (pre-tax) and calculate display amount based on applyTax
      const initialTransactions = (parsedData.transactions || []).map(
        (txn, index) => {
          const baseAmount = txn.amount || 0;
          const applyTax = isReceipt; // Default to true for receipts
          // If tax is applied, multiply base amount by 1.15, otherwise use base amount
          const displayAmount = applyTax ? Math.round(baseAmount * 1.15 * 100) / 100 : baseAmount;
          
          return {
            id: `ai_${Date.now()}_${index}`,
            description: txn.description || '',
            baseAmount: baseAmount, // Store original pre-tax amount
            amount: displayAmount, // Display amount (with or without tax)
            categoryId: txn.suggestedCategoryId || '',
            categoryName: txn.suggestedCategoryName || '',
            type: txn.type || 'Expense',
            applyTax: applyTax,
          };
        }
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

  // Calculate totals (using display amounts which include tax if applyTax is true)
  const totals = useMemo(() => {
    let grandTotal = 0;

    transactions.forEach((txn) => {
      const amount = parseFloat(txn.amount) || 0;
      grandTotal += amount;
    });

    return {
      grandTotal,
    };
  }, [transactions]);

  // Handle transaction field changes
  const handleTransactionChange = (id, field, value) => {
    setTransactions((prev) =>
      prev.map((txn) => {
        if (txn.id !== id) return txn;
        
        // If amount is being changed, update baseAmount and recalculate display amount
        if (field === 'amount') {
          const newAmount = parseFloat(value) || 0;
          // Calculate base amount based on current applyTax state
          const newBaseAmount = txn.applyTax 
            ? Math.round((newAmount / 1.15) * 100) / 100 
            : newAmount;
          // Recalculate display amount based on applyTax
          const displayAmount = txn.applyTax 
            ? Math.round(newBaseAmount * 1.15 * 100) / 100 
            : newBaseAmount;
          
          return { 
            ...txn, 
            baseAmount: newBaseAmount,
            amount: displayAmount 
          };
        }
        
        return { ...txn, [field]: value };
      })
    );
  };

  // Handle tax toggle - updates both applyTax and display amount
  const handleTaxToggle = (id, currentApplyTax, currentAmount) => {
    const newApplyTax = !currentApplyTax;

    setTransactions((prev) =>
      prev.map((txn) => {
        if (txn.id !== id) return txn;
        
        // Get the base amount (pre-tax)
        const baseAmount = txn.baseAmount !== undefined 
          ? txn.baseAmount 
          : (currentApplyTax 
              ? Math.round((parseFloat(currentAmount) / 1.15) * 100) / 100 
              : parseFloat(currentAmount));
        
        // Calculate new display amount based on new tax state
        const newAmount = newApplyTax
          ? Math.round(baseAmount * 1.15 * 100) / 100 // Add 15% tax
          : baseAmount; // Use base amount (no tax)

        return { 
          ...txn, 
          baseAmount: baseAmount, // Ensure baseAmount is stored
          applyTax: newApplyTax, 
          amount: newAmount 
        };
      })
    );
  };

  // Handle removing a transaction (with confirmation)
  const handleRemoveTransaction = (id) => {
    setDeleteConfirmId(id);
  };

  // Confirm delete transaction
  const handleConfirmDelete = () => {
    if (deleteConfirmId) {
      setTransactions((prev) =>
        prev.filter((txn) => txn.id !== deleteConfirmId)
      );
      setDeleteConfirmId(null);
    }
  };

  // Handle adding a new empty transaction
  const handleAddTransaction = () => {
    const applyTax = isReceipt;
    const baseAmount = 0;
    const displayAmount = applyTax ? Math.round(baseAmount * 1.15 * 100) / 100 : baseAmount;
    
    const newTransaction = {
      id: `ai_${Date.now()}_new`,
      description: '',
      baseAmount: baseAmount,
      amount: displayAmount,
      categoryId: '',
      categoryName: '',
      type: 'Expense',
      applyTax: applyTax,
    };
    setTransactions((prev) => [...prev, newTransaction]);
  };

  // Get the amount for a transaction (tax is already applied in the amount field)
  const getAmount = (txn) => {
    return parseFloat(txn.amount) || 0;
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
        amount: getAmount(txn),
        currency: selectedCurrency,
        description: txn.description,
        type: txn.type,
        status: 'Cleared',
        date: selectedDate,
      }));

      // Use batch create
      await dispatch(batchCreateTransactions(transactionsToCreate)).unwrap();

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

                {/* Category row */}
                <Box sx={{ mb: 1.5 }}>
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

                {/* Amount and Description row */}
                <Box
                  sx={{
                    display: 'flex',
                    gap: 2,
                    mb: isReceipt ? 1.5 : 0,
                    flexDirection: { xs: 'column', sm: 'row' },
                  }}
                >
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
                </Box>

                {/* Tax toggle (only for receipts) */}
                {isReceipt && (
                  <Box
                    onClick={() =>
                      handleTaxToggle(txn.id, txn.applyTax, txn.amount)
                    }
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      backgroundColor: 'action.hover',
                      borderRadius: 1,
                      px: 1.5,
                      py: 1,
                      cursor: 'pointer',
                      '&:hover': {
                        backgroundColor: 'action.selected',
                      },
                    }}
                  >
                    <Checkbox
                      checked={txn.applyTax}
                      size="small"
                      sx={{ p: 0, mr: 1 }}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() =>
                        handleTaxToggle(txn.id, txn.applyTax, txn.amount)
                      }
                    />
                    <Typography variant="body2">Add 15% tax</Typography>
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
      </DialogContent>

      {/* Sticky Summary Section */}
      {transactions.length > 0 && (
        <Box
          sx={{
            flexShrink: 0,
            px: 2,
            py: 1.5,
            borderTop: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'action.hover',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography variant="subtitle2">
            Total ({transactions.length} item
            {transactions.length !== 1 ? 's' : ''})
          </Typography>
          <Typography
            variant="subtitle1"
            fontWeight="bold"
            color="primary.main"
          >
            {formatCurrency(totals.grandTotal, selectedCurrency)}
          </Typography>
        </Box>
      )}

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

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            p: 1,
          },
        }}
      >
        <DialogTitle sx={{ textAlign: 'center', pb: 1 }}>
          Delete Item?
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center', pb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', gap: 2, px: 3, pb: 3 }}>
          <Button
            onClick={() => setDeleteConfirmId(null)}
            variant="outlined"
            size="large"
            sx={{
              textTransform: 'none',
              minWidth: 120,
              py: 1.5,
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            size="large"
            sx={{
              textTransform: 'none',
              minWidth: 120,
              py: 1.5,
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

export default AITransactionsReviewModal;
