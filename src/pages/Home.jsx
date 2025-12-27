import { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
  FormHelperText,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Alert,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ReceiptIcon from '@mui/icons-material/Receipt';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  updateTransaction,
  deleteTransaction,
  clearError,
  fetchTransactions,
} from '../store/slices/transactionsSlice';
import { recalculateAccountBalance } from '../store/slices/accountsSlice';
import { transactionSchema } from '../schemas/transactionSchema';
import {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
} from '../lib/api/transactions';
import ErrorMessage from '../components/common/ErrorMessage';
import { formatCurrency } from '../utils/currencyConversion';
import { format, parseISO } from 'date-fns';
import { usePageRefresh } from '../hooks/usePageRefresh';
import { refreshAllData } from '../utils/refreshAllData';

function Home() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const searchInputRef = useRef(null);

  // Get data from Redux - only what we need for transactions
  const { allTransactions, error } = useSelector((state) => state.transactions);
  const { categories } = useSelector((state) => state.categories);
  const { accounts } = useSelector((state) => state.accounts);

  // Refresh data on navigation
  usePageRefresh({
    dataTypes: ['transactions', 'accounts', 'categories'],
    filters: {
      accounts: { status: 'Active' },
      categories: { status: 'Active' },
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      accountId: '',
      categoryId: '',
      amount: '',
      currency: '',
      description: '',
      type: 'Expense',
      status: 'Cleared',
      date: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  const watchedAccountId = watch('accountId');
  const watchedCategoryId = watch('categoryId');
  const watchedType = watch('type');
  const watchedStatus = watch('status');

  // Debounce search query with 300ms delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim().toLowerCase());
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Auto-set currency when account is selected
  useEffect(() => {
    if (watchedAccountId) {
      const account = accounts.find(
        (acc) => acc.account_id === watchedAccountId
      );
      if (account) {
        setValue('currency', account.currency);
      }
    }
  }, [watchedAccountId, accounts, setValue]);

  // Search transactions by category name and description
  const searchResults = useMemo(() => {
    if (
      !debouncedSearchQuery ||
      !allTransactions ||
      allTransactions.length === 0
    ) {
      return [];
    }

    const query = debouncedSearchQuery;

    return allTransactions
      .filter((txn) => {
        // Skip deleted or cancelled transactions
        if (txn.deleted_at || txn.status === 'Cancelled') {
          return false;
        }

        // Search by description
        const description = (txn.description || '').toLowerCase();
        if (description.includes(query)) {
          return true;
        }

        // Search by category name
        const category = categories.find(
          (cat) => cat.category_id === txn.category_id
        );
        if (category) {
          const categoryName = (category.name || '').toLowerCase();
          if (categoryName.includes(query)) {
            return true;
          }
        }

        return false;
      })
      .slice(0, 20); // Limit to 20 results
  }, [debouncedSearchQuery, allTransactions, categories]);

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

  // Filter categories by type
  const getFilteredCategories = () => {
    if (!watchedType) return categories;
    if (watchedType === 'Income') {
      return categories.filter((cat) => cat.type === 'Income');
    } else if (watchedType === 'Expense') {
      return categories.filter((cat) => cat.type === 'Expense');
    }
    return categories;
  };

  const handleOpenDialog = (transaction) => {
    if (transaction) {
      setEditingTransaction(transaction);
      reset({
        accountId: transaction.account_id,
        categoryId: transaction.category_id,
        amount: transaction.amount,
        currency: transaction.currency,
        description: transaction.description || '',
        type: transaction.type,
        status: transaction.status,
        date: transaction.date,
      });
    } else {
      setEditingTransaction(null);
      reset({
        accountId: '',
        categoryId: '',
        amount: '',
        currency: '',
        description: '',
        type: 'Expense',
        status: 'Cleared',
        date: format(new Date(), 'yyyy-MM-dd'),
      });
    }
    setActionError(null);
    setIsSubmitting(false);
    setDeleteError(null);
    setIsDeleting(false);
    setOpenDialog(true);
    setDeleteConfirm(false);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingTransaction(null);
    setDeleteConfirm(false);
    setActionError(null);
    setIsSubmitting(false);
    setDeleteError(null);
    setIsDeleting(false);
    reset();
    dispatch(clearError());
  };

  const onSubmit = async (data) => {
    // Don't submit if in delete confirmation mode
    if (deleteConfirm) return;

    setIsSubmitting(true);
    setActionError(null);
    try {
      let transaction;
      if (editingTransaction) {
        transaction = await dispatch(
          updateTransaction({
            transactionId: editingTransaction.transaction_id,
            updates: data,
          })
        ).unwrap();
      }

      handleCloseDialog();

      // Refresh all data to ensure all pages have fresh data
      await refreshAllData(dispatch);
    } catch (err) {
      console.error('Error saving transaction:', err);
      const errorMessage =
        err?.message || 'Failed to save transaction. Please try again.';
      setActionError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = () => {
    setDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!editingTransaction) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const deletedTransactionId = await dispatch(
        deleteTransaction(editingTransaction.transaction_id)
      ).unwrap();

      // Recalculate balance for the affected account
      setTimeout(() => {
        if (editingTransaction?.account_id) {
          dispatch(
            recalculateAccountBalance({
              accountId: editingTransaction.account_id,
              transactions: undefined, // Will use state.transactions.allTransactions
            })
          );
        }
      }, 100);

      setDeleteConfirm(false);
      handleCloseDialog();

      // Refresh all data to ensure all pages have fresh data
      await refreshAllData(dispatch);
    } catch (err) {
      console.error('Error deleting transaction:', err);
      const errorMessage =
        err?.message || 'Failed to delete transaction. Please try again.';
      setDeleteError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    // Focus the search input after clearing
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, 0);
  };

  return (
    <Box>
      <Typography
        variant="h4"
        sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, mb: { xs: 1.5, sm: 2, md: 3 }, fontWeight: 500 }}
      >
        Home
      </Typography>

      {error && <ErrorMessage error={error} />}

      {/* Search Bar */}
      <Box
        sx={{
          mb: { xs: 2, sm: 3 },
          p: { xs: 1.5, sm: 2 },
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          backgroundColor: 'background.paper',
        }}
      >
        <TextField
          inputRef={searchInputRef}
          fullWidth
          placeholder="Search transactions by category or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton
                  onClick={handleClearSearch}
                  edge="end"
                  size="small"
                  sx={{ mr: 0.5 }}
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontSize: { xs: '0.875rem', sm: '1rem' },
              py: { xs: 0.5, sm: 1 },
            },
          }}
          autoFocus
        />
        {debouncedSearchQuery && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontSize: { xs: '0.8125rem', sm: '0.875rem' } }}>
            {searchResults.length} transaction
            {searchResults.length !== 1 ? 's' : ''} found
          </Typography>
        )}
      </Box>

      {/* Search Results */}
      {debouncedSearchQuery && (
        <Box>
          {searchResults.length > 0 ? (
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                backgroundColor: 'background.paper',
                overflow: 'hidden',
              }}
            >
              <List disablePadding>
                {searchResults.map((txn, index) => (
                  <Box key={txn.transaction_id}>
                    <ListItemButton
                      onClick={() => handleOpenDialog(txn)}
                      sx={{ py: { xs: 1, sm: 1.5 }, px: { xs: 1.5, sm: 2 } }}
                    >
                      <ListItemIcon sx={{ minWidth: { xs: 36, sm: 48 } }}>
                        <ReceiptIcon color="primary" sx={{ fontSize: { xs: 20, sm: 24 } }} />
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
                            <Typography component="span" variant="body1" fontWeight="medium" sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
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
                            <Typography component="span" variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, display: 'block' }}>
                              {getCategoryName(txn.category_id)} • {getAccountName(txn.account_id)}
                            </Typography>
                            <Typography component="span" variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.8125rem' }, display: 'block' }}>
                              {format(parseISO(txn.date), 'MMM dd, yyyy')} • {formatCurrency(Math.abs(txn.amount), txn.currency)}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItemButton>
                    {index < searchResults.length - 1 && <Divider />}
                  </Box>
                ))}
              </List>
            </Box>
          ) : (
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
              <SearchIcon sx={{ fontSize: { xs: 48, sm: 64 }, color: 'text.secondary', mb: { xs: 1.5, sm: 2 } }} />
              <Typography variant="h6" color="text.secondary" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                No transactions found
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.8125rem', sm: '0.875rem' } }}>
                Try searching by category name or transaction description
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* Empty State */}
      {!debouncedSearchQuery && (
        <Box
          sx={{
            textAlign: 'center',
            py: { xs: 4, sm: 6 },
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            backgroundColor: 'background.paper',
          }}
        >
          <SearchIcon sx={{ fontSize: { xs: 48, sm: 64 }, color: 'text.secondary', mb: { xs: 1.5, sm: 2 } }} />
          <Typography variant="h6" color="text.secondary" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
            Search transactions
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: { xs: 2, sm: 3 }, fontSize: { xs: '0.8125rem', sm: '0.875rem' } }}>
            Search by category name or transaction description
          </Typography>
        </Box>
      )}

      {/* Edit Transaction Dialog */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{
          sx: isMobile ? {
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            maxHeight: '100%',
          } : {},
        }}
      >
        <form onSubmit={handleSubmit(onSubmit)} style={isMobile ? { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' } : {}}>
          <DialogTitle sx={{ flexShrink: 0, pb: { xs: 1, sm: 2 } }}>
            {deleteConfirm
              ? 'Delete Transaction'
              : editingTransaction
              ? 'Edit Transaction'
              : 'Create New Transaction'}
          </DialogTitle>
          <DialogContent sx={{ flexGrow: 1, overflow: 'auto', pt: { xs: 1, sm: 2 } }}>
            {actionError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {actionError}
              </Alert>
            )}
            {deleteError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {deleteError}
              </Alert>
            )}
            {deleteConfirm && editingTransaction ? (
              <Box>
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Are you sure you want to delete this transaction? This action
                  cannot be undone. If this is part of a transfer, both
                  transactions will be deleted.
                </Alert>
                <Box sx={{ mt: 2 }}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                  >
                    <strong>Date:</strong>{' '}
                    {format(new Date(editingTransaction.date), 'MMM dd, yyyy')}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                  >
                    <strong>Account:</strong>{' '}
                    {getAccountName(editingTransaction.account_id)}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                  >
                    <strong>Category:</strong>{' '}
                    {getCategoryName(editingTransaction.category_id)}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                  >
                    <strong>Amount:</strong>{' '}
                    {formatCurrency(
                      editingTransaction.amount,
                      editingTransaction.currency
                    )}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Description:</strong>{' '}
                    {editingTransaction.description || '-'}
                  </Typography>
                </Box>
              </Box>
            ) : (
              <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mt: { xs: 0.5, sm: 1 } }}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth error={!!errors.accountId}>
                    <InputLabel>Account *</InputLabel>
                    <Select
                      {...register('accountId')}
                      label="Account *"
                      value={watchedAccountId || ''}
                      onChange={(e) => setValue('accountId', e.target.value)}
                    >
                      {accounts
                        .filter((acc) => acc.status === 'Active')
                        .map((account) => (
                          <MenuItem
                            key={account.account_id}
                            value={account.account_id}
                          >
                            {account.name} ({account.currency})
                          </MenuItem>
                        ))}
                    </Select>
                    {errors.accountId && (
                      <FormHelperText>
                        {errors.accountId.message}
                      </FormHelperText>
                    )}
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth error={!!errors.type}>
                    <InputLabel>Type *</InputLabel>
                    <Select
                      {...register('type')}
                      label="Type *"
                      value={watchedType || ''}
                      onChange={(e) => setValue('type', e.target.value)}
                    >
                      {TRANSACTION_TYPES.filter(
                        (t) => !t.includes('Transfer')
                      ).map((type) => (
                        <MenuItem key={type} value={type}>
                          {type}
                        </MenuItem>
                      ))}
                    </Select>
                    {errors.type && (
                      <FormHelperText>{errors.type.message}</FormHelperText>
                    )}
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth error={!!errors.categoryId}>
                    <InputLabel>Category *</InputLabel>
                    <Select
                      {...register('categoryId')}
                      label="Category *"
                      value={watchedCategoryId || ''}
                      onChange={(e) => setValue('categoryId', e.target.value)}
                      disabled={!watchedType}
                    >
                      {getFilteredCategories()
                        .filter((cat) => cat.status === 'Active')
                        .map((category) => (
                          <MenuItem
                            key={category.category_id}
                            value={category.category_id}
                          >
                            {category.name}
                          </MenuItem>
                        ))}
                    </Select>
                    {errors.categoryId && (
                      <FormHelperText>
                        {errors.categoryId.message}
                      </FormHelperText>
                    )}
                    {!watchedType && (
                      <FormHelperText>
                        Please select a transaction type first
                      </FormHelperText>
                    )}
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="date"
                    label="Date *"
                    {...register('date')}
                    error={!!errors.date}
                    helperText={errors.date?.message}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Amount *"
                    {...register('amount', { valueAsNumber: true })}
                    error={!!errors.amount}
                    helperText={errors.amount?.message}
                    inputProps={{ step: '0.01', min: '0.01' }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Currency"
                    {...register('currency')}
                    error={!!errors.currency}
                    helperText={
                      errors.currency?.message ||
                      'Auto-filled from account selection'
                    }
                    disabled
                    InputLabelProps={{
                      shrink: !!watch('currency'),
                    }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Description"
                    {...register('description')}
                    error={!!errors.description}
                    helperText={errors.description?.message}
                    multiline
                    rows={2}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth error={!!errors.status}>
                    <InputLabel>Status</InputLabel>
                    <Select
                      {...register('status')}
                      label="Status"
                      value={watchedStatus || ''}
                      onChange={(e) => setValue('status', e.target.value)}
                    >
                      {TRANSACTION_STATUSES.map((status) => (
                        <MenuItem key={status} value={status}>
                          {status}
                        </MenuItem>
                      ))}
                    </Select>
                    {errors.status && (
                      <FormHelperText>{errors.status.message}</FormHelperText>
                    )}
                  </FormControl>
                </Grid>
              </Grid>
            )}
          </DialogContent>
          <DialogActions sx={{ flexShrink: 0, p: { xs: 1.5, sm: 2 }, borderTop: { xs: '1px solid', sm: 'none' }, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 1 }}>
              <Box>
                {editingTransaction && !deleteConfirm && (
                  <Button
                    onClick={handleDeleteClick}
                    color="error"
                    startIcon={<DeleteIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />}
                    size={isMobile ? 'small' : 'medium'}
                    sx={{ textTransform: 'none' }}
                  >
                    Delete
                  </Button>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {deleteConfirm ? (
                  <>
                    <Button
                      onClick={() => setDeleteConfirm(false)}
                      disabled={isDeleting}
                      size={isMobile ? 'small' : 'medium'}
                      sx={{ textTransform: 'none' }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleDeleteConfirm}
                      color="error"
                      variant="contained"
                      disabled={isDeleting}
                      size={isMobile ? 'small' : 'medium'}
                      startIcon={isDeleting ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon sx={{ fontSize: { xs: 16, sm: 20 } }} />}
                      sx={{ textTransform: 'none' }}
                    >
                      {isDeleting ? 'Deleting...' : 'Confirm'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={handleCloseDialog}
                      disabled={isSubmitting}
                      size={isMobile ? 'small' : 'medium'}
                      sx={{ textTransform: 'none' }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={isSubmitting}
                      size={isMobile ? 'small' : 'medium'}
                      startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : null}
                      sx={{ textTransform: 'none' }}
                    >
                      {isSubmitting
                        ? editingTransaction
                          ? 'Updating...'
                          : 'Creating...'
                        : editingTransaction
                        ? 'Update'
                        : 'Create'}
                    </Button>
                  </>
                )}
              </Box>
            </Box>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}

export default Home;
