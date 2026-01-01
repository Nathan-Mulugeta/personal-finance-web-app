import { useEffect, useState, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
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
  InputLabel,
  LinearProgress,
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
import PeopleIcon from '@mui/icons-material/People';
import FilterListIcon from '@mui/icons-material/FilterList';
import PaymentIcon from '@mui/icons-material/Payment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import {
  fetchBorrowingLendingRecords,
  createBorrowingLendingRecord,
  updateBorrowingLendingRecord,
  deleteBorrowingLendingRecord,
  recordPayment,
  markAsFullyPaid,
  fetchSummary,
  clearError,
} from '../store/slices/borrowingsLendingsSlice';
import { fetchTransactions } from '../store/slices/transactionsSlice';
import {
  BORROWING_LENDING_TYPES,
  BORROWING_LENDING_STATUSES,
} from '../lib/api/borrowingsLendings';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { usePageRefresh } from '../hooks/usePageRefresh';
import {
  formatCurrency,
  convertAmountWithExchangeRates,
} from '../utils/currencyConversion';
import { format, parseISO } from 'date-fns';

function BorrowingsLendings() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { records, summary, loading, backgroundLoading, isInitialized, error } =
    useSelector((state) => state.borrowingsLendings);
  const { allTransactions } = useSelector((state) => state.transactions);
  const { accounts } = useSelector((state) => state.accounts);
  const { settings } = useSelector((state) => state.settings);
  const { exchangeRates } = useSelector((state) => state.exchangeRates);
  const appInitialized = useSelector((state) => state.appInit.isInitialized);
  const [openDialog, setOpenDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [paymentDialog, setPaymentDialog] = useState(null);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [isMarkingPaid, setIsMarkingPaid] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    type: '',
    status: '',
    currency: '',
    entityName: '',
  });

  const {
    register: registerCreate,
    handleSubmit: handleSubmitCreate,
    formState: { errors: errorsCreate },
    reset: resetCreate,
    setValue: setValueCreate,
    watch: watchCreate,
  } = useForm({
    defaultValues: {
      type: 'Borrowing',
      originalTransactionId: '',
      entityName: '',
      notes: '',
    },
  });

  const {
    register: registerPayment,
    handleSubmit: handleSubmitPayment,
    formState: { errors: errorsPayment },
    reset: resetPayment,
    setValue: setValuePayment,
  } = useForm({
    defaultValues: {
      amount: '',
      notes: '',
    },
  });

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    formState: { errors: errorsEdit },
    reset: resetEdit,
    setValue: setValueEdit,
    watch: watchEdit,
  } = useForm({
    defaultValues: {
      entityName: '',
      notes: '',
      status: 'Active',
    },
  });

  const watchedType = watchCreate('type');
  const watchedTransactionId = watchCreate('originalTransactionId');
  const watchedEditStatus = watchEdit('status');

  const transactionsInitialized = useSelector(
    (state) => state.transactions.isInitialized
  );

  // Track previous transaction count to detect new transactions
  const prevTransactionCount = useRef(0);

  // Initialize ref when transactions are first loaded
  useEffect(() => {
    if (allTransactions.length > 0 && prevTransactionCount.current === 0) {
      prevTransactionCount.current = allTransactions.length;
    }
  }, [allTransactions.length]);

  // Refresh data on navigation
  usePageRefresh({
    dataTypes: ['borrowingsLendings', 'transactions'],
  });

  // Refresh borrowing/lending records when transactions change (for auto-created records)
  // This ensures that when a transaction is created that matches borrowing/lending categories,
  // the auto-created record appears on the page
  useEffect(() => {
    if (isInitialized && allTransactions.length > 0) {
      // Only refresh if transaction count increased (new transaction created)
      if (allTransactions.length > prevTransactionCount.current) {
        // Debounce to avoid too many refreshes and give time for auto-create to complete
        const timeoutId = setTimeout(() => {
          dispatch(fetchBorrowingLendingRecords({}));
          dispatch(fetchSummary({}));
        }, 1500); // Wait 1.5 seconds after transaction creation for auto-create to complete

        prevTransactionCount.current = allTransactions.length;
        return () => clearTimeout(timeoutId);
      } else {
        prevTransactionCount.current = allTransactions.length;
      }
    }
  }, [dispatch, isInitialized, allTransactions.length]);

  // Auto-fill entity name and amount from transaction
  useEffect(() => {
    if (watchedTransactionId) {
      const transaction = allTransactions.find(
        (txn) => txn.transaction_id === watchedTransactionId
      );
      if (transaction) {
        // Extract entity name from description or use a default
        const entityName = transaction.description
          ? transaction.description.split(' ')[0]
          : 'Unknown';
        setValueCreate('entityName', entityName);
      }
    }
  }, [watchedTransactionId, allTransactions, setValueCreate]);

  // Filter records client-side
  const filteredRecords = useMemo(() => {
    let filtered = [...records];

    if (filters.type) {
      filtered = filtered.filter((r) => r.type === filters.type);
    }
    if (filters.status) {
      filtered = filtered.filter((r) => r.status === filters.status);
    }
    if (filters.currency) {
      filtered = filtered.filter(
        (r) => r.currency === filters.currency.toUpperCase()
      );
    }
    if (filters.entityName) {
      filtered = filtered.filter((r) =>
        r.entity_name.toLowerCase().includes(filters.entityName.toLowerCase())
      );
    }

    // Sort by created_at descending
    filtered.sort((a, b) => {
      const dateA = a.created_at ? parseISO(a.created_at) : new Date(0);
      const dateB = b.created_at ? parseISO(b.created_at) : new Date(0);
      return dateB - dateA;
    });

    return filtered;
  }, [records, filters]);

  // Calculate summary from filtered records
  const calculatedSummary = useMemo(() => {
    const baseCurrency =
      settings.find((s) => s.setting_key === 'BaseCurrency')?.setting_value ||
      'USD';

    const calcSummary = {
      borrowing: {
        total: 0,
        paid: 0,
        remaining: 0,
        count: 0,
      },
      lending: {
        total: 0,
        paid: 0,
        remaining: 0,
        count: 0,
      },
      baseCurrency,
    };

    filteredRecords.forEach((record) => {
      const type = record.type.toLowerCase();
      const recordCurrency = record.currency || 'USD';

      // Convert amounts to base currency
      const originalAmount = parseFloat(record.original_amount || 0);
      const paidAmount = parseFloat(record.paid_amount || 0);
      const remainingAmount = parseFloat(record.remaining_amount || 0);

      const convertedOriginal = convertAmountWithExchangeRates(
        originalAmount,
        recordCurrency,
        baseCurrency,
        exchangeRates
      );
      const convertedPaid = convertAmountWithExchangeRates(
        paidAmount,
        recordCurrency,
        baseCurrency,
        exchangeRates
      );
      const convertedRemaining = convertAmountWithExchangeRates(
        remainingAmount,
        recordCurrency,
        baseCurrency,
        exchangeRates
      );

      // Use converted amounts if available, otherwise use original (for same currency or missing rates)
      calcSummary[type].total +=
        convertedOriginal !== null ? convertedOriginal : originalAmount;
      calcSummary[type].paid +=
        convertedPaid !== null ? convertedPaid : paidAmount;
      calcSummary[type].remaining +=
        convertedRemaining !== null ? convertedRemaining : remainingAmount;
      calcSummary[type].count += 1;
    });

    return calcSummary;
  }, [filteredRecords, settings, exchangeRates]);

  const handleOpenDialog = () => {
    resetCreate({
      type: 'Borrowing',
      originalTransactionId: '',
      entityName: '',
      notes: '',
    });
    setCreateError(null);
    setIsSubmitting(false);
    // Refresh transactions to ensure newly created transactions are available
    dispatch(fetchTransactions({}));
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setCreateError(null);
    setIsSubmitting(false);
    resetCreate();
    dispatch(clearError());
  };

  const handleOpenEditDialog = (record) => {
    setEditingRecord(record);
    resetEdit({
      entityName: record.entity_name,
      notes: record.notes || '',
      status: record.status,
    });
    setEditError(null);
    setIsEditing(false);
    setOpenDialog(true);
  };

  const handleCloseEditDialog = () => {
    setOpenDialog(false);
    setEditingRecord(null);
    setEditError(null);
    setIsEditing(false);
    resetEdit();
    dispatch(clearError());
  };

  const handleOpenPaymentDialog = (record) => {
    setPaymentDialog(record);
    resetPayment({
      amount: '',
      notes: '',
    });
  };

  const handleClosePaymentDialog = () => {
    setPaymentDialog(null);
    setPaymentError(null);
    setIsPaying(false);
    resetPayment();
    dispatch(clearError());
  };

  const onSubmitCreate = async (data) => {
    setIsSubmitting(true);
    setCreateError(null);
    try {
      const transaction = allTransactions.find(
        (txn) => txn.transaction_id === data.originalTransactionId
      );
      if (!transaction) {
        setCreateError('Transaction not found');
        setIsSubmitting(false);
        return;
      }

      const recordData = {
        type: data.type,
        originalTransactionId: data.originalTransactionId,
        entityName: data.entityName,
        originalAmount: Math.abs(transaction.amount),
        currency: transaction.currency,
        notes: data.notes || '',
      };

      await dispatch(createBorrowingLendingRecord(recordData)).unwrap();
      handleCloseDialog();

      // Also refresh summary
      dispatch(fetchSummary({}));
    } catch (err) {
      console.error('Error creating record:', err);
      const errorMessage =
        err?.message || 'Failed to create record. Please try again.';
      setCreateError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmitEdit = async (data) => {
    if (!editingRecord) return;

    setIsEditing(true);
    setEditError(null);
    try {
      await dispatch(
        updateBorrowingLendingRecord({
          recordId: editingRecord.record_id,
          updates: {
            entityName: data.entityName,
            notes: data.notes || '',
            status: data.status,
          },
        })
      ).unwrap();
      handleCloseEditDialog();

      // Also refresh summary
      dispatch(fetchSummary({}));
    } catch (err) {
      console.error('Error updating record:', err);
      const errorMessage =
        err?.message || 'Failed to update record. Please try again.';
      setEditError(errorMessage);
    } finally {
      setIsEditing(false);
    }
  };

  const onSubmitPayment = async (data) => {
    if (!paymentDialog) return;

    setIsPaying(true);
    setPaymentError(null);
    try {
      const result = await dispatch(
        recordPayment({
          recordId: paymentDialog.record_id,
          paymentData: {
            amount: parseFloat(data.amount),
            notes: data.notes || '',
          },
        })
      ).unwrap();

      handleClosePaymentDialog();

      // Also refresh summary
      dispatch(fetchSummary({}));
    } catch (err) {
      console.error('Error recording payment:', err);
      const errorMessage =
        err?.message || 'Failed to record payment. Please try again.';
      setPaymentError(errorMessage);
    } finally {
      setIsPaying(false);
    }
  };

  const handleMarkAsFullyPaid = async (record) => {
    setIsMarkingPaid(record.record_id);
    try {
      const result = await dispatch(markAsFullyPaid(record.record_id)).unwrap();

      // Also refresh summary
      dispatch(fetchSummary({}));
    } catch (err) {
      console.error('Error marking as fully paid:', err);
    } finally {
      setIsMarkingPaid(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await dispatch(
        deleteBorrowingLendingRecord(deleteConfirm.record_id)
      ).unwrap();
      setDeleteConfirm(null);
      setDeleteError(null);

      // Also refresh summary
      dispatch(fetchSummary({}));
    } catch (err) {
      console.error('Error deleting record:', err);
      const errorMessage =
        err?.message || 'Failed to delete record. Please try again.';
      setDeleteError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      type: '',
      status: '',
      currency: '',
      entityName: '',
    });
  };

  // Get transaction description helper
  const getTransactionDescription = (transactionId) => {
    const transaction = allTransactions.find(
      (txn) => txn.transaction_id === transactionId
    );
    return transaction?.description || 'Unknown transaction';
  };

  // Get account name helper
  const getAccountName = (accountId) => {
    const account = accounts.find((acc) => acc.account_id === accountId);
    return account?.name || 'Unknown';
  };

  // Google-style chip styling for status badges
  const getStatusChipSx = (status) => {
    switch (status) {
      case 'Active':
        return {
          backgroundColor: '#fef7e0',
          color: '#e37400',
          fontWeight: 500,
        };
      case 'FullyPaid':
        return {
          backgroundColor: '#e6f4ea',
          color: '#1e8e3e',
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
    if (type === 'Borrowing') {
      return {
        backgroundColor: '#fce8e6',
        color: '#d93025',
        fontWeight: 500,
      };
    }
    if (type === 'Lending') {
      return {
        backgroundColor: '#e6f4ea',
        color: '#1e8e3e',
        fontWeight: 500,
      };
    }
    return {
      backgroundColor: '#f1f3f4',
      color: '#5f6368',
      fontWeight: 500,
    };
  };

  // Get available transactions for creating records (filtered by type, not already used)
  const getAvailableTransactions = () => {
    const usedTransactionIds = new Set(
      records.map((r) => r.original_transaction_id).filter(Boolean)
    );

    // Filter based on record type being created
    // Borrowing = money coming in = Income transactions
    // Lending = money going out = Expense transactions
    let allowedTypes = [];
    if (watchedType === 'Borrowing') {
      allowedTypes = ['Income'];
    } else if (watchedType === 'Lending') {
      allowedTypes = ['Expense', 'Transfer Out'];
    } else {
      // If no type selected, show both (for initial state)
      allowedTypes = ['Income', 'Expense', 'Transfer Out'];
    }

    return allTransactions.filter(
      (txn) =>
        allowedTypes.includes(txn.type) &&
        !usedTransactionIds.has(txn.transaction_id) &&
        !txn.deleted_at &&
        txn.status !== 'Cancelled'
    );
  };

  if (loading && records.length === 0) {
    return <LoadingSpinner />;
  }

  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== ''
  ).length;

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          mb: { xs: 1.5, sm: 2, md: 3 },
          gap: { xs: 1.5, sm: 0 },
        }}
      >
        <Typography
          variant="h4"
          sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, fontWeight: 500 }}
        >
          Borrowings/Lendings
        </Typography>
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
            width: { xs: '100%', sm: 'auto' },
          }}
        >
          <Button
            variant="outlined"
            startIcon={<FilterListIcon sx={{ fontSize: 18 }} />}
            onClick={() => setFiltersOpen(!filtersOpen)}
            color={activeFilterCount > 0 ? 'primary' : 'inherit'}
            size="small"
            sx={{ flex: { xs: '1 1 auto', sm: 'none' }, textTransform: 'none', minHeight: 36 }}
          >
            Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon sx={{ fontSize: 18 }} />}
            onClick={handleOpenDialog}
            size="small"
            sx={{ flex: { xs: '1 1 auto', sm: 'none' }, textTransform: 'none', minHeight: 36 }}
          >
            Add Record
          </Button>
        </Box>
      </Box>

      {error && <ErrorMessage error={error} />}

      {/* Summary Cards */}
      {filteredRecords.length > 0 && (
        <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mb: { xs: 2, sm: 3, md: 4 } }}>
          <Grid item xs={6} sm={6} md={3}>
            <Box
              sx={{
                p: { xs: 1.5, sm: 2 },
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                backgroundColor: 'background.paper',
              }}
            >
              <Typography variant="body2" color="text.secondary" gutterBottom sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                Total Borrowing
              </Typography>
              <Typography variant="h5" fontWeight="bold" sx={{ color: 'softRed.main', fontSize: { xs: '1.125rem', sm: '1.5rem' } }}>
                {formatCurrency(calculatedSummary.borrowing.total, calculatedSummary.baseCurrency)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}>
                {calculatedSummary.borrowing.count} record{calculatedSummary.borrowing.count !== 1 ? 's' : ''}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <Box
              sx={{
                p: { xs: 1.5, sm: 2 },
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                backgroundColor: 'background.paper',
              }}
            >
              <Typography variant="body2" color="text.secondary" gutterBottom sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                Remaining Borrowing
              </Typography>
              <Typography variant="h5" fontWeight="bold" sx={{ color: 'softRed.main', fontSize: { xs: '1.125rem', sm: '1.5rem' } }}>
                {formatCurrency(calculatedSummary.borrowing.remaining, calculatedSummary.baseCurrency)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}>
                {formatCurrency(calculatedSummary.borrowing.paid, calculatedSummary.baseCurrency)} paid
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <Box
              sx={{
                p: { xs: 1.5, sm: 2 },
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                backgroundColor: 'background.paper',
              }}
            >
              <Typography variant="body2" color="text.secondary" gutterBottom sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                Total Lending
              </Typography>
              <Typography variant="h5" fontWeight="bold" sx={{ color: 'softGreen.main', fontSize: { xs: '1.125rem', sm: '1.5rem' } }}>
                {formatCurrency(calculatedSummary.lending.total, calculatedSummary.baseCurrency)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}>
                {calculatedSummary.lending.count} record{calculatedSummary.lending.count !== 1 ? 's' : ''}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <Box
              sx={{
                p: { xs: 1.5, sm: 2 },
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                backgroundColor: 'background.paper',
              }}
            >
              <Typography variant="body2" color="text.secondary" gutterBottom sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                Remaining Lending
              </Typography>
              <Typography variant="h5" fontWeight="bold" sx={{ color: 'softGreen.main', fontSize: { xs: '1.125rem', sm: '1.5rem' } }}>
                {formatCurrency(calculatedSummary.lending.remaining, calculatedSummary.baseCurrency)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' } }}>
                {formatCurrency(calculatedSummary.lending.paid, calculatedSummary.baseCurrency)} paid
              </Typography>
            </Box>
          </Grid>
        </Grid>
      )}

      {/* Filters Section */}
      <Collapse in={filtersOpen}>
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
          <Grid container spacing={{ xs: 1.5, sm: 2 }} alignItems="center">
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={filters.type}
                    label="Type"
                    onChange={(e) => handleFilterChange('type', e.target.value)}
                  >
                    <MenuItem value="">All Types</MenuItem>
                    {BORROWING_LENDING_TYPES.map((type) => (
                      <MenuItem key={type} value={type}>
                        {type}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={filters.status}
                    label="Status"
                    onChange={(e) =>
                      handleFilterChange('status', e.target.value)
                    }
                  >
                    <MenuItem value="">All Statuses</MenuItem>
                    {BORROWING_LENDING_STATUSES.map((status) => (
                      <MenuItem key={status} value={status}>
                        {status}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="Currency"
                  value={filters.currency}
                  onChange={(e) =>
                    handleFilterChange('currency', e.target.value.toUpperCase())
                  }
                  inputProps={{
                    maxLength: 3,
                    style: { textTransform: 'uppercase' },
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="Entity Name"
                  value={filters.entityName}
                  onChange={(e) =>
                    handleFilterChange('entityName', e.target.value)
                  }
                />
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={clearFilters}
                  disabled={activeFilterCount === 0}
                  sx={{ textTransform: 'none', minHeight: 36 }}
                >
                  Clear Filters
                </Button>
              </Grid>
            </Grid>
          </Box>
      </Collapse>

      {filteredRecords.length === 0 ? (
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
          <PeopleIcon sx={{ fontSize: { xs: 48, sm: 64 }, color: 'text.secondary', mb: { xs: 1.5, sm: 2 } }} />
          <Typography variant="h6" color="text.secondary" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
            No records yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: { xs: 1.5, sm: 2 }, fontSize: { xs: '0.8125rem', sm: '0.875rem' } }}>
            Create your first borrowing/lending record from a transaction
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon sx={{ fontSize: 18 }} />}
            onClick={handleOpenDialog}
            sx={{ textTransform: 'none', minHeight: 36 }}
          >
            Create Record
          </Button>
        </Box>
      ) : (
        <Box>
          {/* Mobile Card View */}
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            {filteredRecords.map((record) => {
              const originalAmount = parseFloat(record.original_amount || 0);
              const paidAmount = parseFloat(record.paid_amount || 0);
              const remainingAmount = parseFloat(record.remaining_amount || 0);
              const percentage =
                originalAmount > 0 ? (paidAmount / originalAmount) * 100 : 0;

              return (
                <Box
                  key={record.record_id}
                  sx={{
                    mb: 1.5,
                    p: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    backgroundColor: 'background.paper',
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body1" fontWeight="medium" sx={{ fontSize: '0.875rem', mb: 0.5 }}>
                        {record.entity_name}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        <Chip
                          label={record.type}
                          size="small"
                          sx={{ height: 20, fontSize: '0.6875rem', ...getTypeChipSx(record.type) }}
                        />
                        <Chip label={record.currency} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.6875rem' }} />
                        <Chip label={record.status} size="small" sx={{ height: 20, fontSize: '0.6875rem', ...getStatusChipSx(record.status) }} />
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0 }}>
                      <Tooltip title="Record Payment">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleOpenPaymentDialog(record)}
                            color="primary"
                            disabled={record.status !== 'Active'}
                            sx={{ p: 0.5 }}
                          >
                            <PaymentIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <IconButton size="small" onClick={() => handleOpenEditDialog(record)} sx={{ color: '#5f6368', '&:hover': { color: '#1a73e8' }, p: 0.5 }}>
                        <EditIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                      <IconButton size="small" onClick={() => setDeleteConfirm(record)} sx={{ color: '#5f6368', '&:hover': { color: '#d93025' }, p: 0.5 }}>
                        <DeleteIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Box>
                  </Box>

                  {/* Progress Bar */}
                  <Box sx={{ mb: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                        Paid: {formatCurrency(paidAmount, record.currency)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                        Total: {formatCurrency(originalAmount, record.currency)}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(percentage, 100)}
                      color={percentage >= 100 ? 'success' : 'primary'}
                      sx={{ height: 6, borderRadius: 1 }}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25 }}>
                      <Typography
                        variant="caption"
                        color={remainingAmount > 0 ? 'warning.main' : 'success.main'}
                        fontWeight="medium"
                        sx={{ fontSize: '0.6875rem' }}
                      >
                        Remaining: {formatCurrency(remainingAmount, record.currency)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6875rem' }}>
                        {percentage.toFixed(1)}%
                      </Typography>
                    </Box>
                  </Box>

                  {record.notes && (
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                      {record.notes}
                    </Typography>
                  )}

                  {record.status === 'Active' && remainingAmount > 0 && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={
                        isMarkingPaid === record.record_id ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : (
                          <CheckCircleIcon sx={{ fontSize: 16 }} />
                        )
                      }
                      onClick={() => handleMarkAsFullyPaid(record)}
                      disabled={isMarkingPaid === record.record_id}
                      sx={{ mt: 1, textTransform: 'none', fontSize: '0.8125rem' }}
                      fullWidth
                    >
                      {isMarkingPaid === record.record_id ? 'Marking...' : 'Mark as Fully Paid'}
                    </Button>
                  )}
                </Box>
              );
            })}
          </Box>

          {/* Desktop Table View */}
          <TableContainer
            component={Paper}
            sx={{ display: { xs: 'none', md: 'block' } }}
          >
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Entity</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Currency</TableCell>
                  <TableCell align="right">Original Amount</TableCell>
                  <TableCell align="right">Paid</TableCell>
                  <TableCell>Progress</TableCell>
                  <TableCell align="right">Remaining</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRecords.map((record) => {
                  const originalAmount = parseFloat(
                    record.original_amount || 0
                  );
                  const paidAmount = parseFloat(record.paid_amount || 0);
                  const remainingAmount = parseFloat(
                    record.remaining_amount || 0
                  );
                  const percentage =
                    originalAmount > 0
                      ? (paidAmount / originalAmount) * 100
                      : 0;

                  return (
                    <TableRow key={record.record_id} hover>
                      <TableCell>
                        <Typography variant="body1" fontWeight="medium">
                          {record.entity_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={record.type}
                          size="small"
                          sx={getTypeChipSx(record.type)}
                        />
                      </TableCell>
                      <TableCell>{record.currency}</TableCell>
                      <TableCell align="right">
                        {formatCurrency(originalAmount, record.currency)}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(paidAmount, record.currency)}
                      </TableCell>
                      <TableCell>
                        <Box
                          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(percentage, 100)}
                            color={percentage >= 100 ? 'success' : 'primary'}
                            sx={{ flex: 1, height: 8, borderRadius: 1 }}
                          />
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ minWidth: 45 }}
                          >
                            {percentage.toFixed(1)}%
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body1"
                          fontWeight="medium"
                          color={
                            remainingAmount > 0
                              ? 'warning.main'
                              : 'success.main'
                          }
                        >
                          {formatCurrency(remainingAmount, record.currency)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={record.status}
                          size="small"
                          sx={getStatusChipSx(record.status)}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Record Payment">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleOpenPaymentDialog(record)}
                              color="primary"
                              disabled={record.status !== 'Active'}
                            >
                              <PaymentIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => handleOpenEditDialog(record)}
                            sx={{ color: '#5f6368', '&:hover': { color: '#1a73e8' } }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            onClick={() => setDeleteConfirm(record)}
                            sx={{ color: '#5f6368', '&:hover': { color: '#d93025' } }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Create Record Dialog */}
      <Dialog
        open={openDialog && !editingRecord}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <form onSubmit={handleSubmitCreate(onSubmitCreate)}>
          <DialogTitle>Create Borrowing/Lending Record</DialogTitle>
          <DialogContent>
            {createError && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setCreateError(null)}>
                {createError}
              </Alert>
            )}
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <FormControl fullWidth error={!!errorsCreate.type}>
                  <InputLabel>Type *</InputLabel>
                  <Select
                    {...registerCreate('type')}
                    label="Type *"
                    value={watchedType || ''}
                    onChange={(e) => setValueCreate('type', e.target.value)}
                  >
                    {BORROWING_LENDING_TYPES.map((type) => (
                      <MenuItem key={type} value={type}>
                        {type}
                      </MenuItem>
                    ))}
                  </Select>
                  {errorsCreate.type && (
                    <FormHelperText>{errorsCreate.type.message}</FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl
                  fullWidth
                  error={!!errorsCreate.originalTransactionId}
                >
                  <InputLabel>Original Transaction *</InputLabel>
                  <Select
                    {...registerCreate('originalTransactionId')}
                    label="Original Transaction *"
                    value={watchedTransactionId || ''}
                    onChange={(e) =>
                      setValueCreate('originalTransactionId', e.target.value)
                    }
                  >
                    {getAvailableTransactions().map((transaction) => (
                      <MenuItem
                        key={transaction.transaction_id}
                        value={transaction.transaction_id}
                      >
                        {format(parseISO(transaction.date), 'MMM dd, yyyy')} -{' '}
                        {transaction.description || 'No description'} -{' '}
                        {formatCurrency(
                          Math.abs(transaction.amount),
                          transaction.currency
                        )}
                      </MenuItem>
                    ))}
                  </Select>
                  {errorsCreate.originalTransactionId && (
                    <FormHelperText>
                      {errorsCreate.originalTransactionId.message}
                    </FormHelperText>
                  )}
                  {getAvailableTransactions().length === 0 && (
                    <FormHelperText>
                      {watchedType === 'Borrowing'
                        ? 'No available income transactions. Create an income transaction first.'
                        : watchedType === 'Lending'
                        ? 'No available expense transactions. Create an expense transaction first.'
                        : 'No available transactions. Select a record type and create a transaction first.'}
                    </FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Entity Name *"
                  {...registerCreate('entityName', {
                    required: 'Entity name is required',
                  })}
                  error={!!errorsCreate.entityName}
                  helperText={errorsCreate.entityName?.message}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Notes (Optional)"
                  {...registerCreate('notes')}
                  error={!!errorsCreate.notes}
                  helperText={errorsCreate.notes?.message}
                  multiline
                  rows={2}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting || getAvailableTransactions().length === 0}
              startIcon={
                isSubmitting ? (
                  <CircularProgress size={20} color="inherit" />
                ) : null
              }
            >
              {isSubmitting ? 'Creating...' : 'Create Record'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Edit Record Dialog */}
      <Dialog
        open={openDialog && !!editingRecord}
        onClose={handleCloseEditDialog}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <form onSubmit={handleSubmitEdit(onSubmitEdit)}>
          <DialogTitle>Edit Borrowing/Lending Record</DialogTitle>
          <DialogContent>
            {editError && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setEditError(null)}>
                {editError}
              </Alert>
            )}
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Entity Name *"
                  {...registerEdit('entityName', {
                    required: 'Entity name is required',
                  })}
                  error={!!errorsEdit.entityName}
                  helperText={errorsEdit.entityName?.message}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth error={!!errorsEdit.status}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    {...registerEdit('status')}
                    label="Status"
                    value={watchedEditStatus || ''}
                    onChange={(e) => setValueEdit('status', e.target.value)}
                  >
                    {BORROWING_LENDING_STATUSES.map((status) => (
                      <MenuItem key={status} value={status}>
                        {status}
                      </MenuItem>
                    ))}
                  </Select>
                  {errorsEdit.status && (
                    <FormHelperText>{errorsEdit.status.message}</FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Notes (Optional)"
                  {...registerEdit('notes')}
                  error={!!errorsEdit.notes}
                  helperText={errorsEdit.notes?.message}
                  multiline
                  rows={2}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseEditDialog} disabled={isEditing}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isEditing}
              startIcon={
                isEditing ? (
                  <CircularProgress size={20} color="inherit" />
                ) : null
              }
            >
              {isEditing ? 'Updating...' : 'Update'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog
        open={!!paymentDialog}
        onClose={handleClosePaymentDialog}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <form onSubmit={handleSubmitPayment(onSubmitPayment)}>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogContent>
            {paymentError && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPaymentError(null)}>
                {paymentError}
              </Alert>
            )}
            {paymentDialog && (
              <Box sx={{ mb: 2 }}>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Remaining amount:{' '}
                  {formatCurrency(
                    paymentDialog.remaining_amount,
                    paymentDialog.currency
                  )}
                </Alert>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Payment Amount *"
                      {...registerPayment('amount', {
                        required: 'Payment amount is required',
                        valueAsNumber: true,
                        min: {
                          value: 0.01,
                          message: 'Amount must be greater than 0',
                        },
                        max: {
                          value: paymentDialog.remaining_amount,
                          message: `Amount cannot exceed remaining amount of ${formatCurrency(
                            paymentDialog.remaining_amount,
                            paymentDialog.currency
                          )}`,
                        },
                      })}
                      error={!!errorsPayment.amount}
                      helperText={errorsPayment.amount?.message}
                      inputProps={{
                        step: '0.01',
                        min: '0.01',
                        max: paymentDialog.remaining_amount,
                      }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Notes (Optional)"
                      {...registerPayment('notes')}
                      error={!!errorsPayment.notes}
                      helperText={errorsPayment.notes?.message}
                      multiline
                      rows={2}
                    />
                  </Grid>
                </Grid>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClosePaymentDialog} disabled={isPaying}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={
                isPaying ||
                !paymentDialog ||
                paymentDialog.remaining_amount <= 0
              }
              startIcon={
                isPaying ? <CircularProgress size={20} color="inherit" /> : null
              }
            >
              {isPaying ? 'Recording...' : 'Record Payment'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirm}
        onClose={() => {
          setDeleteConfirm(null);
          setDeleteError(null);
        }}
        fullScreen={isMobile}
      >
        <DialogTitle>Delete Record</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the record for{' '}
            <strong>{deleteConfirm?.entity_name}</strong>?
          </Typography>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }} onClose={() => setDeleteError(null)}>
              {deleteError}
            </Alert>
          )}
          <Alert severity="warning" sx={{ mt: 2 }}>
            This action cannot be undone. Payment transactions will remain, but
            the record will be deleted.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteConfirm(null);
              setDeleteError(null);
            }}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={isDeleting}
            startIcon={
              isDeleting ? <CircularProgress size={20} color="inherit" /> : null
            }
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default BorrowingsLendings;
