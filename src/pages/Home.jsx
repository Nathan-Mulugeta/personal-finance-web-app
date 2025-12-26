import { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Box,
  Button,
  Card,
  CardContent,
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
  Paper,
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

      // Recalculate balance for the affected account after transaction is updated
      setTimeout(() => {
        const accountId = transaction?.account_id || data.accountId;
        if (accountId) {
          dispatch(
            recalculateAccountBalance({
              accountId,
              transactions: undefined, // Will use state.transactions.allTransactions
            })
          );
        }
      }, 100);

      // Refresh all transactions in background
      dispatch(fetchTransactions());
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
      // Refresh all transactions in background
      dispatch(fetchTransactions());
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
        sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, mb: 4 }}
      >
        Home
      </Typography>

      {error && <ErrorMessage error={error} />}

      {/* Search Bar */}
      <Card elevation={2} sx={{ mb: 4 }}>
        <CardContent>
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
                fontSize: { xs: '1rem', sm: '1.125rem' },
                py: { xs: 1, sm: 1.5 },
              },
            }}
            autoFocus
          />
          {debouncedSearchQuery && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {searchResults.length} transaction
              {searchResults.length !== 1 ? 's' : ''} found
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Search Results */}
      {debouncedSearchQuery && (
        <Box>
          {searchResults.length > 0 ? (
            <Paper elevation={1}>
              <List>
                {searchResults.map((txn, index) => (
                  <Box key={txn.transaction_id}>
                    <ListItemButton onClick={() => handleOpenDialog(txn)}>
                      <ListItemIcon>
                        <ReceiptIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              flexWrap: 'wrap',
                            }}
                          >
                            <Typography variant="body1" fontWeight="medium">
                              {txn.description || 'No description'}
                            </Typography>
                            <Chip
                              label={txn.type}
                              size="small"
                              color={
                                txn.type === 'Income' ? 'success' : 'error'
                              }
                            />
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="body2" color="text.secondary">
                              {getCategoryName(txn.category_id)} •{' '}
                              {getAccountName(txn.account_id)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {format(parseISO(txn.date), 'MMM dd, yyyy')} •{' '}
                              {formatCurrency(
                                Math.abs(txn.amount),
                                txn.currency
                              )}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItemButton>
                    {index < searchResults.length - 1 && <Divider />}
                  </Box>
                ))}
              </List>
            </Paper>
          ) : (
            <Card>
              <CardContent>
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <SearchIcon
                    sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }}
                  />
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    No transactions found
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Try searching by category name or transaction description
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          )}
        </Box>
      )}

      {/* Empty State */}
      {!debouncedSearchQuery && (
        <Card>
          <CardContent>
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <SearchIcon
                sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }}
              />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                Search transactions
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Search by category name or transaction description
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Edit Transaction Dialog */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogTitle>
            {deleteConfirm
              ? 'Delete Transaction'
              : editingTransaction
              ? 'Edit Transaction'
              : 'Create New Transaction'}
          </DialogTitle>
          <DialogContent>
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
              <Grid container spacing={2} sx={{ mt: 1 }}>
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
          <DialogActions>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
              }}
            >
              <Box>
                {editingTransaction && !deleteConfirm && (
                  <Button
                    onClick={handleDeleteClick}
                    color="error"
                    startIcon={<DeleteIcon />}
                    sx={{ mr: 1 }}
                  >
                    Delete
                  </Button>
                )}
              </Box>
              <Box>
                {deleteConfirm ? (
                  <>
                    <Button
                      onClick={() => setDeleteConfirm(false)}
                      sx={{ mr: 1 }}
                      disabled={isDeleting}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleDeleteConfirm}
                      color="error"
                      variant="contained"
                      disabled={isDeleting}
                      startIcon={
                        isDeleting ? (
                          <CircularProgress size={20} color="inherit" />
                        ) : (
                          <DeleteIcon />
                        )
                      }
                    >
                      {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={handleCloseDialog}
                      sx={{ mr: 1 }}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={isSubmitting}
                      startIcon={
                        isSubmitting ? (
                          <CircularProgress size={20} color="inherit" />
                        ) : null
                      }
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
