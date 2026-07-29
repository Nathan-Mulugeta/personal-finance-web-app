import { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Button,
  Chip,
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
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import CategoryAutocomplete from './CategoryAutocomplete';
import {
  flattenCategoryTree,
  getParentCategoryIds,
} from '../../utils/categoryHierarchy';
import { batchCreateTransactions } from '../../store/slices/transactionsSlice';
import { selectPrefixReceiptMerchant } from '../../store/selectors';
import { format } from 'date-fns';
import { formatCurrency } from '../../utils/currencyConversion';
import { useAutoDismissError } from '../../hooks/useAutoDismissError';

/**
 * AI Transactions Review Modal
 * Review, edit, and save transactions parsed by AI from a receipt image or
 * natural-language input.
 *
 * Features:
 * - Compact per-item row: category, amount, description, and (for receipts) a
 *   15% tax toggle
 * - Account and date selection at the top
 * - Running grand total in a sticky footer
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
  const prefixMerchant = useSelector(selectPrefixReceiptMerchant);

  // Get default account from settings
  const defaultAccountId = useMemo(() => {
    const setting = settings.find((s) => s.setting_key === 'DefaultAccountID');
    return setting?.setting_value || '';
  }, [settings]);

  // State
  const [transactions, setTransactions] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedDate, setSelectedDate] = useState(
    format(new Date(), 'yyyy-MM-dd'),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Auto-dismiss error after 8 seconds
  useAutoDismissError(setError, error);

  // Get active accounts
  const activeAccounts = useMemo(() => {
    return accounts.filter((acc) => acc.status === 'Active');
  }, [accounts]);

  // Get selected account currency
  const selectedCurrency = useMemo(() => {
    const account = accounts.find(
      (acc) => acc.account_id === selectedAccountId,
    );
    return account?.currency || 'USD';
  }, [accounts, selectedAccountId]);

  // Merchant context for the header (receipts only)
  const merchant = isReceipt ? (parsedData?.merchant || '').trim() : '';

  // Initialize state when modal opens
  useEffect(() => {
    if (open && parsedData) {
      // Append the store name after each item ("Milk · Walmart") for receipts,
      // when enabled — so the item reads first and where it came from follows.
      const merchantName = (parsedData.merchant || '').trim();
      const withMerchant = (desc) =>
        isReceipt && prefixMerchant && merchantName && desc
          ? `${desc} · ${merchantName}`
          : desc;
      // Initialize transactions with tax toggle (default ON for receipts)
      // Store base amount (pre-tax) and calculate display amount based on applyTax
      const initialTransactions = (parsedData.transactions || []).map(
        (txn, index) => {
          const baseAmount = txn.amount || 0;
          // Use the AI-returned taxable flag when available (e.g., items
          // marked with "(N)" on the receipt are non-taxable).
          // Fall back to true for receipts when the field is absent.
          const applyTax =
            isReceipt && txn.taxable !== undefined ? txn.taxable : isReceipt;
          // If tax is applied, multiply base amount by 1.15, otherwise use base amount
          const displayAmount = applyTax
            ? Math.round(baseAmount * 1.15 * 100) / 100
            : baseAmount;

          return {
            id: `ai_${Date.now()}_${index}`,
            description: withMerchant(txn.description || ''),
            baseAmount: baseAmount, // Store original pre-tax amount
            amount: displayAmount, // Display amount (with or without tax)
            categoryId: txn.suggestedCategoryId || '',
            categoryName: txn.suggestedCategoryName || '',
            type: txn.type || 'Expense',
            applyTax: applyTax,
          };
        },
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
  }, [open, parsedData, isReceipt, defaultAccountId, prefixMerchant]);

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

  // Number of items still missing a category (blocks save)
  const missingCategoryCount = useMemo(
    () => transactions.filter((txn) => !txn.categoryId).length,
    [transactions],
  );

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
            amount: displayAmount,
          };
        }

        return { ...txn, [field]: value };
      }),
    );
  };

  // Handle tax toggle - updates both applyTax and display amount
  const handleTaxToggle = (id, currentApplyTax, currentAmount) => {
    const newApplyTax = !currentApplyTax;

    setTransactions((prev) =>
      prev.map((txn) => {
        if (txn.id !== id) return txn;

        // Get the base amount (pre-tax)
        const baseAmount =
          txn.baseAmount !== undefined
            ? txn.baseAmount
            : currentApplyTax
              ? Math.round((parseFloat(currentAmount) / 1.15) * 100) / 100
              : parseFloat(currentAmount);

        // Calculate new display amount based on new tax state
        const newAmount = newApplyTax
          ? Math.round(baseAmount * 1.15 * 100) / 100 // Add 15% tax
          : baseAmount; // Use base amount (no tax)

        return {
          ...txn,
          baseAmount: baseAmount, // Ensure baseAmount is stored
          applyTax: newApplyTax,
          amount: newAmount,
        };
      }),
    );
  };

  // Remove a draft item — nothing is saved yet, so no confirmation needed
  const handleRemoveTransaction = (id) => {
    setTransactions((prev) => prev.filter((txn) => txn.id !== id));
  };

  // Handle adding a new empty transaction
  const handleAddTransaction = () => {
    const applyTax = isReceipt;
    const baseAmount = 0;
    const displayAmount = applyTax
      ? Math.round(baseAmount * 1.15 * 100) / 100
      : baseAmount;

    const newTransaction = {
      id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
      (txn) => txn.amount > 0 && txn.categoryId,
    );

    if (validTransactions.length === 0) {
      setError(
        'No valid transactions to save. Each transaction needs an amount and category.',
      );
      return;
    }

    // Block parent categories (with subcategories) — an AI suggestion may land
    // on one, and transactions must post to a specific subcategory
    const parentCount = validTransactions.filter((txn) =>
      activeParentIds.has(txn.categoryId),
    ).length;
    if (parentCount > 0) {
      setError(
        `${parentCount} transaction${parentCount !== 1 ? 's are' : ' is'} set to a category that has subcategories. Pick a specific subcategory for ${parentCount !== 1 ? 'them' : 'it'} before saving.`,
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
        err?.message || 'Failed to save transactions. Please try again.',
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

  // Get filtered categories by type, organized as an indented tree so the
  // picker matches the create-transaction modal (indentation + parent bolding)
  const getCategoriesForType = (type) => {
    return flattenCategoryTree(
      categories.filter((cat) => cat.type === type && cat.status === 'Active'),
    );
  };

  // Parent categories (with active subcategories) can't receive transactions —
  // used to block an AI-suggested parent before it reaches the batch create
  const activeParentIds = useMemo(
    () => getParentCategoryIds(categories.filter((c) => c.status === 'Active')),
    [categories],
  );

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
              borderRadius: 3,
            },
      }}
    >
      <DialogTitle sx={{ pb: merchant ? 0.5 : 1 }}>
        <Typography variant="h6" component="span">
          Review Transactions
        </Typography>
        {merchant && (
          <Typography variant="body2" color="text.secondary">
            {merchant}
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

        <Divider sx={{ mb: 1 }} />

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
          <Box>
            {transactions.map((txn) => (
              <Box
                key={txn.id}
                sx={{
                  py: 1.5,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                {/* Category (most of the width) + amount. The delete lives on
                    the next row so Category keeps the full line width here. */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1,
                    mb: 1.5,
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <CategoryAutocomplete
                      categories={getCategoriesForType(txn.type)}
                      leafOnly
                      value={txn.categoryId}
                      onChange={(id) =>
                        handleTransactionChange(txn.id, 'categoryId', id)
                      }
                      label="Category"
                      size="small"
                      error={!txn.categoryId}
                      helperText={!txn.categoryId ? 'Choose a category' : ''}
                    />
                  </Box>
                  <TextField
                    label="Amount"
                    type="number"
                    value={txn.amount}
                    onChange={(e) =>
                      handleTransactionChange(
                        txn.id,
                        'amount',
                        parseFloat(e.target.value) || 0,
                      )
                    }
                    size="small"
                    inputProps={{ step: '0.01', min: '0' }}
                    sx={{ width: 104, flexShrink: 0 }}
                  />
                </Box>

                {/* Description on its own line (full note visible) + delete */}
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <TextField
                    label="Description"
                    value={txn.description}
                    onChange={(e) =>
                      handleTransactionChange(
                        txn.id,
                        'description',
                        e.target.value,
                      )
                    }
                    size="small"
                    sx={{ flex: 1, minWidth: 0 }}
                  />
                  <IconButton
                    size="small"
                    aria-label="Remove item"
                    onClick={() => handleRemoveTransaction(txn.id)}
                    sx={{
                      mt: 0.25,
                      color: 'text.disabled',
                      '&:hover': { color: 'error.main' },
                    }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Box>

                {/* Tax toggle (receipts only) — compact chip */}
                {isReceipt && (
                  <Chip
                    label="+15% tax"
                    size="small"
                    color={txn.applyTax ? 'primary' : 'default'}
                    variant={txn.applyTax ? 'filled' : 'outlined'}
                    onClick={() =>
                      handleTaxToggle(txn.id, txn.applyTax, txn.amount)
                    }
                    sx={{ mt: 1.5 }}
                  />
                )}
              </Box>
            ))}

            {/* Add Transaction Button */}
            <Button
              startIcon={<AddIcon />}
              onClick={handleAddTransaction}
              variant="outlined"
              size="small"
              sx={{ mt: 2, alignSelf: 'flex-start' }}
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
            gap: 1,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2">
              Total ({transactions.length} item
              {transactions.length !== 1 ? 's' : ''})
            </Typography>
            {missingCategoryCount > 0 && (
              <Typography variant="caption" color="error.main">
                {missingCategoryCount} missing a category
              </Typography>
            )}
          </Box>
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
    </Dialog>
  );
}

export default AITransactionsReviewModal;
