import React, { useEffect, useState, useMemo, useCallback, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  selectAccountNameGetter,
  selectAccountCurrencyGetter,
  selectCategoryNameGetter,
  selectAccountMap,
} from '../store/selectors';
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
  bulkDeleteTransactions as bulkDeleteTransactionsThunk,
  removeDeletedTransactions,
  filterTransactions,
} from '../store/slices/transactionsSlice';
import { fetchAccounts } from '../store/slices/accountsSlice';
import { fetchCategories } from '../store/slices/categoriesSlice';
import {
  fetchTransfers,
  createTransfer,
  deleteTransfer,
} from '../store/slices/transfersSlice';
import { transferSchema } from '../schemas/transferSchema';
import {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
} from '../lib/api/transactions';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import CategoryAutocomplete from '../components/common/CategoryAutocomplete';
import AccountAutocomplete from '../components/common/AccountAutocomplete';
import AddTransactionDialog from '../components/common/AddTransactionDialog';
import EditTransactionDialog from '../components/common/EditTransactionDialog';
import { useKeyboardAwareHeight } from '../hooks/useKeyboardAwareHeight';
import { formatCurrency } from '../utils/currencyConversion';
import {
  format,
  addDays,
  subDays,
  isToday,
  isSameDay,
  parseISO,
} from 'date-fns';
import { usePageRefresh } from '../hooks/usePageRefresh';
import { flattenCategoryTree } from '../utils/categoryHierarchy';

// ============================================
// Memoized Row Components for Performance
// ============================================

/**
 * Memoized Mobile Transaction Row Component
 * Only re-renders when its specific props change
 */
const MobileTransactionRow = memo(function MobileTransactionRow({
  transaction,
  isSelected,
  selectionMode,
  isBulkDeleting,
  getCategoryName,
  getAccountName,
  onLongPressStart,
  onLongPressEnd,
  onSelect,
  onEdit,
}) {
  const description = transaction.description || '';
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
      onTouchStart={() => onLongPressStart(transaction.transaction_id)}
      onTouchEnd={onLongPressEnd}
      onTouchCancel={onLongPressEnd}
      onMouseDown={() => onLongPressStart(transaction.transaction_id)}
      onMouseUp={onLongPressEnd}
      onMouseLeave={onLongPressEnd}
      onClick={() => {
        if (selectionMode) {
          onSelect(transaction.transaction_id, !isSelected);
        } else if (!isBulkDeleting) {
          onEdit(transaction);
        }
      }}
      sx={{
        py: 1,
        px: 0.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        backgroundColor: isSelected ? 'action.selected' : 'transparent',
        cursor: isBulkDeleting ? 'default' : 'pointer',
        display: 'flex',
        gap: 0.75,
        alignItems: 'flex-start',
        '&:active': !selectionMode ? { backgroundColor: 'action.hover' } : {},
        overflow: 'hidden',
        width: '100%',
        boxSizing: 'border-box',
        userSelect: 'none',
      }}
    >
      {selectionMode && (
        <Checkbox
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(transaction.transaction_id, e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
          size="small"
          sx={{ p: 0, mt: 0.25, flexShrink: 0 }}
        />
      )}
      <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', width: 0 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 1,
            width: '100%',
          }}
        >
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
              color:
                transaction.type === 'Income' ||
                transaction.type === 'Transfer In'
                  ? '#1e8e3e'
                  : transaction.type === 'Expense' ||
                    transaction.type === 'Transfer Out'
                  ? '#d93025'
                  : 'text.primary',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {transaction.currency}{' '}
            {new Intl.NumberFormat('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(Math.abs(transaction.amount))}
          </Typography>
        </Box>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 1,
            width: '100%',
          }}
        >
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
            }}
          >
            {getAccountName(transaction.account_id)}
            {description && ` • ${description}`}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              fontSize: '0.6875rem',
              color: 'text.secondary',
              flexShrink: 0,
            }}
          >
            {dateDisplay}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
});

/**
 * Memoized Mobile Transfer Row Component
 */
