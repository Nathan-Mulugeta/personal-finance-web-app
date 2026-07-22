import { useEffect, useState, useMemo, useCallback, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  selectAccountNameGetter,
  selectAccountCurrencyGetter,
  selectCategoryDisplayNameGetter,
  selectFilteredTransactions,
} from '../store/selectors';
import {
  Badge,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Alert,
  Collapse,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloseIcon from '@mui/icons-material/Close';
import FilterListIcon from '@mui/icons-material/FilterList';
import ReceiptIcon from '@mui/icons-material/Receipt';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ChecklistIcon from '@mui/icons-material/Checklist';
import {
  bulkDeleteTransactions as bulkDeleteTransactionsThunk,
  removeDeletedTransactions,
  filterTransactions,
  clearError,
} from '../store/slices/transactionsSlice';
import { deleteTransfer } from '../store/slices/transfersSlice';
import {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
} from '../lib/api/transactions';
import PageSkeleton from '../components/common/PageSkeleton';
import ErrorMessage from '../components/common/ErrorMessage';
import EmptyState from '../components/common/EmptyState';
import AddTransactionDialog from '../components/common/AddTransactionDialog';
import EditTransactionDialog from '../components/common/EditTransactionDialog';
import TransactionQuickEditor, {
  useTransactionQuickEdit,
} from '../components/common/TransactionQuickEditor';
import { editableTextSx } from '../components/common/inlineEditStyles';
import AddTransferDialog from '../components/common/AddTransferDialog';
import BulkEditTransactionsDialog from '../components/common/BulkEditTransactionsDialog';
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
  getCategoryDisplayName,
  getAccountName,
  onSelect,
  onEdit,
}) {
  const description = transaction.description || '';
  const qe = useTransactionQuickEdit();
  // In selection mode, field taps must bubble to the row (toggle select), so
  // no quick-edit handler; otherwise stop propagation and open the editor.
  const quickClick = (field) => (selectionMode ? undefined : qe.open(field));
  const quickCursor = selectionMode ? undefined : 'pointer';
  // Now uses the date field which contains full datetime (TIMESTAMPTZ)
  const dateDisplay = (() => {
    try {
      const dateTime = parseISO(transaction.date);
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
    <>
    <Box
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
            onClick={quickClick('category')}
            sx={[
              {
                fontSize: '0.8125rem',
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                cursor: quickCursor,
              },
              !selectionMode && editableTextSx,
            ]}
          >
            {getCategoryDisplayName(transaction.category_id)}
          </Typography>
          <Typography
            variant="body2"
            fontWeight={600}
            onClick={quickClick('amount')}
            sx={[
              {
                fontSize: '0.8125rem',
                color:
                  transaction.type === 'Income' ||
                  transaction.type === 'Transfer In'
                    ? 'google.green'
                    : transaction.type === 'Expense' ||
                      transaction.type === 'Transfer Out'
                    ? 'google.red'
                    : 'text.primary',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                cursor: quickCursor,
              },
              !selectionMode && editableTextSx,
            ]}
          >
            {formatCurrency(Math.abs(transaction.amount), transaction.currency)}
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
            {/* Account name taps bubble to the row → full edit */}
            <Box component="span">{getAccountName(transaction.account_id)}</Box>
            {' • '}
            {description ? (
              <Box
                component="span"
                onClick={quickClick('description')}
                sx={[{ cursor: quickCursor }, !selectionMode && editableTextSx]}
              >
                {description}
              </Box>
            ) : (
              <Box
                component="span"
                onClick={quickClick('description')}
                sx={[
                  { cursor: quickCursor, fontStyle: 'italic', opacity: 0.7 },
                  !selectionMode && editableTextSx,
                ]}
              >
                Add note
              </Box>
            )}
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
    <TransactionQuickEditor
      transaction={transaction}
      field={qe.state?.field}
      anchorEl={qe.state?.anchorEl}
      open={!!qe.state}
      onClose={qe.close}
    />
    </>
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
  onSelect,
}) {
  const transferOut = transfer.transferOut;
  const transferIn = transfer.transferIn;
  const transferDate = transfer.date || transferOut?.date || transferIn?.date;

  return (
    <Box
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
              sx={{ fontSize: 15, color: 'text.secondary', flexShrink: 0 }}
            />
            <Typography
              variant="body2"
              noWrap
              sx={{ fontSize: '0.8125rem', fontWeight: 500, minWidth: 0 }}
            >
              Transfer
            </Typography>
          </Box>
          <Typography
            variant="body2"
            fontWeight={600}
            sx={{
              fontSize: '0.8125rem',
              color: 'google.red',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {formatCurrency(
              Math.abs(transferOut?.amount || 0),
              getAccountCurrency(transferOut?.account_id)
            )}
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
              ` • ${formatCurrency(
                Math.abs(transferIn?.amount || 0),
                getAccountCurrency(transferIn?.account_id)
              )}`}
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

// How many list rows render initially and per "Show more" click
const RENDER_CHUNK = 100;

function Transactions() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // Matches the md breakpoint previously used for the CSS card/table switch
  const isDesktopView = useMediaQuery(theme.breakpoints.up('md'));
  // One shared quick-editor for the desktop table (rows are an inline map, so
  // they can't each hold hook state like the mobile rows do)
  const tableQe = useTransactionQuickEdit();
  const {
    allTransactions,
    loading,
    isInitialized,
    error,
  } = useSelector((state) => state.transactions);
  // Derived from allTransactions + activeFilters (memoized)
  const transactions = useSelector(selectFilteredTransactions);
  const { accounts } = useSelector((state) => state.accounts);
  const { categories } = useSelector((state) => state.categories);
  const { transfers = [] } = useSelector((state) => state.transfers);

  // Memoized O(1) lookup functions from selectors
  const getAccountName = useSelector(selectAccountNameGetter);
  const getAccountCurrency = useSelector(selectAccountCurrencyGetter);
  const getCategoryDisplayName = useSelector(selectCategoryDisplayNameGetter);
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
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
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

  // Apply client-side filtering instantly when filters change or data loads
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
    setOpenTransferDialog(true);
  }, []);

  const handleCloseTransferDialog = useCallback(() => {
    setOpenTransferDialog(false);
  }, []);

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
        await dispatch(bulkDeleteTransactionsThunk(transactionIds)).unwrap();

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
              dispatch(removeDeletedTransactions(result.transactionIds));
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

  // Calculate expense aggregation by currency for selected date
  const calculateExpensesByCurrency = () => {
    const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
    const dateTransactions = transactions.filter((t) => {
      // Parse transaction date (now a timestamp) and extract date portion
      let transactionDateStr;
      try {
        const transactionDate = parseISO(t.date);
        transactionDateStr = format(transactionDate, 'yyyy-MM-dd');
      } catch {
        // Fallback for date-only strings (backward compatibility)
        transactionDateStr = t.date.split('T')[0];
      }
      return (
        transactionDateStr === selectedDateStr &&
        (t.type === 'Expense' || t.type === 'Transfer Out')
      );
    });

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

  // Render the list in chunks so large filtered sets don't build
  // thousands of DOM nodes at once
  const [visibleCount, setVisibleCount] = useState(RENDER_CHUNK);

  useEffect(() => {
    setVisibleCount(RENDER_CHUNK);
  }, [combinedItems]);

  const visibleItems = useMemo(
    () => combinedItems.slice(0, visibleCount),
    [combinedItems, visibleCount]
  );
  const hiddenItemCount = combinedItems.length - visibleItems.length;

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

  // Split the selection for bulk edit: only plain transactions are editable;
  // transfers (transfer-prefixed ids) are skipped
  const selectedTransactionIds = useMemo(
    () =>
      Array.from(selectedItems).filter((id) => !id.startsWith('transfer-')),
    [selectedItems]
  );
  const selectedTransferCount = selectedItems.size - selectedTransactionIds.length;

  // Only show loading skeleton on initial load
  if (loading && !isInitialized && transactions.length === 0) {
    return <PageSkeleton />;
  }

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
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
          gap: 1,
        }}
      >
        <Typography
          variant="h5"
          noWrap
          sx={{
            fontSize: { xs: '1.25rem', sm: '1.5rem' },
            fontWeight: 500,
            color: 'text.primary',
            minWidth: 0,
          }}
        >
          Transactions
        </Typography>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 0.25, sm: 0.5 },
            flexShrink: 0,
          }}
        >
          <IconButton
            onClick={() => setFiltersOpen(!filtersOpen)}
            aria-label="Filters"
            sx={{
              width: 36,
              height: 36,
              color: 'text.secondary',
              '&:hover': { backgroundColor: 'action.hover' },
            }}
          >
            <Badge
              badgeContent={activeFilterCount}
              color="primary"
              overlap="circular"
              sx={{
                '& .MuiBadge-badge': {
                  fontSize: '0.5625rem',
                  height: 15,
                  minWidth: 15,
                  px: 0.25,
                },
              }}
            >
              <FilterListIcon sx={{ fontSize: 20 }} />
            </Badge>
          </IconButton>
          <IconButton
            onClick={handleOpenTransferDialog}
            aria-label="New transfer"
            sx={{
              width: 36,
              height: 36,
              color: 'text.secondary',
              '&:hover': { backgroundColor: 'action.hover' },
            }}
          >
            <SwapHorizIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <IconButton
            onClick={() => setAddTransactionOpen(true)}
            aria-label="Add transaction"
            sx={{
              width: 36,
              height: 36,
              backgroundColor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': { backgroundColor: 'primary.dark' },
            }}
          >
            <AddIcon sx={{ fontSize: 20 }} />
          </IconButton>
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
            gap: 0.5,
            width: { xs: '100%', sm: 'auto' },
          }}
        >
          <IconButton
            onClick={handlePreviousDay}
            aria-label="Previous day"
            sx={{
              flex: { xs: 1, sm: 'none' },
              width: { sm: 40 },
              height: 36,
              borderRadius: 1,
              color: 'text.secondary',
              '&:hover': { backgroundColor: 'action.hover' },
            }}
          >
            <ChevronLeftIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <Button
            variant={isToday(selectedDate) ? 'contained' : 'outlined'}
            startIcon={isMobile ? null : <TodayIcon sx={{ fontSize: 16 }} />}
            onClick={handleToday}
            sx={{
              flex: { xs: 2, sm: 'none' },
              minWidth: { sm: 160 },
              height: 36,
              textTransform: 'none',
              fontWeight: 500,
              fontSize: { xs: '0.8125rem', sm: '0.8rem' },
              px: { xs: 1, sm: 1.5 },
            }}
          >
            {format(selectedDate, isMobile ? 'MMM dd' : 'MMM dd, yyyy')}
            {isToday(selectedDate) && (isMobile ? '' : ' (Today)')}
          </Button>
          <IconButton
            onClick={handleNextDay}
            aria-label="Next day"
            sx={{
              flex: { xs: 1, sm: 'none' },
              width: { sm: 40 },
              height: 36,
              borderRadius: 1,
              color: 'text.secondary',
              '&:hover': { backgroundColor: 'action.hover' },
            }}
          >
            <ChevronRightIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
        <Box
          sx={{
            alignSelf: { xs: 'flex-end', sm: 'auto' },
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
          }}
        >
          <IconButton
            onClick={() =>
              selectionMode ? exitSelectionMode() : setSelectionMode(true)
            }
            size="small"
            aria-label={selectionMode ? 'Exit selection mode' : 'Select multiple'}
            sx={{
              width: 28,
              height: 28,
              p: 0.5,
              color: selectionMode ? 'primary.main' : 'text.secondary',
              backgroundColor: selectionMode ? 'action.selected' : 'transparent',
              '&:hover': { backgroundColor: 'action.hover' },
            }}
          >
            <ChecklistIcon sx={{ fontSize: 18 }} />
          </IconButton>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
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
      </Box>

      {error && (
        <ErrorMessage error={error} onClose={() => dispatch(clearError())} />
      )}

      {/* Selection Header - only visible in selection mode */}
      {selectionMode && combinedItems.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 1,
            height: 44,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
            <IconButton
              size="small"
              onClick={exitSelectionMode}
              aria-label="Exit selection"
              sx={{ color: 'text.secondary' }}
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <Checkbox
              checked={isAllSelected}
              indeterminate={isIndeterminate}
              onChange={(e) => handleSelectAll(e.target.checked)}
              size="small"
              sx={{ p: 0.5 }}
            />
            <Typography
              variant="body2"
              sx={{ fontSize: '0.8125rem', fontWeight: 500 }}
            >
              {selectedItems.size} selected
            </Typography>
          </Box>
          {selectedItems.size > 0 && (
            <Box sx={{ display: 'flex', gap: 0.25 }}>
              {selectedTransactionIds.length > 0 && (
                <IconButton
                  size="small"
                  onClick={() => setBulkEditOpen(true)}
                  disabled={isBulkDeleting}
                  aria-label="Edit selected"
                  sx={{ color: 'text.secondary' }}
                >
                  <EditIcon sx={{ fontSize: 18 }} />
                </IconButton>
              )}
              <IconButton
                size="small"
                onClick={() => setBulkDeleteConfirm(true)}
                disabled={isBulkDeleting}
                aria-label="Delete selected"
                sx={{
                  color: 'text.secondary',
                  '&:hover': { color: 'google.red' },
                }}
              >
                <DeleteIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
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
        <EmptyState
          icon={<ReceiptIcon />}
          title="No transactions yet"
          subtitle="Create your first transaction to start tracking your finances"
          action={
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
          }
        />
      ) : (
        <>
          {/* Mobile Card View */}
          {!isDesktopView && (
          <Box
            sx={{
              overflow: 'hidden',
              width: '100%',
            }}
          >
            {visibleItems.map((item) => {
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
                    getCategoryDisplayName={getCategoryDisplayName}
                    getAccountName={getAccountName}
                    onSelect={handleItemSelect}
                    onEdit={handleEditTransaction}
                  />
                );
              }
            })}
          </Box>
          )}

          {/* Desktop Table View */}
          {isDesktopView && (
          <TableContainer sx={{ overflow: 'hidden' }}>
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
                {visibleItems.map((item) => {
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
                              gap: 0.5,
                            }}
                          >
                            <SwapHorizIcon
                              sx={{ fontSize: 16, color: 'text.secondary' }}
                            />
                            <Typography
                              variant="body2"
                              sx={{ fontSize: '0.8125rem', fontWeight: 500 }}
                            >
                              Transfer
                            </Typography>
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
                              fontWeight={600}
                              sx={{ fontSize: '0.875rem', color: 'google.red' }}
                            >
                              {formatCurrency(
                                Math.abs(transferOut?.amount || 0),
                                getAccountCurrency(transferOut?.account_id)
                              )}
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
                                  fontWeight={600}
                                  sx={{
                                    fontSize: '0.875rem',
                                    color: 'google.green',
                                  }}
                                >
                                  {formatCurrency(
                                    Math.abs(transferIn?.amount || 0),
                                    getAccountCurrency(transferIn?.account_id)
                                  )}
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
                    // Now uses the date field which contains full datetime (TIMESTAMPTZ)
                    const dateDisplay = (() => {
                      try {
                        const dateTime = parseISO(transaction.date);
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
                            component="span"
                            onClick={
                              selectionMode || isBulkDeleting
                                ? undefined
                                : tableQe.open('category', transaction)
                            }
                            sx={[
                              {
                                fontSize: '0.8125rem',
                                fontWeight: 500,
                                display: 'inline-block',
                              },
                              !(selectionMode || isBulkDeleting) && editableTextSx,
                            ]}
                          >
                            {getCategoryDisplayName(transaction.category_id)}
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
                            component="span"
                            title={description || ''}
                            onClick={
                              selectionMode || isBulkDeleting
                                ? undefined
                                : tableQe.open('description', transaction)
                            }
                            sx={[
                              {
                                fontSize: '0.8125rem',
                                color: 'text.secondary',
                                display: 'inline-block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: 300,
                                fontStyle: description ? 'normal' : 'italic',
                                opacity: description ? 1 : 0.7,
                              },
                              !(selectionMode || isBulkDeleting) && editableTextSx,
                            ]}
                          >
                            {description || 'Add note'}
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
                              fontWeight={600}
                              component="span"
                              onClick={
                                selectionMode || isBulkDeleting
                                  ? undefined
                                  : tableQe.open('amount', transaction)
                              }
                              sx={[
                                {
                                  fontSize: '0.875rem',
                                  display: 'inline-block',
                                  color:
                                    transaction.type === 'Income' ||
                                    transaction.type === 'Transfer In'
                                      ? 'google.green'
                                      : transaction.type === 'Expense' ||
                                        transaction.type === 'Transfer Out'
                                      ? 'google.red'
                                      : 'text.primary',
                                },
                                !(selectionMode || isBulkDeleting) &&
                                  editableTextSx,
                              ]}
                            >
                              {formatCurrency(
                                Math.abs(transaction.amount),
                                transaction.currency
                              )}
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
          )}

          {hiddenItemCount > 0 && (
            <Button
              fullWidth
              size="small"
              onClick={() => setVisibleCount((count) => count + RENDER_CHUNK)}
              sx={{ mt: 1, textTransform: 'none', color: 'text.secondary' }}
            >
              Show {Math.min(RENDER_CHUNK, hiddenItemCount)} more (
              {hiddenItemCount} remaining)
            </Button>
          )}
        </>
      )}

      {/* Edit Transaction Dialog */}
      <EditTransactionDialog
        open={editDialogOpen}
        onClose={handleCloseEditDialog}
        transaction={editingTransaction}
      />

      {/* Quick-edit for the desktop table (mobile rows carry their own) */}
      {tableQe.state?.transaction && (
        <TransactionQuickEditor
          transaction={tableQe.state.transaction}
          field={tableQe.state.field}
          anchorEl={tableQe.state.anchorEl}
          open={!!tableQe.state}
          onClose={tableQe.close}
        />
      )}

      {/* Create Transfer Dialog */}
      <AddTransferDialog
        open={openTransferDialog}
        onClose={handleCloseTransferDialog}
      />

      {/* Bulk Edit Dialog */}
      <BulkEditTransactionsDialog
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        onApplied={exitSelectionMode}
        transactionIds={selectedTransactionIds}
        transferCount={selectedTransferCount}
      />

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
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogContent sx={{ textAlign: 'center', pt: 3.5, pb: 1 }}>
          {bulkDeleteError && (
            <Alert
              severity="error"
              sx={{ mb: 2, textAlign: 'left' }}
              onClose={() => setBulkDeleteError(null)}
            >
              {bulkDeleteError}
            </Alert>
          )}
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              bgcolor: 'error.light',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 2,
            }}
          >
            <DeleteOutlineIcon sx={{ fontSize: 28, color: 'error.main' }} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
            Delete {selectedItems.size} item
            {selectedItems.size !== 1 ? 's' : ''}?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This can&apos;t be undone.
            {(() => {
              const transferCount = Array.from(selectedItems).filter((id) =>
                id.startsWith('transfer-')
              ).length;
              if (transferCount > 0) {
                return ` Deleting ${transferCount} transfer${
                  transferCount !== 1 ? 's' : ''
                } also removes both linked transactions.`;
              }
              return '';
            })()}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 1, gap: 1.5 }}>
          <Button
            fullWidth
            onClick={() => {
              setBulkDeleteConfirm(false);
              setBulkDeleteError(null);
            }}
            disabled={isBulkDeleting}
            variant="outlined"
            sx={{ textTransform: 'none', py: 1 }}
          >
            Cancel
          </Button>
          <Button
            fullWidth
            onClick={handleBulkDelete}
            color="error"
            variant="contained"
            disabled={isBulkDeleting}
            startIcon={
              isBulkDeleting ? (
                <CircularProgress size={18} color="inherit" />
              ) : null
            }
            sx={{ textTransform: 'none', py: 1 }}
          >
            {isBulkDeleting ? 'Deleting…' : 'Delete'}
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
