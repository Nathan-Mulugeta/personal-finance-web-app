import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormHelperText,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Tooltip,
  Alert,
  Collapse,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FilterListIcon from '@mui/icons-material/FilterList';
import ReceiptIcon from '@mui/icons-material/Receipt';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import {
  fetchTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  clearError,
  filterTransactions,
} from '../store/slices/transactionsSlice';
import { fetchAccounts } from '../store/slices/accountsSlice';
import { fetchCategories } from '../store/slices/categoriesSlice';
import { transactionSchema } from '../schemas/transactionSchema';
import {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
} from '../lib/api/transactions';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { formatCurrency } from '../utils/currencyConversion';
import { format, addDays, subDays, isToday, isSameDay, parseISO } from 'date-fns';

function Transactions() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { transactions, allTransactions, loading, backgroundLoading, isInitialized, error } = useSelector(
    (state) => state.transactions
  );
  const { accounts } = useSelector((state) => state.accounts);
  const { categories } = useSelector((state) => state.categories);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [filters, setFilters] = useState({
    accountId: '',
    categoryId: '',
    type: '',
    status: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
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

  // Load all data on mount - only once
  useEffect(() => {
    dispatch(fetchAccounts({ status: 'Active' }));
    dispatch(fetchCategories({ status: 'Active' }));
    // Load ALL transactions without filters for caching
    if (!isInitialized) {
      dispatch(fetchTransactions());
    }
  }, [dispatch, isInitialized]);
  
  // Apply filter immediately when data is first loaded
  useEffect(() => {
    if (isInitialized && allTransactions.length > 0) {
      // Apply current filters immediately when data loads
      dispatch(filterTransactions(filters));
    }
  }, [dispatch, isInitialized, allTransactions.length, filters.startDate, filters.endDate]);

  // Apply client-side filtering instantly when filters change
  useEffect(() => {
    // Only filter if we have cached data
    if (isInitialized && allTransactions.length > 0) {
      dispatch(filterTransactions(filters));
    }
    
    // Update selectedDate when date filters change
    if (filters.startDate && filters.endDate && filters.startDate === filters.endDate) {
      try {
        const parsedDate = parseISO(filters.startDate);
        if (!isSameDay(parsedDate, selectedDate)) {
          setSelectedDate(parsedDate);
        }
      } catch (e) {
        // Invalid date, ignore
      }
    }
  }, [dispatch, filters, isInitialized, allTransactions.length]);
  
  // Background refresh - separate effect to avoid interfering with filtering
  useEffect(() => {
    if (isInitialized && allTransactions.length > 0) {
      // Refresh in background every 60 seconds
      const refreshInterval = setInterval(() => {
        dispatch(fetchTransactions());
      }, 60000);
      return () => clearInterval(refreshInterval);
    }
  }, [dispatch, isInitialized, allTransactions.length]);

  // Auto-set currency when account is selected
  useEffect(() => {
    if (watchedAccountId) {
      const account = accounts.find((acc) => acc.account_id === watchedAccountId);
      if (account) {
        setValue('currency', account.currency);
      }
    }
  }, [watchedAccountId, accounts, setValue]);

  const handleOpenDialog = (transaction = null) => {
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
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingTransaction(null);
    setDeleteConfirm(false);
    reset();
    dispatch(clearError());
  };

  const onSubmit = async (data) => {
    // Don't submit if in delete confirmation mode
    if (deleteConfirm) return;
    
    try {
      if (editingTransaction) {
        await dispatch(
          updateTransaction({
            transactionId: editingTransaction.transaction_id,
            updates: data,
          })
        ).unwrap();
      } else {
        await dispatch(createTransaction(data)).unwrap();
      }
      handleCloseDialog();
      // Re-apply current filters to update the view
      dispatch(filterTransactions(filters));
      // Refresh all transactions in background
      dispatch(fetchTransactions());
    } catch (err) {
      console.error('Error saving transaction:', err);
    }
  };

  const handleDeleteClick = () => {
    setDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!editingTransaction) return;

    try {
      await dispatch(deleteTransaction(editingTransaction.transaction_id)).unwrap();
      setDeleteConfirm(false);
      handleCloseDialog();
      // Re-apply current filters to update the view
      dispatch(filterTransactions(filters));
      // Refresh all transactions in background
      dispatch(fetchTransactions());
    } catch (err) {
      console.error('Error deleting transaction:', err);
    }
  };

  // Date navigation handlers - instant client-side filtering
  const handlePreviousDay = () => {
    const newDate = subDays(selectedDate, 1);
    setSelectedDate(newDate);
    const dateStr = format(newDate, 'yyyy-MM-dd');
    setFilters((prev) => ({
      ...prev,
      startDate: dateStr,
      endDate: dateStr,
    }));
    // Filter is applied instantly via useEffect
  };

  const handleNextDay = () => {
    const newDate = addDays(selectedDate, 1);
    setSelectedDate(newDate);
    const dateStr = format(newDate, 'yyyy-MM-dd');
    setFilters((prev) => ({
      ...prev,
      startDate: dateStr,
      endDate: dateStr,
    }));
    // Filter is applied instantly via useEffect
  };

  const handleToday = () => {
    const today = new Date();
    setSelectedDate(today);
    const dateStr = format(today, 'yyyy-MM-dd');
    setFilters((prev) => ({
      ...prev,
      startDate: dateStr,
      endDate: dateStr,
    }));
    // Filter is applied instantly via useEffect
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      accountId: '',
      categoryId: '',
      type: '',
      status: '',
      startDate: '',
      endDate: '',
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Cleared':
        return 'success';
      case 'Pending':
        return 'warning';
      case 'Reconciled':
        return 'info';
      case 'Cancelled':
        return 'default';
      default:
        return 'default';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'Income':
        return 'success';
      case 'Expense':
        return 'error';
      case 'Transfer':
      case 'Transfer In':
      case 'Transfer Out':
        return 'info';
      default:
        return 'default';
    }
  };

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

  // Calculate expense aggregation by currency for selected date
  const calculateExpensesByCurrency = () => {
    const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
    const dateTransactions = transactions.filter(
      (t) =>
        t.date === selectedDateStr &&
        (t.type === 'Expense' || t.type === 'Transfer Out')
    );
    
    const expensesByCurrency = {};
    dateTransactions.forEach((t) => {
      const currency = t.currency;
      if (!expensesByCurrency[currency]) {
        expensesByCurrency[currency] = 0;
      }
      expensesByCurrency[currency] += Math.abs(t.amount);
    });
    
    return expensesByCurrency;
  };

  // Filter categories by type
  const getFilteredCategories = () => {
    if (!watchedType) return categories;
    // For Income transactions, show Income categories
    // For Expense transactions, show Expense categories
    // For Transfer, show both
    if (watchedType === 'Income') {
      return categories.filter((cat) => cat.type === 'Income');
    } else if (watchedType === 'Expense') {
      return categories.filter((cat) => cat.type === 'Expense');
    }
    return categories;
  };

  // Only show loading spinner on initial load
  if (loading && !isInitialized && transactions.length === 0) {
    return <LoadingSpinner />;
  }

  const activeFilterCount = Object.values(filters).filter((v) => v !== '').length;

  return (
    <Box sx={{ px: { xs: 1, sm: 0 } }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          mb: 3,
          gap: { xs: 2, sm: 0 },
        }}
      >
        <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}>
          Transactions
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', width: { xs: '100%', sm: 'auto' } }}>
          <Button
            variant="outlined"
            startIcon={<FilterListIcon />}
            onClick={() => setFiltersOpen(!filtersOpen)}
            color={activeFilterCount > 0 ? 'primary' : 'inherit'}
            size="small"
            sx={{ flex: { xs: '1 1 auto', sm: 'none' } }}
          >
            Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
            size="small"
            sx={{ flex: { xs: '1 1 auto', sm: 'none' } }}
          >
            Add Transaction
          </Button>
        </Box>
      </Box>

      {/* Expense Aggregation */}
      {isInitialized && (
        <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {Object.entries(calculateExpensesByCurrency()).map(([currency, total]) => (
            <Box
              key={currency}
              sx={{
                flex: { xs: '1 1 100%', sm: '1 1 auto' },
                minWidth: { xs: '100%', sm: 200 },
                p: 2,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                backgroundColor: 'background.paper',
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 1, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                EXPENSES ({currency})
              </Typography>
              <Typography
                variant="h4"
                fontWeight={700}
                sx={{ color: '#d32f2f', fontSize: { xs: '1.5rem', sm: '1.75rem' } }}
              >
                {formatCurrency(total, currency)}
              </Typography>
            </Box>
          ))}
          {Object.keys(calculateExpensesByCurrency()).length === 0 && (
            <Box
              sx={{
                flex: { xs: '1 1 100%', sm: '1 1 auto' },
                minWidth: { xs: '100%', sm: 200 },
                p: 2,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                backgroundColor: 'background.paper',
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 1, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                EXPENSES
              </Typography>
              <Typography
                variant="h4"
                fontWeight={700}
                sx={{ color: '#d32f2f', fontSize: { xs: '1.5rem', sm: '1.75rem' } }}
              >
                {formatCurrency(0, 'USD')}
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* Date Navigation */}
      <Card elevation={1} sx={{ mb: 3, border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { xs: 'flex-start', sm: 'center' },
              justifyContent: 'space-between',
              gap: { xs: 2, sm: 0 },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: { xs: '100%', sm: 'auto' } }}>
              <IconButton
                onClick={handlePreviousDay}
                size="small"
                sx={{ color: 'primary.main' }}
              >
                <ChevronLeftIcon />
              </IconButton>
              <Button
                variant={isToday(selectedDate) ? 'contained' : 'outlined'}
                startIcon={<TodayIcon />}
                onClick={handleToday}
                sx={{
                  minWidth: { xs: 'auto', sm: 200 },
                  flex: { xs: 1, sm: 'none' },
                  textTransform: 'none',
                  fontWeight: 500,
                }}
              >
                {format(selectedDate, 'MMM dd, yyyy')}
                {isToday(selectedDate) && ' (Today)'}
              </Button>
              <IconButton
                onClick={handleNextDay}
                size="small"
                sx={{ color: 'primary.main' }}
              >
                <ChevronRightIcon />
              </IconButton>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ alignSelf: { xs: 'flex-end', sm: 'auto' } }}>
              {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {error && <ErrorMessage error={error} />}

      {/* Filters Section */}
      <Collapse in={filtersOpen}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Account</InputLabel>
                  <Select
                    value={filters.accountId}
                    label="Account"
                    onChange={(e) => handleFilterChange('accountId', e.target.value)}
                  >
                    <MenuItem value="">All Accounts</MenuItem>
                    {accounts.map((account) => (
                      <MenuItem key={account.account_id} value={account.account_id}>
                        {account.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={filters.categoryId}
                    label="Category"
                    onChange={(e) => handleFilterChange('categoryId', e.target.value)}
                  >
                    <MenuItem value="">All Categories</MenuItem>
                    {categories.map((category) => (
                      <MenuItem key={category.category_id} value={category.category_id}>
                        {category.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={filters.type}
                    label="Type"
                    onChange={(e) => handleFilterChange('type', e.target.value)}
                  >
                    <MenuItem value="">All Types</MenuItem>
                    {TRANSACTION_TYPES.map((type) => (
                      <MenuItem key={type} value={type}>
                        {type}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={filters.status}
                    label="Status"
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                  >
                    <MenuItem value="">All Statuses</MenuItem>
                    {TRANSACTION_STATUSES.map((status) => (
                      <MenuItem key={status} value={status}>
                        {status}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="Start Date"
                  value={filters.startDate}
                  onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="End Date"
                  value={filters.endDate}
                  onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={clearFilters}
                  disabled={activeFilterCount === 0}
                >
                  Clear Filters
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Collapse>

      {transactions.length === 0 ? (
        <Card>
          <CardContent>
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <ReceiptIcon
                sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }}
              />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No transactions yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Create your first transaction to start tracking your finances
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleOpenDialog()}
              >
                Create Transaction
              </Button>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Box>
          {transactions.map((transaction) => {
            const description = transaction.description || '';
            
            return (
              <Paper
                key={transaction.transaction_id}
                onClick={() => handleOpenDialog(transaction)}
                elevation={0}
                sx={{
                  cursor: 'pointer',
                  p: { xs: 1.5, sm: 2 },
                  mb: 1,
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  alignItems: { xs: 'flex-start', sm: 'center' },
                  justifyContent: 'space-between',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                }}
              >
                {/* Left side: Category, Account, Description, Date */}
                <Box sx={{ flex: 1, minWidth: 0, pr: { xs: 0, sm: 2 }, width: { xs: '100%', sm: 'auto' } }}>
                  {/* Category - Bold */}
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    sx={{ 
                      mb: 0.5, 
                      fontSize: { xs: '0.8125rem', sm: '0.875rem' },
                      lineHeight: 1.4,
                    }}
                  >
                    {getCategoryName(transaction.category_id)}
                  </Typography>
                  
                  {/* Account - Medium weight, different shade */}
                  <Typography
                    variant="body2"
                    fontWeight={500}
                    sx={{ 
                      mb: 0.5, 
                      fontSize: { xs: '0.75rem', sm: '0.8125rem' },
                      color: 'text.secondary',
                      opacity: 0.8,
                      lineHeight: 1.4,
                    }}
                  >
                    {getAccountName(transaction.account_id)}
                  </Typography>
                  
                  {/* Description - Muted, with ellipsis */}
                  {description && (
                    <Typography
                      variant="body2"
                      sx={{ 
                        fontSize: { xs: '0.75rem', sm: '0.8125rem' },
                        color: 'text.secondary',
                        opacity: 0.6,
                        lineHeight: 1.5,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        mb: 0.5,
                      }}
                      title={description}
                    >
                      {description}
                    </Typography>
                  )}
                  
                  {/* Date - Muted */}
                  <Typography
                    variant="body2"
                    sx={{ 
                      fontSize: '0.75rem',
                      color: 'text.secondary',
                      opacity: 0.6,
                    }}
                  >
                    {(() => {
                      try {
                        // Use created_at if available for more accurate timestamp
                        const dateStr = transaction.created_at 
                          ? transaction.created_at.split('T')[0]
                          : transaction.date;
                        const timeStr = transaction.created_at 
                          ? transaction.created_at.split('T')[1]?.substring(0, 5)
                          : null;
                        const date = parseISO(dateStr);
                        
                        if (isToday(date) && timeStr) {
                          // Format with time from created_at
                          const [hours, minutes] = timeStr.split(':');
                          const dateTime = new Date(date);
                          dateTime.setHours(parseInt(hours), parseInt(minutes));
                          return format(dateTime, 'MMM dd, yyyy h:mm a');
                        }
                        return isToday(date)
                          ? format(date, 'MMM dd, yyyy h:mm a')
                          : format(date, 'MMM dd, yyyy');
                      } catch {
                        return transaction.date;
                      }
                    })()}
                  </Typography>
                </Box>
                
                {/* Right side: Amount */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 0.5,
                    flexShrink: 0,
                    alignSelf: { xs: 'flex-end', sm: 'auto' },
                    mt: { xs: 1, sm: 0 },
                  }}
                >
                  {/* Currency - Muted */}
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: '0.75rem',
                      color: 'text.secondary',
                      opacity: 0.6,
                      fontWeight: 500,
                    }}
                  >
                    {transaction.currency}
                  </Typography>
                  {/* Amount - Color based on type */}
                  <Typography
                    variant="body1"
                    fontWeight={700}
                    sx={{
                      color: transaction.type === 'Income' || transaction.type === 'Transfer In'
                        ? '#2e7d32' // Softer green
                        : transaction.type === 'Expense' || transaction.type === 'Transfer Out'
                        ? '#d32f2f' // Softer red
                        : 'text.primary',
                      fontSize: { xs: '0.9375rem', sm: '1rem' },
                    }}
                  >
                    {new Intl.NumberFormat('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(Math.abs(transaction.amount))}
                  </Typography>
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      {/* Create/Edit Dialog */}
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
            {deleteConfirm && editingTransaction ? (
              <Box>
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Are you sure you want to delete this transaction? This action cannot be undone.
                  If this is part of a transfer, both transactions will be deleted.
                </Alert>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    <strong>Date:</strong> {format(new Date(editingTransaction.date), 'MMM dd, yyyy')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    <strong>Account:</strong> {getAccountName(editingTransaction.account_id)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    <strong>Category:</strong> {getCategoryName(editingTransaction.category_id)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    <strong>Amount:</strong>{' '}
                    {formatCurrency(editingTransaction.amount, editingTransaction.currency)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Description:</strong> {editingTransaction.description || '-'}
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
                        <MenuItem key={account.account_id} value={account.account_id}>
                          {account.name} ({account.currency})
                        </MenuItem>
                      ))}
                  </Select>
                  {errors.accountId && (
                    <FormHelperText>{errors.accountId.message}</FormHelperText>
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
                    <FormHelperText>{errors.categoryId.message}</FormHelperText>
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
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
                    <Button onClick={() => setDeleteConfirm(false)} sx={{ mr: 1 }}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleDeleteConfirm}
                      color="error"
                      variant="contained"
                      startIcon={<DeleteIcon />}
                    >
                      Confirm Delete
                    </Button>
                  </>
                ) : (
                  <>
                    <Button onClick={handleCloseDialog} sx={{ mr: 1 }}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="contained">
                      {editingTransaction ? 'Update' : 'Create'}
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

export default Transactions;
