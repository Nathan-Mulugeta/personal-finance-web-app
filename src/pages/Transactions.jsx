import { useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
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
import DeleteIcon from '@mui/icons-material/Delete';
import FilterListIcon from '@mui/icons-material/FilterList';
import ReceiptIcon from '@mui/icons-material/Receipt';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import {
  fetchTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  bulkDeleteTransactions as bulkDeleteTransactionsThunk,
  removeDeletedTransactions,
  clearError,
  filterTransactions,
} from '../store/slices/transactionsSlice';
import { fetchAccounts, recalculateAccountBalance } from '../store/slices/accountsSlice';
import { fetchCategories } from '../store/slices/categoriesSlice';
import { fetchTransfers, createTransfer, deleteTransfer } from '../store/slices/transfersSlice';
import { transactionSchema } from '../schemas/transactionSchema';
import { transferSchema } from '../schemas/transferSchema';
import {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
} from '../lib/api/transactions';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { formatCurrency } from '../utils/currencyConversion';
import { format, addDays, subDays, isToday, isSameDay, parseISO } from 'date-fns';
import { usePageRefresh } from '../hooks/usePageRefresh';
import { refreshAllData } from '../utils/refreshAllData';
import { flattenCategoryTree } from '../utils/categoryHierarchy';

function Transactions() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { transactions, allTransactions, loading, backgroundLoading, isInitialized, error } = useSelector(
    (state) => state.transactions
  );
  const { accounts } = useSelector((state) => state.accounts);
  const { categories } = useSelector((state) => state.categories);
  const { transfers = [] } = useSelector((state) => state.transfers);
  const [openDialog, setOpenDialog] = useState(false);
  const [openTransferDialog, setOpenTransferDialog] = useState(false);
  const [showTransfers, setShowTransfers] = useState(true);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
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
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

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

  // Transfer form
  const {
    register: registerTransfer,
    handleSubmit: handleSubmitTransfer,
    formState: { errors: transferErrors },
    reset: resetTransfer,
    setValue: setValueTransfer,
    watch: watchTransfer,
  } = useForm({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      fromAccountId: '',
      toAccountId: '',
      amount: '',
      fromAmount: '',
      toAmount: '',
      categoryId: '',
      description: '',
      status: 'Cleared',
      date: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  const watchedFromAccountId = watchTransfer('fromAccountId');
  const watchedToAccountId = watchTransfer('toAccountId');
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const [transferError, setTransferError] = useState(null);
  const [deleteTransferConfirm, setDeleteTransferConfirm] = useState(null);
  const [isDeletingTransfer, setIsDeletingTransfer] = useState(false);

  // Refresh data on navigation
  usePageRefresh({
    dataTypes: ['transactions', 'accounts', 'categories', 'transfers'],
    filters: {
      accounts: { status: 'Active' },
      categories: { status: 'Active' },
    },
  });

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
  }, [dispatch, filters, isInitialized, allTransactions.length, selectedDate]);

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
    setActionError(null);
    setIsSubmitting(false);
    setDeleteError(null);
    setIsDeleting(false);
    setOpenDialog(true);
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
      let transaction
      if (editingTransaction) {
        transaction = await dispatch(
          updateTransaction({
            transactionId: editingTransaction.transaction_id,
            updates: data,
          })
        ).unwrap();
      } else {
        transaction = await dispatch(createTransaction(data)).unwrap();
      }
      
      handleCloseDialog();
      
      // Re-apply current filters to update the view
      dispatch(filterTransactions(filters));
      
      // Refresh all data to ensure all pages have fresh data
      await refreshAllData(dispatch);
    } catch (err) {
      console.error('Error saving transaction:', err);
      const errorMessage = err?.message || 'Failed to save transaction. Please try again.';
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
      const deletedTransactionId = await dispatch(deleteTransaction(editingTransaction.transaction_id)).unwrap();
      
      // Recalculate balance for the affected account
      // Use setTimeout to ensure transaction is removed from state
      setTimeout(() => {
        if (editingTransaction?.account_id) {
          dispatch(recalculateAccountBalance({ 
            accountId: editingTransaction.account_id,
            transactions: undefined // Will use state.transactions.allTransactions
          }))
        }
      }, 100)
      
      setDeleteConfirm(false);
      handleCloseDialog();
      
      // Re-apply current filters to update the view
      dispatch(filterTransactions(filters));
      
      // Refresh all data to ensure all pages have fresh data
      await refreshAllData(dispatch);
    } catch (err) {
      console.error('Error deleting transaction:', err);
      const errorMessage = err?.message || 'Failed to delete transaction. Please try again.';
      setDeleteError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  // Transfer handlers
  const handleOpenTransferDialog = () => {
    resetTransfer({
      fromAccountId: '',
      toAccountId: '',
      amount: '',
      fromAmount: '',
      toAmount: '',
      categoryId: '',
      description: '',
      status: 'Cleared',
      date: format(new Date(), 'yyyy-MM-dd'),
    });
    setTransferError(null);
    setIsSubmittingTransfer(false);
    setOpenTransferDialog(true);
  };

  const handleCloseTransferDialog = () => {
    setOpenTransferDialog(false);
    setTransferError(null);
    setIsSubmittingTransfer(false);
    resetTransfer();
  };

  const onSubmitTransfer = async (data) => {
    setIsSubmittingTransfer(true);
    setTransferError(null);
    try {
      const cleanedData = { ...data };

      if (!cleanedData.fromAccountId || cleanedData.fromAccountId === '') {
        setTransferError('From account is required');
        setIsSubmittingTransfer(false);
        return;
      }
      if (!cleanedData.toAccountId || cleanedData.toAccountId === '') {
        setTransferError('To account is required');
        setIsSubmittingTransfer(false);
        return;
      }

      if (cleanedData.amount === '' || cleanedData.amount === null) {
        cleanedData.amount = undefined;
      }
      if (cleanedData.fromAmount === '' || cleanedData.fromAmount === null) {
        cleanedData.fromAmount = undefined;
      }
      if (cleanedData.toAmount === '' || cleanedData.toAmount === null) {
        cleanedData.toAmount = undefined;
      }

      const sameCurrency = (() => {
        if (!cleanedData.fromAccountId || !cleanedData.toAccountId) return true;
        const fromAccount = accounts.find(
          (acc) => acc.account_id === cleanedData.fromAccountId
        );
        const toAccount = accounts.find(
          (acc) => acc.account_id === cleanedData.toAccountId
        );
        return fromAccount?.currency === toAccount?.currency;
      })();

      if (sameCurrency) {
        delete cleanedData.fromAmount;
        delete cleanedData.toAmount;
        if (!cleanedData.amount || isNaN(cleanedData.amount)) {
          setTransferError('Invalid amount for same currency transfer');
          setIsSubmittingTransfer(false);
          return;
        }
      } else {
        delete cleanedData.amount;
        if (
          !cleanedData.fromAmount ||
          !cleanedData.toAmount ||
          isNaN(cleanedData.fromAmount) ||
          isNaN(cleanedData.toAmount)
        ) {
          setTransferError('Invalid amounts for multi-currency transfer');
          setIsSubmittingTransfer(false);
          return;
        }
      }

      const transferData = {
        fromAccountId: cleanedData.fromAccountId,
        toAccountId: cleanedData.toAccountId,
        categoryId: cleanedData.categoryId || null,
        description: cleanedData.description || '',
        status: cleanedData.status || 'Cleared',
        date: cleanedData.date || format(new Date(), 'yyyy-MM-dd'),
      };

      if (sameCurrency) {
        transferData.amount = parseFloat(cleanedData.amount);
      } else {
        transferData.fromAmount = parseFloat(cleanedData.fromAmount);
        transferData.toAmount = parseFloat(cleanedData.toAmount);
      }

      await dispatch(createTransfer(transferData)).unwrap();

      handleCloseTransferDialog();

      // Refresh all data to ensure all pages have fresh data
      await refreshAllData(dispatch);
    } catch (err) {
      console.error('Error creating transfer:', err);
      const errorMessage = err?.message || 'Failed to create transfer. Please try again.';
      setTransferError(errorMessage);
    } finally {
      setIsSubmittingTransfer(false);
    }
  };

  const handleDeleteTransfer = async () => {
    if (!deleteTransferConfirm) return;

    setIsDeletingTransfer(true);
    try {
      const transactionId =
        deleteTransferConfirm.transferOut?.transaction_id ||
        deleteTransferConfirm.transferIn?.transaction_id;

      if (!transactionId) {
        setIsDeletingTransfer(false);
        return;
      }

      const result = await dispatch(deleteTransfer(transactionId)).unwrap();
      
      // Remove transactions from transactions Redux state
      if (result?.transactionIds && result.transactionIds.length > 0) {
        dispatch(removeDeletedTransactions(result.transactionIds));
      }

      setDeleteTransferConfirm(null);

      // Refresh all data to ensure all pages have fresh data
      await refreshAllData(dispatch);
    } catch (err) {
      console.error('Error deleting transfer:', err);
    } finally {
      setIsDeletingTransfer(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) return;

    setIsBulkDeleting(true);
    setBulkDeleteError(null);

    try {
      // Separate transactions and transfers
      const transactionIds = [];
      const transferItems = [];

      selectedItems.forEach((itemId) => {
        if (itemId.startsWith('transfer-')) {
          // Find the transfer item
          const transferItem = combinedItems.find((item) => getItemId(item) === itemId);
          if (transferItem && transferItem.type === 'transfer') {
            transferItems.push(transferItem.data);
          }
        } else {
          // It's a transaction ID
          transactionIds.push(itemId);
        }
      });

      // Delete transactions in bulk
      if (transactionIds.length > 0) {
        const result = await dispatch(bulkDeleteTransactionsThunk(transactionIds)).unwrap();
        
        // Update Redux state (already handled by thunk, but ensure filters are reapplied)
        dispatch(filterTransactions(filters));
      }

      // Delete transfers individually (they need special handling)
      for (const transfer of transferItems) {
        try {
          const transactionId =
            transfer.transferOut?.transaction_id ||
            transfer.transferIn?.transaction_id;

          if (transactionId) {
            const result = await dispatch(deleteTransfer(transactionId)).unwrap();
            
            // Remove transactions from transactions Redux state
            if (result?.transactionIds && result.transactionIds.length > 0) {
              dispatch(bulkDeleteTransactionsAction(result.transactionIds));
            }
          }
        } catch (err) {
          console.error('Error deleting transfer:', err);
          // Continue with other deletions even if one fails
        }
      }

      // Recalculate balances for affected accounts
      const affectedAccountIds = new Set();
      transactionIds.forEach((id) => {
        const transaction = transactions.find((t) => t.transaction_id === id);
        if (transaction?.account_id) {
          affectedAccountIds.add(transaction.account_id);
        }
      });
      transferItems.forEach((transfer) => {
        if (transfer.transferOut?.account_id) {
          affectedAccountIds.add(transfer.transferOut.account_id);
        }
        if (transfer.transferIn?.account_id) {
          affectedAccountIds.add(transfer.transferIn.account_id);
        }
      });

      // Recalculate balances
      affectedAccountIds.forEach((accountId) => {
        setTimeout(() => {
          dispatch(recalculateAccountBalance({
            accountId,
            transactions: undefined,
          }));
        }, 100);
      });

      // Clear selection
      setSelectedItems(new Set());
      setBulkDeleteConfirm(false);

      // Re-apply current filters to update the view
      dispatch(filterTransactions(filters));

      // Refresh all data to ensure all pages have fresh data
      await refreshAllData(dispatch);
    } catch (err) {
      console.error('Error bulk deleting:', err);
      const errorMessage = err?.message || 'Failed to delete items. Please try again.';
      setBulkDeleteError(errorMessage);
    } finally {
      setIsBulkDeleting(false);
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

  // Google-style chip styling for status badges
  const getStatusChipSx = (status) => {
    switch (status) {
      case 'Cleared':
        return {
          backgroundColor: '#e6f4ea',
          color: '#1e8e3e',
          fontWeight: 500,
        };
      case 'Pending':
        return {
          backgroundColor: '#fef7e0',
          color: '#e37400',
          fontWeight: 500,
        };
      case 'Reconciled':
        return {
          backgroundColor: '#e8f0fe',
          color: '#1a73e8',
          fontWeight: 500,
        };
      case 'Cancelled':
        return {
          backgroundColor: '#f1f3f4',
          color: '#5f6368',
          fontWeight: 500,
        };
      default:
        return {
          backgroundColor: '#f1f3f4',
          color: '#5f6368',
          fontWeight: 500,
        };
    }
  };

  // Google-style chip styling for type badges
  const getTypeChipSx = (type) => {
    switch (type) {
      case 'Income':
        return {
          backgroundColor: '#e6f4ea',
          color: '#1e8e3e',
          fontWeight: 500,
        };
      case 'Expense':
        return {
          backgroundColor: '#fce8e6',
          color: '#d93025',
          fontWeight: 500,
        };
      case 'Transfer':
      case 'Transfer In':
      case 'Transfer Out':
        return {
          backgroundColor: '#e8f0fe',
          color: '#1a73e8',
          fontWeight: 500,
        };
      default:
        return {
          backgroundColor: '#f1f3f4',
          color: '#5f6368',
          fontWeight: 500,
        };
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

  // Get account currency helper
  const getAccountCurrency = (accountId) => {
    const account = accounts.find((acc) => acc.account_id === accountId);
    return account?.currency || '';
  };

  // Determine if same currency or multi-currency for transfers
  const isSameCurrency = () => {
    if (!watchedFromAccountId || !watchedToAccountId) return true;
    const fromAccount = accounts.find(
      (acc) => acc.account_id === watchedFromAccountId
    );
    const toAccount = accounts.find(
      (acc) => acc.account_id === watchedToAccountId
    );
    return fromAccount?.currency === toAccount?.currency;
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

  // Filter categories by type and flatten with hierarchy
  const getFilteredCategories = () => {
    if (!watchedType) return flattenCategoryTree(categories);
    // For Income transactions, show Income categories
    // For Expense transactions, show Expense categories
    // For Transfer, show both
    let filtered;
    if (watchedType === 'Income') {
      filtered = categories.filter((cat) => cat.type === 'Income');
    } else if (watchedType === 'Expense') {
      filtered = categories.filter((cat) => cat.type === 'Expense');
    } else {
      filtered = categories;
    }
    return flattenCategoryTree(filtered);
  };

  // Only show loading spinner on initial load
  if (loading && !isInitialized && transactions.length === 0) {
    return <LoadingSpinner />;
  }

  // Combine transactions and transfers for display
  const combinedItems = useMemo(() => {
    const items = [];
    
    // Add transactions
    transactions.forEach(txn => {
      items.push({ type: 'transaction', data: txn });
    });
    
    // Add transfers if enabled
    if (showTransfers && transfers && Array.isArray(transfers)) {
      transfers.forEach(transfer => {
        const transferDate = transfer.date || transfer.transferOut?.date || transfer.transferIn?.date;
        // Check if transfer matches current date filter
        if (filters.startDate && filters.endDate) {
          // Skip transfers with no date or invalid date
          if (!transferDate || typeof transferDate !== 'string' || transferDate.trim() === '') {
            return;
          }
          
          // Normalize dates to YYYY-MM-DD format for comparison (handle dates with time components)
          const normalizedTransferDate = transferDate.split('T')[0].trim();
          const normalizedStartDate = filters.startDate.split('T')[0].trim();
          const normalizedEndDate = filters.endDate.split('T')[0].trim();
          
          // Validate normalized dates are in correct format (YYYY-MM-DD)
          if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedTransferDate)) {
            return; // Skip invalid date formats
          }
          
          // Skip transfers outside date range
          if (normalizedTransferDate < normalizedStartDate || normalizedTransferDate > normalizedEndDate) {
            return;
          }
        }
        items.push({ type: 'transfer', data: transfer });
      });
    }
    
    // Sort by date descending
    items.sort((a, b) => {
      const dateA = a.type === 'transaction' 
        ? new Date(a.data.date || 0)
        : new Date(a.data.date || a.data.transferOut?.date || a.data.transferIn?.date || 0);
      const dateB = b.type === 'transaction'
        ? new Date(b.data.date || 0)
        : new Date(b.data.date || b.data.transferOut?.date || b.data.transferIn?.date || 0);
      return dateB - dateA;
    });
    
    return items;
  }, [transactions, transfers, showTransfers, filters.startDate, filters.endDate]);

  const activeFilterCount = Object.values(filters).filter((v) => v !== '').length;

  // Selection handlers
  const getItemId = (item) => {
    if (item.type === 'transfer') {
      const transfer = item.data;
      return `transfer-${transfer.transferId || transfer.transferOut?.transaction_id || transfer.transferIn?.transaction_id}`;
    }
    return item.data.transaction_id;
  };

  const handleItemSelect = (itemId, checked) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(itemId);
      } else {
        newSet.delete(itemId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const allIds = combinedItems.map((item) => getItemId(item));
      setSelectedItems(new Set(allIds));
    } else {
      setSelectedItems(new Set());
    }
  };

  const isAllSelected = combinedItems.length > 0 && combinedItems.every((item) => selectedItems.has(getItemId(item)));
  const isIndeterminate = combinedItems.some((item) => selectedItems.has(getItemId(item))) && !isAllSelected;

  return (
    <Box sx={{ px: { xs: 1, sm: 0 }, overflow: 'hidden', width: '100%', boxSizing: 'border-box' }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          mb: 2,
          gap: { xs: 1.5, sm: 0 },
        }}
      >
        <Typography 
          variant="h5" 
          sx={{ 
            fontSize: { xs: '1.25rem', sm: '1.5rem' },
            fontWeight: 500,
            color: 'text.primary',
          }}
        >
          Transactions
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', width: { xs: '100%', sm: 'auto' } }}>
          <Button
            variant="outlined"
            startIcon={<FilterListIcon sx={{ fontSize: 18 }} />}
            onClick={() => setFiltersOpen(!filtersOpen)}
            color={activeFilterCount > 0 ? 'primary' : 'inherit'}
            size="small"
            sx={{ 
              flex: { xs: '1 1 auto', sm: 'none' },
              textTransform: 'none',
              fontSize: '0.875rem',
              minHeight: 36,
            }}
          >
            Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </Button>
          <Button
            variant="outlined"
            startIcon={<SwapHorizIcon sx={{ fontSize: 18 }} />}
            onClick={handleOpenTransferDialog}
            size="small"
            sx={{ 
              flex: { xs: '1 1 auto', sm: 'none' },
              textTransform: 'none',
              fontSize: '0.875rem',
              minHeight: 36,
            }}
          >
            Transfer
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon sx={{ fontSize: 18 }} />}
            onClick={() => handleOpenDialog()}
            size="small"
            sx={{ 
              flex: { xs: '1 1 auto', sm: 'none' },
              textTransform: 'none',
              fontSize: '0.875rem',
              minHeight: 36,
            }}
          >
            Add Transaction
          </Button>
        </Box>
      </Box>

      {/* Expense Aggregation */}
      {isInitialized && (
        <Box sx={{ mb: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          {Object.entries(calculateExpensesByCurrency()).map(([currency, total]) => (
            <Box
              key={currency}
              sx={{
                flex: { xs: '1 1 100%', sm: '1 1 auto' },
                minWidth: { xs: '100%', sm: 180 },
                p: 1.5,
                borderBottom: '2px solid',
                borderColor: 'divider',
                backgroundColor: 'transparent',
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 0.5, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500 }}
              >
                Expenses ({currency})
              </Typography>
              <Typography
                variant="h6"
                fontWeight={600}
                sx={{ color: '#d93025', fontSize: { xs: '1.25rem', sm: '1.5rem' } }}
              >
                {formatCurrency(total, currency)}
              </Typography>
            </Box>
          ))}
          {Object.keys(calculateExpensesByCurrency()).length === 0 && (
            <Box
              sx={{
                flex: { xs: '1 1 100%', sm: '1 1 auto' },
                minWidth: { xs: '100%', sm: 180 },
                p: 1.5,
                borderBottom: '2px solid',
                borderColor: 'divider',
                backgroundColor: 'transparent',
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 0.5, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500 }}
              >
                Expenses
              </Typography>
              <Typography
                variant="h6"
                fontWeight={600}
                sx={{ color: '#d93025', fontSize: { xs: '1.25rem', sm: '1.5rem' } }}
              >
                {formatCurrency(0, 'USD')}
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* Date Navigation */}
      <Box 
        sx={{ 
          mb: 2, 
          p: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: { xs: 1.5, sm: 0 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: { xs: '100%', sm: 'auto' } }}>
          <IconButton
            onClick={handlePreviousDay}
            size="small"
            sx={{ 
              color: 'text.secondary',
              minWidth: 36,
              minHeight: 36,
              '&:hover': { backgroundColor: 'action.hover' }
            }}
          >
            <ChevronLeftIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <Button
            variant={isToday(selectedDate) ? 'contained' : 'outlined'}
            startIcon={<TodayIcon sx={{ fontSize: 18 }} />}
            onClick={handleToday}
            sx={{
              minWidth: { xs: 'auto', sm: 180 },
              flex: { xs: 1, sm: 'none' },
              textTransform: 'none',
              fontWeight: 500,
              fontSize: '0.875rem',
              minHeight: 36,
            }}
          >
            {format(selectedDate, 'MMM dd, yyyy')}
            {isToday(selectedDate) && ' (Today)'}
          </Button>
          <IconButton
            onClick={handleNextDay}
            size="small"
            sx={{ 
              color: 'text.secondary',
              minWidth: 36,
              minHeight: 36,
              '&:hover': { backgroundColor: 'action.hover' }
            }}
          >
            <ChevronRightIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
        <Typography 
          variant="body2" 
          color="text.secondary" 
          sx={{ 
            alignSelf: { xs: 'flex-end', sm: 'auto' },
            fontSize: '0.8125rem',
          }}
        >
          {(() => {
            // Count filtered transfers (same logic as combinedItems)
            let transferCount = 0;
            if (showTransfers && transfers && Array.isArray(transfers)) {
              transfers.forEach(transfer => {
                const transferDate = transfer.date || transfer.transferOut?.date || transfer.transferIn?.date;
                // Check if transfer matches current date filter
                if (filters.startDate && filters.endDate) {
                  // Skip transfers with no date or invalid date
                  if (!transferDate || typeof transferDate !== 'string' || transferDate.trim() === '') {
                    return;
                  }
                  
                  // Normalize dates to YYYY-MM-DD format for comparison (handle dates with time components)
                  const normalizedTransferDate = transferDate.split('T')[0].trim();
                  const normalizedStartDate = filters.startDate.split('T')[0].trim();
                  const normalizedEndDate = filters.endDate.split('T')[0].trim();
                  
                  // Validate normalized dates are in correct format (YYYY-MM-DD)
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedTransferDate)) {
                    return; // Skip invalid date formats
                  }
                  
                  // Skip transfers outside date range
                  if (normalizedTransferDate < normalizedStartDate || normalizedTransferDate > normalizedEndDate) {
                    return;
                  }
                }
                transferCount++;
              });
            }
            
            const totalCount = transactions.length + transferCount;
            if (totalCount === 0) return 'No items';
            const items = [];
            if (transactions.length > 0) {
              items.push(`${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`);
            }
            if (transferCount > 0) {
              items.push(`${transferCount} transfer${transferCount !== 1 ? 's' : ''}`);
            }
            return items.join(', ');
          })()}
        </Typography>
      </Box>

      {error && <ErrorMessage error={error} />}

      {/* Selection Header */}
      {combinedItems.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 1.5,
            p: 1,
            height: 48,
            borderBottom: '1px solid',
            borderColor: 'divider',
            backgroundColor: selectedItems.size > 0 ? 'action.selected' : 'transparent',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Checkbox
              checked={isAllSelected}
              indeterminate={isIndeterminate}
              onChange={(e) => handleSelectAll(e.target.checked)}
              size="small"
            />
            <Typography 
              variant="body2" 
              color="text.secondary"
              sx={{ fontSize: '0.875rem' }}
            >
              {selectedItems.size > 0
                ? `${selectedItems.size} item${selectedItems.size !== 1 ? 's' : ''} selected`
                : 'Select items to delete'}
            </Typography>
          </Box>
          {selectedItems.size > 0 && (
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<DeleteIcon sx={{ fontSize: 18 }} />}
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={isBulkDeleting}
              sx={{
                textTransform: 'none',
                fontSize: '0.875rem',
                minHeight: 36,
              }}
            >
              Delete Selected
            </Button>
          )}
        </Box>
      )}

      {/* Filters Section */}
      <Collapse in={filtersOpen}>
        <Box 
          sx={{ 
            mb: 2, 
            p: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.default',
          }}
        >
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontSize: '0.875rem' }}>Account</InputLabel>
                <Select
                  value={filters.accountId}
                  label="Account"
                  onChange={(e) => handleFilterChange('accountId', e.target.value)}
                  sx={{ fontSize: '0.875rem', minHeight: 36 }}
                >
                  <MenuItem value="" sx={{ fontSize: '0.875rem' }}>All Accounts</MenuItem>
                  {accounts.map((account) => (
                    <MenuItem key={account.account_id} value={account.account_id} sx={{ fontSize: '0.875rem' }}>
                      {account.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontSize: '0.875rem' }}>Category</InputLabel>
                <Select
                  value={filters.categoryId}
                  label="Category"
                  onChange={(e) => handleFilterChange('categoryId', e.target.value)}
                  sx={{ fontSize: '0.875rem', minHeight: 36 }}
                >
                  <MenuItem value="" sx={{ fontSize: '0.875rem' }}>All Categories</MenuItem>
                  {flattenCategoryTree(categories).map((category) => (
                    <MenuItem 
                      key={category.category_id} 
                      value={category.category_id} 
                      sx={{ 
                        fontSize: '0.875rem',
                        pl: 2 + (category.depth || 0) * 1.5,
                        fontWeight: category.hasChildren ? 600 : 400,
                      }}
                    >
                      {category.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontSize: '0.875rem' }}>Type</InputLabel>
                <Select
                  value={filters.type}
                  label="Type"
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  sx={{ fontSize: '0.875rem', minHeight: 36 }}
                >
                  <MenuItem value="" sx={{ fontSize: '0.875rem' }}>All Types</MenuItem>
                  {TRANSACTION_TYPES.map((type) => (
                    <MenuItem key={type} value={type} sx={{ fontSize: '0.875rem' }}>
                      {type}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ fontSize: '0.875rem' }}>Status</InputLabel>
                <Select
                  value={filters.status}
                  label="Status"
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  sx={{ fontSize: '0.875rem', minHeight: 36 }}
                >
                  <MenuItem value="" sx={{ fontSize: '0.875rem' }}>All Statuses</MenuItem>
                  {TRANSACTION_STATUSES.map((status) => (
                    <MenuItem key={status} value={status} sx={{ fontSize: '0.875rem' }}>
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
                sx={{ 
                  '& .MuiInputBase-root': { fontSize: '0.875rem', minHeight: 36 },
                  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
                }}
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
                sx={{ 
                  '& .MuiInputBase-root': { fontSize: '0.875rem', minHeight: 36 },
                  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={clearFilters}
                  disabled={activeFilterCount === 0}
                  sx={{
                    textTransform: 'none',
                    fontSize: '0.875rem',
                    minHeight: 36,
                  }}
                >
                  Clear Filters
                </Button>
                <FormControl size="small">
                  <Select
                    value={showTransfers ? 'show' : 'hide'}
                    onChange={(e) => setShowTransfers(e.target.value === 'show')}
                    sx={{ minWidth: 150, fontSize: '0.875rem', minHeight: 36 }}
                  >
                    <MenuItem value="show" sx={{ fontSize: '0.875rem' }}>Show Transfers</MenuItem>
                    <MenuItem value="hide" sx={{ fontSize: '0.875rem' }}>Hide Transfers</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </Collapse>

      {combinedItems.length === 0 ? (
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
          <ReceiptIcon
            sx={{ fontSize: { xs: 40, sm: 48 }, color: 'text.secondary', mb: 1.5, opacity: 0.5 }}
          />
          <Typography variant="h6" color="text.secondary" gutterBottom sx={{ fontSize: { xs: '0.9375rem', sm: '1rem' }, fontWeight: 500 }}>
            No transactions yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: { xs: '0.8125rem', sm: '0.875rem' } }}>
            Create your first transaction to start tracking your finances
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon sx={{ fontSize: 18 }} />}
            onClick={() => handleOpenDialog()}
            sx={{
              textTransform: 'none',
              fontSize: '0.875rem',
              minHeight: 36,
            }}
          >
            Create Transaction
          </Button>
        </Box>
      ) : (
        <>
          {/* Mobile Card View */}
          <Box sx={{ display: { xs: 'block', md: 'none' }, overflow: 'hidden', width: '100%' }}>
            {combinedItems.map((item) => {
              if (item.type === 'transfer') {
                const transfer = item.data;
                const transferOut = transfer.transferOut;
                const transferIn = transfer.transferIn;
                const transferDate = transfer.date || transferOut?.date || transferIn?.date;
                const transferId = `transfer-${transfer.transferId || transferOut?.transaction_id || transferIn?.transaction_id}`;
                const isSelected = selectedItems.has(transferId);

                return (
                  <Box
                    key={transferId}
                    sx={{
                      mb: 1,
                      p: 1.5,
                      border: '1px solid',
                      borderColor: isSelected ? 'primary.main' : 'divider',
                      borderRadius: 1,
                      backgroundColor: isSelected ? 'action.selected' : 'background.paper',
                      display: 'flex',
                      gap: 1,
                      alignItems: 'flex-start',
                      overflow: 'hidden',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  >
                    <Checkbox
                      checked={isSelected}
                      onChange={(e) => handleItemSelect(transferId, e.target.checked)}
                      size="small"
                      sx={{ p: 0, mt: 0.25, flexShrink: 0 }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', width: 0 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 0.5, width: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, overflow: 'hidden' }}>
                          <SwapHorizIcon sx={{ fontSize: 16, color: 'primary.main', flexShrink: 0 }} />
                          <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8125rem', flexShrink: 0 }}>
                            Transfer
                          </Typography>
                          <Chip 
                            label={transfer.exchangeRate ? 'Multi' : 'Same'} 
                            size="small" 
                            sx={{ height: 18, fontSize: '0.625rem', '& .MuiChip-label': { px: 0.5 }, flexShrink: 0 }} 
                          />
                        </Box>
                        <Typography 
                          variant="body2" 
                          fontWeight={600}
                          sx={{ fontSize: '0.8125rem', color: '#d93025', whiteSpace: 'nowrap', flexShrink: 0 }}
                        >
                          {getAccountCurrency(transferOut?.account_id)} {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(transferOut?.amount || 0))}
                        </Typography>
                      </Box>
                      <Typography 
                        variant="body2" 
                        component="div"
                        sx={{ 
                          fontSize: '0.75rem', 
                          color: 'text.secondary', 
                          mb: 0.25,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          width: '100%',
                          maxWidth: '100%',
                          display: 'block',
                        }}
                      >
                        {getAccountName(transferOut?.account_id)} → {getAccountName(transferIn?.account_id)}
                      </Typography>
                      {transfer.exchangeRate && (
                        <Typography variant="body2" sx={{ fontSize: '0.75rem', color: '#1e8e3e', mb: 0.25, whiteSpace: 'nowrap' }}>
                          → {getAccountCurrency(transferIn?.account_id)} {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(transferIn?.amount || 0))}
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, width: '100%' }}>
                        <Typography variant="body2" sx={{ fontSize: '0.6875rem', color: 'text.secondary', flexShrink: 0 }}>
                          {transferDate ? format(parseISO(transferDate), 'MMM dd, yyyy') : '-'}
                        </Typography>
                        {transferOut?.description && (
                          <Typography 
                            variant="body2" 
                            component="div"
                            sx={{ 
                              fontSize: '0.6875rem', 
                              color: 'text.secondary',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              minWidth: 0,
                              flex: 1,
                              textAlign: 'right',
                              maxWidth: '100%',
                              display: 'block',
                            }}
                          >
                            {transferOut.description}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </Box>
                );
              } else {
                const transaction = item.data;
                const description = transaction.description || '';
                const isSelected = selectedItems.has(transaction.transaction_id);
                const dateDisplay = (() => {
                  try {
                    let dateTime;
                    if (transaction.created_at) {
                      dateTime = parseISO(transaction.created_at);
                    } else {
                      dateTime = parseISO(transaction.date);
                    }
                    if (isToday(dateTime)) {
                      return format(dateTime, 'h:mm a');
                    } else {
                      return format(dateTime, 'MMM dd');
                    }
                  } catch {
                    return transaction.date;
                  }
                })();

                return (
                  <Box
                    key={transaction.transaction_id}
                    onClick={() => {
                      if (!isBulkDeleting) {
                        handleOpenDialog(transaction);
                      }
                    }}
                    sx={{
                      mb: 1,
                      p: 1.5,
                      border: '1px solid',
                      borderColor: isSelected ? 'primary.main' : 'divider',
                      borderRadius: 1,
                      backgroundColor: isSelected ? 'action.selected' : 'background.paper',
                      cursor: isBulkDeleting ? 'default' : 'pointer',
                      display: 'flex',
                      gap: 1,
                      alignItems: 'flex-start',
                      '&:active': { backgroundColor: 'action.hover' },
                      overflow: 'hidden',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  >
                    <Checkbox
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleItemSelect(transaction.transaction_id, e.target.checked);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      size="small"
                      sx={{ p: 0, mt: 0.25, flexShrink: 0 }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', width: 0 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 0.25, width: '100%' }}>
                        <Typography 
                          variant="body2" 
                          fontWeight={600} 
                          sx={{ 
                            fontSize: '0.8125rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          {getCategoryName(transaction.category_id)}
                        </Typography>
                        <Typography 
                          variant="body2" 
                          fontWeight={600}
                          sx={{
                            fontSize: '0.8125rem',
                            color: transaction.type === 'Income' || transaction.type === 'Transfer In'
                              ? '#1e8e3e'
                              : transaction.type === 'Expense' || transaction.type === 'Transfer Out'
                              ? '#d93025'
                              : 'text.primary',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {transaction.currency} {new Intl.NumberFormat('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }).format(Math.abs(transaction.amount))}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, width: '100%' }}>
                        <Typography 
                          variant="body2" 
                          component="div"
                          sx={{ 
                            fontSize: '0.75rem', 
                            color: 'text.secondary',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                            flex: 1,
                            maxWidth: '100%',
                            display: 'block',
                          }}
                        >
                          {getAccountName(transaction.account_id)}
                        </Typography>
                        <Typography variant="body2" sx={{ fontSize: '0.6875rem', color: 'text.secondary', flexShrink: 0 }}>
                          {dateDisplay}
                        </Typography>
                      </Box>
                      {description && (
                        <Typography 
                          variant="body2" 
                          component="div"
                          sx={{ 
                            fontSize: '0.6875rem', 
                            color: 'text.secondary',
                            mt: 0.25,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            width: '100%',
                            maxWidth: '100%',
                            display: 'block',
                          }}
                        >
                          {description}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                );
              }
            })}
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
              overflow: 'hidden',
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
                  <TableCell padding="checkbox" sx={{ width: 40 }}>
                    <Checkbox
                      checked={isAllSelected}
                      indeterminate={isIndeterminate}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>Category/Type</TableCell>
                  <TableCell>Account</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>Date</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {combinedItems.map((item) => {
                  if (item.type === 'transfer') {
                    const transfer = item.data;
                    const transferOut = transfer.transferOut;
                    const transferIn = transfer.transferIn;
                    const transferDate = transfer.date || transferOut?.date || transferIn?.date;
                    const transferId = `transfer-${transfer.transferId || transferOut?.transaction_id || transferIn?.transaction_id}`;
                    const isSelected = selectedItems.has(transferId);
                    
                    return (
                      <TableRow
                        key={transferId}
                        hover
                        selected={isSelected}
                        sx={{
                          backgroundColor: isSelected ? 'action.selected' : 'transparent',
                          '&:hover': {
                            backgroundColor: isSelected ? 'action.selected' : 'action.hover',
                          },
                          '& td': {
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                            py: 1,
                            fontSize: '0.875rem',
                          },
                        }}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleItemSelect(transferId, e.target.checked);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                            <SwapHorizIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                            <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.875rem' }}>
                              Transfer
                            </Typography>
                            <Chip 
                              label={transfer.exchangeRate ? 'Multi-Currency' : 'Same Currency'} 
                              size="small" 
                              sx={{ height: 20, fontSize: '0.6875rem', '& .MuiChip-label': { px: 0.75 } }} 
                            />
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                            {getAccountName(transferOut?.account_id)} → {getAccountName(transferIn?.account_id)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontSize: '0.875rem',
                              color: 'text.secondary',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 300,
                            }}
                            title={transferOut?.description || ''}
                          >
                            {transferOut?.description || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Typography variant="body2" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                            {transferDate ? format(parseISO(transferDate), 'MMM dd, yyyy') : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5, flexWrap: 'wrap' }}>
                            <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                              {getAccountCurrency(transferOut?.account_id)}
                            </Typography>
                            <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.875rem', color: '#d93025' }}>
                              {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(transferOut?.amount || 0))}
                            </Typography>
                            {transfer.exchangeRate && (
                              <>
                                <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>→</Typography>
                                <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                                  {getAccountCurrency(transferIn?.account_id)}
                                </Typography>
                                <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.875rem', color: '#1e8e3e' }}>
                                  {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(transferIn?.amount || 0))}
                                </Typography>
                              </>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  } else {
                    const transaction = item.data;
                    const description = transaction.description || '';
                    const isSelected = selectedItems.has(transaction.transaction_id);
                    const dateDisplay = (() => {
                      try {
                        let dateTime;
                        if (transaction.created_at) {
                          dateTime = parseISO(transaction.created_at);
                        } else {
                          dateTime = parseISO(transaction.date);
                        }
                        if (isToday(dateTime)) {
                          return format(dateTime, 'MMM dd, yyyy h:mm a');
                        } else {
                          return format(dateTime, 'MMM dd, yyyy');
                        }
                      } catch {
                        return transaction.date;
                      }
                    })();
                    
                    return (
                      <TableRow
                        key={transaction.transaction_id}
                        hover
                        selected={isSelected}
                        onClick={() => {
                          if (!isBulkDeleting) {
                            handleOpenDialog(transaction);
                          }
                        }}
                        sx={{
                          cursor: isBulkDeleting ? 'default' : 'pointer',
                          backgroundColor: isSelected ? 'action.selected' : 'transparent',
                          '&:hover': {
                            backgroundColor: isSelected ? 'action.selected' : 'action.hover',
                          },
                          '& td': {
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                            py: 1,
                            fontSize: '0.875rem',
                          },
                        }}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleItemSelect(transaction.transaction_id, e.target.checked);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.875rem' }}>
                            {getCategoryName(transaction.category_id)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                            {getAccountName(transaction.account_id)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontSize: '0.875rem',
                              color: 'text.secondary',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 300,
                            }}
                            title={description || ''}
                          >
                            {description || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Typography variant="body2" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                            {dateDisplay}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                            <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                              {transaction.currency}
                            </Typography>
                            <Typography 
                              variant="body2" 
                              fontWeight={600}
                              sx={{
                                fontSize: '0.875rem',
                                color: transaction.type === 'Income' || transaction.type === 'Transfer In'
                                  ? '#1e8e3e'
                                  : transaction.type === 'Expense' || transaction.type === 'Transfer Out'
                                  ? '#d93025'
                                  : 'text.primary',
                              }}
                            >
                              {new Intl.NumberFormat('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }).format(Math.abs(transaction.amount))}
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  }
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Create/Edit Dialog */}
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
                          sx={{
                            pl: 2 + (category.depth || 0) * 2,
                            fontWeight: category.hasChildren ? 600 : 400,
                          }}
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

      {/* Create Transfer Dialog */}
      <Dialog
        open={openTransferDialog}
        onClose={handleCloseTransferDialog}
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
        <form
          onSubmit={handleSubmitTransfer(onSubmitTransfer, (errors) => {
            console.log('Form validation errors:', errors);
          })}
          style={isMobile ? { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' } : {}}
        >
          <DialogTitle sx={{ flexShrink: 0, pb: { xs: 1, sm: 2 } }}>Create New Transfer</DialogTitle>
          <DialogContent sx={{ flexGrow: 1, overflow: 'auto', pt: { xs: 1, sm: 2 } }}>
            {transferError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {transferError}
              </Alert>
            )}
            <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mt: { xs: 0.5, sm: 1 } }}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth error={!!transferErrors.fromAccountId}>
                  <InputLabel>From Account *</InputLabel>
                  <Select
                    {...registerTransfer('fromAccountId')}
                    label="From Account *"
                    value={watchedFromAccountId || ''}
                    onChange={(e) => setValueTransfer('fromAccountId', e.target.value)}
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
                  {transferErrors.fromAccountId && (
                    <FormHelperText>
                      {transferErrors.fromAccountId.message}
                    </FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth error={!!transferErrors.toAccountId}>
                  <InputLabel>To Account *</InputLabel>
                  <Select
                    {...registerTransfer('toAccountId')}
                    label="To Account *"
                    value={watchedToAccountId || ''}
                    onChange={(e) => setValueTransfer('toAccountId', e.target.value)}
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
                  {transferErrors.toAccountId && (
                    <FormHelperText>
                      {transferErrors.toAccountId.message}
                    </FormHelperText>
                  )}
                </FormControl>
              </Grid>
              {watchedFromAccountId && watchedToAccountId && (
                <Grid item xs={12}>
                  <Alert severity={isSameCurrency() ? 'info' : 'warning'}>
                    {isSameCurrency()
                      ? 'Same currency transfer - enter amount once'
                      : 'Multi-currency transfer - enter amounts in both currencies'}
                  </Alert>
                </Grid>
              )}
              {isSameCurrency() ? (
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Amount *"
                    {...registerTransfer('amount', { 
                      valueAsNumber: true,
                      setValueAs: (v) => v === '' || v === null ? undefined : Number(v)
                    })}
                    error={!!transferErrors.amount}
                    helperText={transferErrors.amount?.message}
                    inputProps={{ step: '0.01', min: '0.01' }}
                  />
                </Grid>
              ) : (
                <>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      type="number"
                      label={`From Amount (${getAccountCurrency(
                        watchedFromAccountId
                      )}) *`}
                      {...registerTransfer('fromAmount', { 
                        valueAsNumber: true,
                        setValueAs: (v) => v === '' || v === null ? undefined : Number(v)
                      })}
                      error={!!transferErrors.fromAmount}
                      helperText={transferErrors.fromAmount?.message}
                      inputProps={{ step: '0.01', min: '0.01' }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      type="number"
                      label={`To Amount (${getAccountCurrency(
                        watchedToAccountId
                      )}) *`}
                      {...registerTransfer('toAmount', { 
                        valueAsNumber: true,
                        setValueAs: (v) => v === '' || v === null ? undefined : Number(v)
                      })}
                      error={!!transferErrors.toAmount}
                      helperText={transferErrors.toAmount?.message}
                      inputProps={{ step: '0.01', min: '0.01' }}
                    />
                  </Grid>
                </>
              )}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  type="date"
                  label="Date *"
                  {...registerTransfer('date')}
                  error={!!transferErrors.date}
                  helperText={transferErrors.date?.message}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth error={!!transferErrors.status}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    {...registerTransfer('status')}
                    label="Status"
                    value={watchTransfer('status') || ''}
                    onChange={(e) => setValueTransfer('status', e.target.value)}
                  >
                    {TRANSACTION_STATUSES.map((status) => (
                      <MenuItem key={status} value={status}>
                        {status}
                      </MenuItem>
                    ))}
                  </Select>
                  {transferErrors.status && (
                    <FormHelperText>{transferErrors.status.message}</FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Category (Optional)</InputLabel>
                  <Select
                    {...registerTransfer('categoryId', {
                      setValueAs: (v) => (v === '' ? null : v),
                    })}
                    label="Category (Optional)"
                    value={watchTransfer('categoryId') || ''}
                    onChange={(e) =>
                      setValueTransfer('categoryId', e.target.value || null)
                    }
                  >
                    <MenuItem value="">None</MenuItem>
                    {flattenCategoryTree(categories.filter((cat) => cat.status === 'Active'))
                      .map((category) => (
                        <MenuItem
                          key={category.category_id}
                          value={category.category_id}
                          sx={{
                            pl: 2 + (category.depth || 0) * 2,
                            fontWeight: category.hasChildren ? 600 : 400,
                          }}
                        >
                          {category.name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Description (Optional)"
                  {...registerTransfer('description')}
                  error={!!transferErrors.description}
                  helperText={transferErrors.description?.message}
                  multiline
                  rows={2}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ flexShrink: 0, p: { xs: 1.5, sm: 2 }, borderTop: { xs: '1px solid', sm: 'none' }, borderColor: 'divider' }}>
            <Button
              onClick={handleCloseTransferDialog}
              disabled={isSubmittingTransfer}
              size={isMobile ? 'small' : 'medium'}
              sx={{ textTransform: 'none' }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmittingTransfer}
              size={isMobile ? 'small' : 'medium'}
              startIcon={isSubmittingTransfer ? <CircularProgress size={16} color="inherit" /> : null}
              sx={{ textTransform: 'none' }}
            >
              {isSubmittingTransfer ? 'Creating...' : 'Create Transfer'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog
        open={bulkDeleteConfirm}
        onClose={() => {
          if (!isBulkDeleting) {
            setBulkDeleteConfirm(false);
            setBulkDeleteError(null);
          }
        }}
        fullScreen={isMobile}
      >
        <DialogTitle>Delete Selected Items</DialogTitle>
        <DialogContent>
          {bulkDeleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {bulkDeleteError}
            </Alert>
          )}
          <Alert severity="warning" sx={{ mb: 2 }}>
            Are you sure you want to delete {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''}? This action cannot be undone.
            {(() => {
              const transferCount = Array.from(selectedItems).filter((id) => id.startsWith('transfer-')).length;
              if (transferCount > 0) {
                return ` Note: Deleting ${transferCount} transfer${transferCount !== 1 ? 's' : ''} will delete both associated transactions.`;
              }
              return '';
            })()}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setBulkDeleteConfirm(false);
              setBulkDeleteError(null);
            }}
            disabled={isBulkDeleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleBulkDelete}
            color="error"
            variant="contained"
            disabled={isBulkDeleting}
            startIcon={isBulkDeleting ? <CircularProgress size={20} color="inherit" /> : <DeleteIcon />}
          >
            {isBulkDeleting ? 'Deleting...' : 'Confirm Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Transfer Confirmation Dialog */}
      <Dialog
        open={!!deleteTransferConfirm}
        onClose={() => {
          setDeleteTransferConfirm(null);
        }}
        fullScreen={isMobile}
      >
        <DialogTitle>Delete Transfer</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this transfer? This will delete both
            transactions.
          </Typography>
          {deleteTransferConfirm && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Date:</strong>{' '}
                {deleteTransferConfirm.date
                  ? format(parseISO(deleteTransferConfirm.date), 'MMM dd, yyyy')
                  : deleteTransferConfirm.transferOut?.date
                  ? format(
                      parseISO(deleteTransferConfirm.transferOut.date),
                      'MMM dd, yyyy'
                    )
                  : 'Unknown'}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>From:</strong>{' '}
                {getAccountName(deleteTransferConfirm.transferOut?.account_id)}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>To:</strong>{' '}
                {getAccountName(deleteTransferConfirm.transferIn?.account_id)}
              </Typography>
            </Box>
          )}
          <Alert severity="warning" sx={{ mt: 2 }}>
            This action cannot be undone. Both transactions will be deleted.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteTransferConfirm(null);
            }}
            disabled={isDeletingTransfer}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteTransfer}
            color="error"
            variant="contained"
            disabled={isDeletingTransfer}
            startIcon={isDeletingTransfer ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {isDeletingTransfer ? 'Deleting...' : 'Delete Transfer'}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}

export default Transactions;