const MobileTransferRow = memo(function MobileTransferRow({
  transfer,
  transferId,
  isSelected,
  selectionMode,
  getAccountName,
  getAccountCurrency,
  onLongPressStart,
  onLongPressEnd,
  onSelect,
}) {
  const transferOut = transfer.transferOut;
  const transferIn = transfer.transferIn;
  const transferDate = transfer.date || transferOut?.date || transferIn?.date;

  return (
    <Box
      onTouchStart={() => onLongPressStart(transferId)}
      onTouchEnd={onLongPressEnd}
      onTouchCancel={onLongPressEnd}
      onMouseDown={() => onLongPressStart(transferId)}
      onMouseUp={onLongPressEnd}
      onMouseLeave={onLongPressEnd}
      onClick={() => {
        if (selectionMode) {
          onSelect(transferId, !isSelected);
        }
      }}
      sx={{
        py: 1,
        px: 0.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        backgroundColor: isSelected ? 'action.selected' : 'transparent',
        display: 'flex',
        gap: 0.75,
        alignItems: 'flex-start',
        overflow: 'hidden',
        width: '100%',
        boxSizing: 'border-box',
        cursor: selectionMode ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      {selectionMode && (
        <Checkbox
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(transferId, e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
          size="small"
          sx={{ p: 0, mt: 0.25, flexShrink: 0 }}
        />
      )}
      <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', width: 0 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 1,
            width: '100%',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <SwapHorizIcon
              sx={{ fontSize: 14, color: 'primary.main', flexShrink: 0 }}
            />
            <Typography
              variant="body2"
              fontWeight={600}
              sx={{ fontSize: '0.8125rem', flexShrink: 0 }}
            >
              Transfer
            </Typography>
            <Chip
              label={transfer.exchangeRate ? 'Multi' : 'Same'}
              size="small"
              sx={{
                height: 16,
                fontSize: '0.5625rem',
                '& .MuiChip-label': { px: 0.5 },
                flexShrink: 0,
              }}
            />
          </Box>
          <Typography
            variant="body2"
            fontWeight={600}
            sx={{
              fontSize: '0.8125rem',
              color: '#d93025',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {getAccountCurrency(transferOut?.account_id)}{' '}
            {new Intl.NumberFormat('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(Math.abs(transferOut?.amount || 0))}
          </Typography>
        </Box>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 1,
            width: '100%',
          }}
        >
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
            }}
          >
            {getAccountName(transferOut?.account_id)} →{' '}
            {getAccountName(transferIn?.account_id)}
            {transfer.exchangeRate &&
              ` • ${getAccountCurrency(
                transferIn?.account_id
              )} ${new Intl.NumberFormat('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(Math.abs(transferIn?.amount || 0))}`}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              fontSize: '0.6875rem',
              color: 'text.secondary',
              flexShrink: 0,
            }}
          >
            {transferDate ? format(parseISO(transferDate), 'MMM dd') : '-'}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
});

/**
 * Memoized Desktop Transaction Row Component
 */
const DesktopTransactionRow = memo(function DesktopTransactionRow({
  transaction,
  isSelected,
  selectionMode,
  isBulkDeleting,
  getCategoryName,
  getAccountName,
  getTypeChipSx,
  getStatusChipSx,
  onLongPressStart,
  onLongPressEnd,
  onSelect,
  onEdit,
}) {
  const dateDisplay = (() => {
    try {
      return format(parseISO(transaction.date), 'MMM dd, yyyy');
    } catch {
      return transaction.date;
    }
  })();

  return (
    <TableRow
      hover
      selected={isSelected}
      onMouseDown={() => onLongPressStart(transaction.transaction_id)}
      onMouseUp={onLongPressEnd}
      onMouseLeave={onLongPressEnd}
      onClick={() => {
        if (selectionMode) {
          onSelect(transaction.transaction_id, !isSelected);
        } else if (!isBulkDeleting) {
          onEdit(transaction);
        }
      }}
      sx={{
        backgroundColor: isSelected ? 'action.selected' : 'transparent',
        cursor: isBulkDeleting ? 'default' : 'pointer',
        userSelect: 'none',
        '&:hover': {
          backgroundColor: isSelected ? 'action.selected' : 'action.hover',
        },
        '& td': {
          borderBottom: '1px solid',
          borderColor: 'divider',
          py: 0.5,
          fontSize: '0.8125rem',
        },
      }}
    >
      {selectionMode && (
        <TableCell padding="checkbox">
          <Checkbox
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect(transaction.transaction_id, e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            size="small"
          />
        </TableCell>
      )}
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            variant="body2"
            fontWeight={500}
            sx={{ fontSize: '0.875rem' }}
          >
            {getCategoryName(transaction.category_id)}
          </Typography>
          <Chip
            label={transaction.type}
            size="small"
            sx={{
              ...getTypeChipSx(transaction.type),
              height: 20,
              fontSize: '0.6875rem',
            }}
          />
        </Box>
      </TableCell>
      <TableCell>
        <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
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
          title={transaction.description || ''}
        >
          {transaction.description || '-'}
        </Typography>
      </TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>
        <Typography
          variant="body2"
          sx={{ fontSize: '0.875rem', color: 'text.secondary' }}
        >
          {dateDisplay}
        </Typography>
      </TableCell>
      <TableCell align="right">
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 0.5,
          }}
        >
          <Chip
            label={transaction.status}
            size="small"
            sx={{
              ...getStatusChipSx(transaction.status),
              height: 20,
              fontSize: '0.6875rem',
            }}
          />
          <Typography
            variant="body2"
            sx={{ fontSize: '0.75rem', color: 'text.secondary' }}
          >
            {transaction.currency}
          </Typography>
          <Typography
            variant="body2"
            fontWeight={600}
            sx={{
              fontSize: '0.875rem',
              color:
                transaction.type === 'Income' ||
                transaction.type === 'Transfer In'
                  ? '#1e8e3e'
                  : transaction.type === 'Expense' ||
                    transaction.type === 'Transfer Out'
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
});

/**
 * Memoized Desktop Transfer Row Component
 */
const DesktopTransferRow = memo(function DesktopTransferRow({
  transfer,
  transferId,
  isSelected,
  selectionMode,
  getAccountName,
  getAccountCurrency,
  onLongPressStart,
  onLongPressEnd,
  onSelect,
}) {
  const transferOut = transfer.transferOut;
  const transferIn = transfer.transferIn;
  const transferDate = transfer.date || transferOut?.date || transferIn?.date;

  return (
    <TableRow
      hover
      selected={isSelected}
      onMouseDown={() => onLongPressStart(transferId)}
      onMouseUp={onLongPressEnd}
      onMouseLeave={onLongPressEnd}
      onClick={() => {
        if (selectionMode) {
          onSelect(transferId, !isSelected);
        }
      }}
      sx={{
        backgroundColor: isSelected ? 'action.selected' : 'transparent',
        cursor: selectionMode ? 'pointer' : 'default',
        userSelect: 'none',
        '&:hover': {
          backgroundColor: isSelected ? 'action.selected' : 'action.hover',
        },
        '& td': {
          borderBottom: '1px solid',
          borderColor: 'divider',
          py: 0.5,
          fontSize: '0.8125rem',
        },
      }}
    >
      {selectionMode && (
        <TableCell padding="checkbox">
          <Checkbox
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect(transferId, e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            size="small"
          />
        </TableCell>
      )}
      <TableCell>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            flexWrap: 'wrap',
          }}
        >
          <SwapHorizIcon sx={{ fontSize: 18, color: 'primary.main' }} />
          <Typography
            variant="body2"
            fontWeight={600}
            sx={{ fontSize: '0.875rem' }}
          >
            Transfer
          </Typography>
          <Chip
            label={transfer.exchangeRate ? 'Multi-Currency' : 'Same Currency'}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.6875rem',
              '& .MuiChip-label': { px: 0.75 },
            }}
          />
        </Box>
      </TableCell>
      <TableCell>
        <Typography
          variant="body2"
          sx={{ fontSize: '0.875rem', color: 'text.secondary' }}
        >
          {getAccountName(transferOut?.account_id)} →{' '}
          {getAccountName(transferIn?.account_id)}
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
        <Typography
          variant="body2"
          sx={{ fontSize: '0.875rem', color: 'text.secondary' }}
        >
          {transferDate ? format(parseISO(transferDate), 'MMM dd, yyyy') : '-'}
        </Typography>
      </TableCell>
      <TableCell align="right">
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 0.5,
            flexWrap: 'wrap',
          }}
        >
          <Typography
            variant="body2"
            sx={{ fontSize: '0.75rem', color: 'text.secondary' }}
          >
            {getAccountCurrency(transferOut?.account_id)}
          </Typography>
          <Typography
            variant="body2"
            fontWeight={600}
            sx={{ fontSize: '0.875rem', color: '#d93025' }}
          >
            {new Intl.NumberFormat('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(Math.abs(transferOut?.amount || 0))}
          </Typography>
          {transfer.exchangeRate && (
            <>
              <Typography
                variant="body2"
                sx={{ fontSize: '0.75rem', color: 'text.secondary' }}
              >
                →
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontSize: '0.75rem', color: 'text.secondary' }}
              >
                {getAccountCurrency(transferIn?.account_id)}
              </Typography>
              <Typography
                variant="body2"
                fontWeight={600}
                sx={{ fontSize: '0.875rem', color: '#1e8e3e' }}
              >
                {new Intl.NumberFormat('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }).format(Math.abs(transferIn?.amount || 0))}
              </Typography>
            </>
          )}
        </Box>
      </TableCell>
    </TableRow>
  );
});

function Transactions() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { keyboardVisible, keyboardHeight } = useKeyboardAwareHeight();
  const {
    transactions,
    allTransactions,
    loading,
    backgroundLoading,
    isInitialized,
    error,
  } = useSelector((state) => state.transactions);
  const { accounts } = useSelector((state) => state.accounts);
  const { categories } = useSelector((state) => state.categories);
  const { transfers = [] } = useSelector((state) => state.transfers);

  // Memoized O(1) lookup functions from selectors
  const getAccountName = useSelector(selectAccountNameGetter);
  const getAccountCurrency = useSelector(selectAccountCurrencyGetter);
  const getCategoryName = useSelector(selectCategoryNameGetter);
  const accountMap = useSelector(selectAccountMap);
  const [openTransferDialog, setOpenTransferDialog] = useState(false);
  const [addTransactionOpen, setAddTransactionOpen] = useState(false);
  const [showTransfers, setShowTransfers] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

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
  }, [
    dispatch,
    isInitialized,
    allTransactions.length,
    filters.startDate,
    filters.endDate,
  ]);

  // Apply client-side filtering instantly when filters change
  useEffect(() => {
    // Only filter if we have cached data
    if (isInitialized && allTransactions.length > 0) {
      dispatch(filterTransactions(filters));
    }

    // Update selectedDate when date filters change
    if (
      filters.startDate &&
      filters.endDate &&
      filters.startDate === filters.endDate
    ) {
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

  const handleEditTransaction = useCallback((transaction) => {
    setEditingTransaction(transaction);
    setEditDialogOpen(true);
  }, []);

  const handleCloseEditDialog = useCallback(() => {
    setEditDialogOpen(false);
    setEditingTransaction(null);
    // Re-apply current filters to update the view after edit/delete
    dispatch(filterTransactions(filters));
  }, [dispatch, filters]);

  // Transfer handlers
  const handleOpenTransferDialog = useCallback(() => {
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
  }, [resetTransfer]);

  const handleCloseTransferDialog = useCallback(() => {
    setOpenTransferDialog(false);
    setTransferError(null);
    setIsSubmittingTransfer(false);
    resetTransfer();
  }, [resetTransfer]);

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
        const fromAccount = accountMap.get(cleanedData.fromAccountId);
        const toAccount = accountMap.get(cleanedData.toAccountId);
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
    } catch (err) {
      console.error('Error creating transfer:', err);
      const errorMessage =
        err?.message || 'Failed to create transfer. Please try again.';
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
          const transferItem = combinedItems.find(
            (item) => getItemId(item) === itemId
          );
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
        const result = await dispatch(
          bulkDeleteTransactionsThunk(transactionIds)
        ).unwrap();

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
            const result = await dispatch(
              deleteTransfer(transactionId)
            ).unwrap();

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

      // Clear selection and exit selection mode
      setSelectedItems(new Set());
      setSelectionMode(false);
      setBulkDeleteConfirm(false);

      // Re-apply current filters to update the view
      dispatch(filterTransactions(filters));
    } catch (err) {
      console.error('Error bulk deleting:', err);
      const errorMessage =
        err?.message || 'Failed to delete items. Please try again.';
      setBulkDeleteError(errorMessage);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Date navigation handlers - instant client-side filtering
  const handlePreviousDay = useCallback(() => {
    setSelectedDate((prev) => {
      const newDate = subDays(prev, 1);
      const dateStr = format(newDate, 'yyyy-MM-dd');
      setFilters((prevFilters) => ({
        ...prevFilters,
        startDate: dateStr,
        endDate: dateStr,
      }));
      return newDate;
    });
    // Filter is applied instantly via useEffect
  }, []);

  const handleNextDay = useCallback(() => {
    setSelectedDate((prev) => {
      const newDate = addDays(prev, 1);
      const dateStr = format(newDate, 'yyyy-MM-dd');
      setFilters((prevFilters) => ({
        ...prevFilters,
        startDate: dateStr,
        endDate: dateStr,
      }));
      return newDate;
    });
    // Filter is applied instantly via useEffect
  }, []);

  const handleToday = useCallback(() => {
    const today = new Date();
    setSelectedDate(today);
    const dateStr = format(today, 'yyyy-MM-dd');
    setFilters((prev) => ({
      ...prev,
      startDate: dateStr,
      endDate: dateStr,
    }));
    // Filter is applied instantly via useEffect
  }, []);

  const handleFilterChange = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      accountId: '',
      categoryId: '',
      type: '',
      status: '',
      startDate: '',
      endDate: '',
    });
  }, []);

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

  // Determine if same currency or multi-currency for transfers
  const isSameCurrency = () => {
    if (!watchedFromAccountId || !watchedToAccountId) return true;
    const fromAccount = accountMap.get(watchedFromAccountId);
    const toAccount = accountMap.get(watchedToAccountId);
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
    transactions.forEach((txn) => {
      items.push({ type: 'transaction', data: txn });
    });

    // Add transfers if enabled
    if (showTransfers && transfers && Array.isArray(transfers)) {
      transfers.forEach((transfer) => {
        const transferDate =
          transfer.date ||
          transfer.transferOut?.date ||
          transfer.transferIn?.date;
        // Check if transfer matches current date filter
        if (filters.startDate && filters.endDate) {
          // Skip transfers with no date or invalid date
          if (
            !transferDate ||
            typeof transferDate !== 'string' ||
            transferDate.trim() === ''
          ) {
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
          if (
            normalizedTransferDate < normalizedStartDate ||
            normalizedTransferDate > normalizedEndDate
          ) {
            return;
          }
        }
        items.push({ type: 'transfer', data: transfer });
      });
    }

    // Sort by date descending
    items.sort((a, b) => {
      const dateA =
        a.type === 'transaction'
          ? new Date(a.data.date || 0)
          : new Date(
              a.data.date ||
                a.data.transferOut?.date ||
                a.data.transferIn?.date ||
                0
            );
      const dateB =
        b.type === 'transaction'
          ? new Date(b.data.date || 0)
          : new Date(
              b.data.date ||
                b.data.transferOut?.date ||
                b.data.transferIn?.date ||
                0
            );
      return dateB - dateA;
    });

    return items;
  }, [
    transactions,
    transfers,
    showTransfers,
    filters.startDate,
    filters.endDate,
  ]);

  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== ''
  ).length;

  // Selection handlers
  const getItemId = useCallback((item) => {
    if (item.type === 'transfer') {
      const transfer = item.data;
      return `transfer-${
        transfer.transferId ||
        transfer.transferOut?.transaction_id ||
        transfer.transferIn?.transaction_id
      }`;
    }
    return item.data.transaction_id;
  }, []);

  const handleItemSelect = useCallback((itemId, checked) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(itemId);
      } else {
        newSet.delete(itemId);
      }
      return newSet;
    });
  }, []);

  // Long-press handlers for selection mode
  const handleLongPressStart = useCallback((itemId) => {
    const timer = setTimeout(() => {
      setSelectionMode(true);
      setSelectedItems(new Set([itemId]));
    }, 500); // 500ms long press
    setLongPressTimer(timer);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  }, [longPressTimer]);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedItems(new Set());
  }, []);

  const handleSelectAll = useCallback(
    (checked) => {
      if (checked) {
        const allIds = combinedItems.map((item) => getItemId(item));
        setSelectedItems(new Set(allIds));
      } else {
        setSelectedItems(new Set());
      }
    },
    [combinedItems, getItemId]
  );

  const isAllSelected =
    combinedItems.length > 0 &&
    combinedItems.every((item) => selectedItems.has(getItemId(item)));
  const isIndeterminate =
    combinedItems.some((item) => selectedItems.has(getItemId(item))) &&
    !isAllSelected;

  return (
    <Box
      sx={{
        px: { xs: 1, sm: 0 },
        overflow: 'hidden',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
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
        <Box
          sx={{
            display: 'flex',
            gap: 0.5,
            flexWrap: 'wrap',
            width: { xs: '100%', sm: 'auto' },
          }}
        >
          <Button
            variant="outlined"
            startIcon={
              isMobile ? null : <FilterListIcon sx={{ fontSize: 16 }} />
            }
            onClick={() => setFiltersOpen(!filtersOpen)}
            color={activeFilterCount > 0 ? 'primary' : 'inherit'}
            size="small"
            sx={{
              flex: { xs: '1 1 auto', sm: 'none' },
              textTransform: 'none',
              fontSize: { xs: '0.75rem', sm: '0.8rem' },
              minHeight: { xs: 32, sm: 34 },
              px: { xs: 1, sm: 1.5 },
            }}
          >
            {isMobile ? (
              <FilterListIcon
                sx={{ fontSize: 16, mr: activeFilterCount > 0 ? 0.5 : 0 }}
              />
            ) : null}
            {isMobile
              ? activeFilterCount > 0
                ? activeFilterCount
                : ''
              : `Filters ${
                  activeFilterCount > 0 ? `(${activeFilterCount})` : ''
                }`}
          </Button>
          <Button
            variant="outlined"
            startIcon={
              isMobile ? null : <SwapHorizIcon sx={{ fontSize: 16 }} />
            }
            onClick={handleOpenTransferDialog}
            size="small"
            sx={{
              flex: { xs: '1 1 auto', sm: 'none' },
              textTransform: 'none',
              fontSize: { xs: '0.75rem', sm: '0.8rem' },
              minHeight: { xs: 32, sm: 34 },
              px: { xs: 1, sm: 1.5 },
            }}
          >
            {isMobile ? <SwapHorizIcon sx={{ fontSize: 16 }} /> : 'Transfer'}
          </Button>
          <Button
            variant="contained"
            startIcon={isMobile ? null : <AddIcon sx={{ fontSize: 16 }} />}
            onClick={() => setAddTransactionOpen(true)}
            size="small"
            sx={{
              flex: { xs: '1 1 auto', sm: 'none' },
              textTransform: 'none',
              fontSize: { xs: '0.75rem', sm: '0.8rem' },
              minHeight: { xs: 32, sm: 34 },
              px: { xs: 1, sm: 1.5 },
            }}
          >
            {isMobile ? <AddIcon sx={{ fontSize: 16 }} /> : 'Add'}
          </Button>
        </Box>
      </Box>

      {/* Date Navigation - Compact */}
      <Box
        sx={{
          mb: 1.5,
          p: { xs: 0.75, sm: 1 },
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: { xs: 1, sm: 0 },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            width: { xs: '100%', sm: 'auto' },
          }}
        >
          <IconButton
            onClick={handlePreviousDay}
            size="small"
            sx={{
              color: 'text.secondary',
              width: { xs: 28, sm: 32 },
              height: { xs: 28, sm: 32 },
              p: 0.5,
              '&:hover': { backgroundColor: 'action.hover' },
            }}
          >
            <ChevronLeftIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
          </IconButton>
          <Button
            variant={isToday(selectedDate) ? 'contained' : 'outlined'}
            startIcon={isMobile ? null : <TodayIcon sx={{ fontSize: 16 }} />}
            onClick={handleToday}
            size="small"
            sx={{
              minWidth: { xs: 'auto', sm: 160 },
              flex: { xs: 1, sm: 'none' },
              textTransform: 'none',
              fontWeight: 500,
              fontSize: { xs: '0.75rem', sm: '0.8rem' },
              minHeight: { xs: 28, sm: 32 },
              px: { xs: 1, sm: 1.5 },
            }}
          >
            {format(selectedDate, isMobile ? 'MMM dd' : 'MMM dd, yyyy')}
            {isToday(selectedDate) && (isMobile ? '' : ' (Today)')}
          </Button>
          <IconButton
            onClick={handleNextDay}
            size="small"
            sx={{
              color: 'text.secondary',
              width: { xs: 28, sm: 32 },
              height: { xs: 28, sm: 32 },
              p: 0.5,
              '&:hover': { backgroundColor: 'action.hover' },
            }}
          >
            <ChevronRightIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
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
            // Calculate total expenses
            const expensesByCurrency = calculateExpensesByCurrency();
            const totalParts = Object.entries(expensesByCurrency).map(
              ([currency, total]) => formatCurrency(total, currency)
            );
            const totalStr =
              totalParts.length > 0
                ? `Total: ${totalParts.join(', ')}`
                : 'Total: 0';

            // Count filtered transfers (same logic as combinedItems)
            let transferCount = 0;
            if (showTransfers && transfers && Array.isArray(transfers)) {
              transfers.forEach((transfer) => {
                const transferDate =
                  transfer.date ||
                  transfer.transferOut?.date ||
                  transfer.transferIn?.date;
                // Check if transfer matches current date filter
                if (filters.startDate && filters.endDate) {
                  // Skip transfers with no date or invalid date
                  if (
                    !transferDate ||
                    typeof transferDate !== 'string' ||
                    transferDate.trim() === ''
                  ) {
                    return;
                  }

                  // Normalize dates to YYYY-MM-DD format for comparison (handle dates with time components)
                  const normalizedTransferDate = transferDate
                    .split('T')[0]
                    .trim();
                  const normalizedStartDate = filters.startDate
                    .split('T')[0]
                    .trim();
                  const normalizedEndDate = filters.endDate
                    .split('T')[0]
                    .trim();

                  // Validate normalized dates are in correct format (YYYY-MM-DD)
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedTransferDate)) {
                    return; // Skip invalid date formats
                  }

                  // Skip transfers outside date range
                  if (
                    normalizedTransferDate < normalizedStartDate ||
                    normalizedTransferDate > normalizedEndDate
                  ) {
                    return;
                  }
                }
                transferCount++;
              });
            }

            const totalItemCount = transactions.length + transferCount;
            const countStr =
              totalItemCount === 0
                ? 'No items'
                : `${totalItemCount} item${totalItemCount !== 1 ? 's' : ''}`;

            return `${totalStr} • ${countStr}`;
          })()}
        </Typography>
      </Box>

      {error && <ErrorMessage error={error} />}

      {/* Selection Header - only visible in selection mode */}
      {selectionMode && combinedItems.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 1,
            p: 1,
            height: 44,
            borderBottom: '1px solid',
            borderColor: 'divider',
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
                ? `${selectedItems.size} selected`
                : 'Select items'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="text"
              size="small"
              onClick={exitSelectionMode}
              sx={{
                textTransform: 'none',
                fontSize: '0.875rem',
                minHeight: 32,
              }}
            >
              Cancel
            </Button>
            {selectedItems.size > 0 && (
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<DeleteIcon sx={{ fontSize: 16 }} />}
                onClick={() => setBulkDeleteConfirm(true)}
                disabled={isBulkDeleting}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.875rem',
                  minHeight: 32,
                }}
              >
                Delete
              </Button>
            )}
          </Box>
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
                  onChange={(e) =>
                    handleFilterChange('accountId', e.target.value)
                  }
                  sx={{ fontSize: '0.875rem', minHeight: 36 }}
                >
                  <MenuItem value="" sx={{ fontSize: '0.875rem' }}>
                    All Accounts
                  </MenuItem>
                  {accounts.map((account) => (
                    <MenuItem
                      key={account.account_id}
                      value={account.account_id}
                      sx={{ fontSize: '0.875rem' }}
                    >
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
                  onChange={(e) =>
                    handleFilterChange('categoryId', e.target.value)
                  }
                  sx={{ fontSize: '0.875rem', minHeight: 36 }}
                >
                  <MenuItem value="" sx={{ fontSize: '0.875rem' }}>
                    All Categories
                  </MenuItem>
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
                  <MenuItem value="" sx={{ fontSize: '0.875rem' }}>
                    All Types
                  </MenuItem>
                  {TRANSACTION_TYPES.map((type) => (
                    <MenuItem
                      key={type}
                      value={type}
                      sx={{ fontSize: '0.875rem' }}
                    >
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
                  <MenuItem value="" sx={{ fontSize: '0.875rem' }}>
                    All Statuses
                  </MenuItem>
                  {TRANSACTION_STATUSES.map((status) => (
                    <MenuItem
                      key={status}
                      value={status}
                      sx={{ fontSize: '0.875rem' }}
                    >
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
                onChange={(e) =>
                  handleFilterChange('startDate', e.target.value)
                }
                InputLabelProps={{ shrink: true }}
                sx={{
                  '& .MuiInputBase-root': {
                    fontSize: '0.875rem',
                    minHeight: 36,
                  },
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
                  '& .MuiInputBase-root': {
                    fontSize: '0.875rem',
                    minHeight: 36,
                  },
                  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <Box
                sx={{
                  display: 'flex',
                  gap: 1,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
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
                    onChange={(e) =>
                      setShowTransfers(e.target.value === 'show')
                    }
                    sx={{ minWidth: 150, fontSize: '0.875rem', minHeight: 36 }}
                  >
                    <MenuItem value="show" sx={{ fontSize: '0.875rem' }}>
                      Show Transfers
                    </MenuItem>
                    <MenuItem value="hide" sx={{ fontSize: '0.875rem' }}>
                      Hide Transfers
                    </MenuItem>
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
            sx={{
              fontSize: { xs: 40, sm: 48 },
              color: 'text.secondary',
              mb: 1.5,
              opacity: 0.5,
            }}
          />
          <Typography
            variant="h6"
            color="text.secondary"
            gutterBottom
            sx={{ fontSize: { xs: '0.9375rem', sm: '1rem' }, fontWeight: 500 }}
          >
            No transactions yet
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2, fontSize: { xs: '0.8125rem', sm: '0.875rem' } }}
          >
            Create your first transaction to start tracking your finances
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon sx={{ fontSize: 18 }} />}
            onClick={() => setAddTransactionOpen(true)}
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
          <Box
            sx={{
              display: { xs: 'block', md: 'none' },
              overflow: 'hidden',
              width: '100%',
            }}
          >
            {combinedItems.map((item) => {
              if (item.type === 'transfer') {
                const transfer = item.data;
                const transferId = `transfer-${
                  transfer.transferId ||
                  transfer.transferOut?.transaction_id ||
                  transfer.transferIn?.transaction_id
                }`;
                const isSelected = selectedItems.has(transferId);

                return (
                  <MobileTransferRow
                    key={transferId}
                    transfer={transfer}
                    transferId={transferId}
                    isSelected={isSelected}
                    selectionMode={selectionMode}
                    getAccountName={getAccountName}
                    getAccountCurrency={getAccountCurrency}
                    onLongPressStart={handleLongPressStart}
                    onLongPressEnd={handleLongPressEnd}
                    onSelect={handleItemSelect}
                  />
                );
              } else {
                const transaction = item.data;
                const isSelected = selectedItems.has(
                  transaction.transaction_id
                );

                return (
                  <MobileTransactionRow
                    key={transaction.transaction_id}
                    transaction={transaction}
                    isSelected={isSelected}
                    selectionMode={selectionMode}
                    isBulkDeleting={isBulkDeleting}
                    getCategoryName={getCategoryName}
                    getAccountName={getAccountName}
                    onLongPressStart={handleLongPressStart}
                    onLongPressEnd={handleLongPressEnd}
                    onSelect={handleItemSelect}
                    onEdit={handleEditTransaction}
                  />
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
                      py: 0.75,
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    },
                  }}
                >
                  {selectionMode && (
                    <TableCell padding="checkbox" sx={{ width: 40 }}>
                      <Checkbox
                        checked={isAllSelected}
                        indeterminate={isIndeterminate}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        size="small"
                      />
                    </TableCell>
                  )}
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
                    const transferDate =
                      transfer.date || transferOut?.date || transferIn?.date;
                    const transferId = `transfer-${
                      transfer.transferId ||
                      transferOut?.transaction_id ||
                      transferIn?.transaction_id
                    }`;
                    const isSelected = selectedItems.has(transferId);

                    return (
                      <TableRow
                        key={transferId}
                        hover
                        selected={isSelected}
                        onMouseDown={() => handleLongPressStart(transferId)}
                        onMouseUp={handleLongPressEnd}
                        onMouseLeave={handleLongPressEnd}
                        onClick={() => {
                          if (selectionMode) {
                            handleItemSelect(transferId, !isSelected);
                          }
                        }}
                        sx={{
                          backgroundColor: isSelected
                            ? 'action.selected'
                            : 'transparent',
                          cursor: selectionMode ? 'pointer' : 'default',
                          userSelect: 'none',
                          '&:hover': {
                            backgroundColor: isSelected
                              ? 'action.selected'
                              : 'action.hover',
                          },
                          '& td': {
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                            py: 0.5,
                            fontSize: '0.8125rem',
                          },
                        }}
                      >
                        {selectionMode && (
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
                        )}
                        <TableCell>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.75,
                              flexWrap: 'wrap',
                            }}
                          >
                            <SwapHorizIcon
                              sx={{ fontSize: 18, color: 'primary.main' }}
                            />
                            <Typography
                              variant="body2"
                              fontWeight={600}
                              sx={{ fontSize: '0.875rem' }}
                            >
                              Transfer
                            </Typography>
                            <Chip
                              label={
                                transfer.exchangeRate
                                  ? 'Multi-Currency'
                                  : 'Same Currency'
                              }
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.6875rem',
                                '& .MuiChip-label': { px: 0.75 },
                              }}
                            />
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: '0.875rem',
                              color: 'text.secondary',
                            }}
                          >
                            {getAccountName(transferOut?.account_id)} →{' '}
                            {getAccountName(transferIn?.account_id)}
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
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: '0.875rem',
                              color: 'text.secondary',
                            }}
                          >
                            {transferDate
                              ? format(parseISO(transferDate), 'MMM dd, yyyy')
                              : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: 0.5,
                              flexWrap: 'wrap',
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: '0.75rem',
                                color: 'text.secondary',
                              }}
                            >
                              {getAccountCurrency(transferOut?.account_id)}
                            </Typography>
                            <Typography
                              variant="body2"
                              fontWeight={600}
                              sx={{ fontSize: '0.875rem', color: '#d93025' }}
                            >
                              {new Intl.NumberFormat('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }).format(Math.abs(transferOut?.amount || 0))}
                            </Typography>
                            {transfer.exchangeRate && (
                              <>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontSize: '0.75rem',
                                    color: 'text.secondary',
                                  }}
                                >
                                  →
                                </Typography>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontSize: '0.75rem',
                                    color: 'text.secondary',
                                  }}
                                >
                                  {getAccountCurrency(transferIn?.account_id)}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  fontWeight={600}
                                  sx={{
                                    fontSize: '0.875rem',
                                    color: '#1e8e3e',
                                  }}
                                >
                                  {new Intl.NumberFormat('en-US', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  }).format(Math.abs(transferIn?.amount || 0))}
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
                    const isSelected = selectedItems.has(
                      transaction.transaction_id
                    );
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
                        onMouseDown={() =>
                          handleLongPressStart(transaction.transaction_id)
                        }
                        onMouseUp={handleLongPressEnd}
                        onMouseLeave={handleLongPressEnd}
                        onClick={() => {
                          if (selectionMode) {
                            handleItemSelect(
                              transaction.transaction_id,
                              !isSelected
                            );
                          } else if (!isBulkDeleting) {
                            handleEditTransaction(transaction);
                          }
                        }}
                        sx={{
                          cursor: isBulkDeleting ? 'default' : 'pointer',
                          backgroundColor: isSelected
                            ? 'action.selected'
                            : 'transparent',
                          userSelect: 'none',
                          '&:hover': {
                            backgroundColor: isSelected
                              ? 'action.selected'
                              : 'action.hover',
                          },
                          '& td': {
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                            py: 0.5,
                            fontSize: '0.8125rem',
                          },
                        }}
                      >
                        {selectionMode && (
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={isSelected}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleItemSelect(
                                  transaction.transaction_id,
                                  e.target.checked
                                );
                              }}
                              onClick={(e) => e.stopPropagation()}
                              size="small"
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <Typography
                            variant="body2"
                            fontWeight={600}
                            sx={{ fontSize: '0.8125rem' }}
                          >
                            {getCategoryName(transaction.category_id)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: '0.8125rem',
                              color: 'text.secondary',
                            }}
                          >
                            {getAccountName(transaction.account_id)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: '0.8125rem',
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
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: '0.875rem',
                              color: 'text.secondary',
                            }}
                          >
                            {dateDisplay}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: 0.5,
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: '0.75rem',
                                color: 'text.secondary',
                              }}
                            >
                              {transaction.currency}
                            </Typography>
                            <Typography
                              variant="body2"
                              fontWeight={600}
                              sx={{
                                fontSize: '0.875rem',
                                color:
                                  transaction.type === 'Income' ||
                                  transaction.type === 'Transfer In'
                                    ? '#1e8e3e'
                                    : transaction.type === 'Expense' ||
                                      transaction.type === 'Transfer Out'
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

      {/* Edit Transaction Dialog */}
      <EditTransactionDialog
        open={editDialogOpen}
        onClose={handleCloseEditDialog}
        transaction={editingTransaction}
      />

      {/* Create Transfer Dialog */}
      <Dialog
        open={openTransferDialog}
        onClose={handleCloseTransferDialog}
        maxWidth="sm"
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
            : {},
        }}
      >
        <form
          onSubmit={handleSubmitTransfer(onSubmitTransfer, (errors) => {
            console.log('Form validation errors:', errors);
          })}
          style={
            isMobile
              ? {
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  overflow: 'hidden',
                  paddingBottom: keyboardVisible ? `${keyboardHeight}px` : 0,
                }
              : {}
          }
        >
          <DialogTitle sx={{ flexShrink: 0, pb: { xs: 1, sm: 2 } }}>
            Create New Transfer
          </DialogTitle>
          <DialogContent
            sx={{ flexGrow: 1, overflow: 'auto', pt: { xs: 1, sm: 2 } }}
          >
            {transferError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {transferError}
              </Alert>
            )}
            <Grid
              container
              spacing={{ xs: 1.5, sm: 2 }}
              sx={{ mt: { xs: 0.5, sm: 1 } }}
            >
              <Grid item xs={12} sm={6}>
                <AccountAutocomplete
                  accounts={accounts}
                  value={watchedFromAccountId || ''}
                  onChange={(id) => setValueTransfer('fromAccountId', id)}
                  label="From Account *"
                  error={!!transferErrors.fromAccountId}
                  helperText={transferErrors.fromAccountId?.message}
                  autoFocus={openTransferDialog}
                  excludeAccountId={watchedToAccountId}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <AccountAutocomplete
                  accounts={accounts}
                  value={watchedToAccountId || ''}
                  onChange={(id) => setValueTransfer('toAccountId', id)}
                  label="To Account *"
                  error={!!transferErrors.toAccountId}
                  helperText={transferErrors.toAccountId?.message}
                  excludeAccountId={watchedFromAccountId}
                />
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
                      setValueAs: (v) =>
                        v === '' || v === null ? undefined : Number(v),
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
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
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
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
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
                    <FormHelperText>
                      {transferErrors.status.message}
                    </FormHelperText>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <CategoryAutocomplete
                  categories={flattenCategoryTree(categories)}
                  value={watchTransfer('categoryId') || ''}
                  onChange={(id) => setValueTransfer('categoryId', id || null)}
                  label="Category (Optional)"
                />
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
          <Box
            sx={{
              flexShrink: 0,
              p: { xs: 1.5, sm: 2 },
              gap: 1,
              display: 'flex',
              justifyContent: 'flex-end',
              borderTop: '1px solid',
              borderColor: 'divider',
              backgroundColor: 'background.paper',
            }}
          >
            <Button
              onClick={handleCloseTransferDialog}
              disabled={isSubmittingTransfer}
              size="medium"
              sx={{
                textTransform: 'none',
                flex: { xs: 1, sm: 'none' },
                minWidth: { xs: 'auto', sm: 100 },
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmittingTransfer}
              size="medium"
              startIcon={
                isSubmittingTransfer ? (
                  <CircularProgress size={16} color="inherit" />
                ) : null
              }
              sx={{
                textTransform: 'none',
                flex: { xs: 1, sm: 'none' },
                minWidth: { xs: 'auto', sm: 100 },
              }}
            >
              {isSubmittingTransfer ? 'Creating...' : 'Create Transfer'}
            </Button>
          </Box>
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
          Delete {selectedItems.size} Item{selectedItems.size !== 1 ? 's' : ''}?
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center', pb: 2 }}>
          {bulkDeleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {bulkDeleteError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary">
            This action cannot be undone.
            {(() => {
              const transferCount = Array.from(selectedItems).filter((id) =>
                id.startsWith('transfer-')
              ).length;
              if (transferCount > 0) {
                return ` Deleting ${transferCount} transfer${
                  transferCount !== 1 ? 's' : ''
                } will also delete both associated transactions.`;
              }
              return '';
            })()}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', gap: 2, px: 3, pb: 3 }}>
          <Button
            onClick={() => {
              setBulkDeleteConfirm(false);
              setBulkDeleteError(null);
            }}
            disabled={isBulkDeleting}
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
            onClick={handleBulkDelete}
            color="error"
            variant="contained"
            disabled={isBulkDeleting}
            size="large"
            startIcon={
              isBulkDeleting ? (
                <CircularProgress size={20} color="inherit" />
              ) : null
            }
            sx={{
              textTransform: 'none',
              minWidth: 120,
              py: 1.5,
            }}
          >
            {isBulkDeleting ? 'Deleting...' : 'Delete'}
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
            startIcon={
              isDeletingTransfer ? (
                <CircularProgress size={20} color="inherit" />
              ) : null
            }
          >
            {isDeletingTransfer ? 'Deleting...' : 'Delete Transfer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Transaction Dialog - Same as Home page */}
      <AddTransactionDialog
        open={addTransactionOpen}
        onClose={() => setAddTransactionOpen(false)}
      />
    </Box>
  );
}

export default Transactions;
