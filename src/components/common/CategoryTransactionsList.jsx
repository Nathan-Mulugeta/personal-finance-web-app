import { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from '@mui/material';
import ChecklistIcon from '@mui/icons-material/Checklist';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import { format, parseISO, isToday } from 'date-fns';
import { formatCurrency } from '../../utils/currencyConversion';
import {
  selectAccountNameGetter,
  selectCategoryDisplayNameGetter,
} from '../../store/selectors';
import { bulkDeleteTransactions } from '../../store/slices/transactionsSlice';
import EditTransactionDialog from './EditTransactionDialog';
import BulkEditTransactionsDialog from './BulkEditTransactionsDialog';

const rowTapSx = {
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  userSelect: 'none',
  '&:active': { backgroundColor: 'action.hover' },
  '@media (hover: hover)': {
    '&:hover': { backgroundColor: 'action.hover' },
  },
};

const amountColor = (type) => {
  if (type === 'Income' || type === 'Transfer In') return 'google.green';
  if (type === 'Expense' || type === 'Transfer Out') return 'google.red';
  return 'text.primary';
};

const dateDisplay = (dateStr) => {
  try {
    const dt = parseISO(dateStr);
    return isToday(dt) ? format(dt, 'h:mm a') : format(dt, 'MMM dd');
  } catch {
    return dateStr;
  }
};

/**
 * The transactions-in-a-category list used inside the Reports modal, styled
 * and behaving like the Transactions page (dense rows, multi-select, bulk
 * edit/delete, tap-to-edit) minus the filters. Self-contained: reuses the
 * shared edit/bulk-edit dialogs and the bulk-delete thunk so nothing on the
 * Transactions page needs to change.
 *
 * @param {Array} transactions - plain transaction rows to display
 * @param {number} [pageSize] - if set, render in chunks with a "Show more"
 *   button (like the Transactions page); omit to render all rows
 */
function CategoryTransactionsList({ transactions, pageSize }) {
  const dispatch = useDispatch();
  const getAccountName = useSelector(selectAccountNameGetter);
  const getCategoryDisplayName = useSelector(selectCategoryDisplayNameGetter);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState(null);

  const ids = useMemo(
    () => transactions.map((t) => t.transaction_id),
    [transactions]
  );

  // Per-currency total (like the Transactions page): spending (outflow) by
  // currency, falling back to income for income-only lists
  const totalLabel = useMemo(() => {
    const out = {};
    const inc = {};
    transactions.forEach((t) => {
      const bucket =
        t.type === 'Expense' || t.type === 'Transfer Out'
          ? out
          : t.type === 'Income' || t.type === 'Transfer In'
          ? inc
          : null;
      if (!bucket) return;
      bucket[t.currency] = (bucket[t.currency] || 0) + Math.abs(t.amount || 0);
    });
    const source = Object.keys(out).length ? out : inc;
    const parts = Object.entries(source).map(([currency, amount]) =>
      formatCurrency(amount, currency)
    );
    return parts.length ? `Total: ${parts.join(', ')}` : '';
  }, [transactions]);

  // Optional chunked rendering (search results can be long)
  const [visibleCount, setVisibleCount] = useState(
    pageSize || transactions.length
  );
  useEffect(() => {
    setVisibleCount(pageSize || transactions.length);
  }, [pageSize, transactions]);
  const visibleTransactions = pageSize
    ? transactions.slice(0, visibleCount)
    : transactions;
  const hiddenCount = transactions.length - visibleTransactions.length;

  // Drop any selected ids that are no longer in the list (e.g. after a delete)
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => ids.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [ids]);

  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
  const someSelected = ids.some((id) => selectedIds.has(id)) && !allSelected;

  const toggleSelect = (id, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSelectAll = (checked) => {
    setSelectedIds(checked ? new Set(ids) : new Set());
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleRowClick = (txn) => {
    if (selectionMode) {
      toggleSelect(txn.transaction_id, !selectedIds.has(txn.transaction_id));
    } else {
      setEditingTransaction(txn);
      setEditOpen(true);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    setBulkDeleteError(null);
    try {
      await dispatch(
        bulkDeleteTransactions(Array.from(selectedIds))
      ).unwrap();
      setBulkDeleteConfirm(false);
      exitSelection();
    } catch (err) {
      setBulkDeleteError(
        err?.message || 'Failed to delete transactions. Please try again.'
      );
    } finally {
      setIsBulkDeleting(false);
    }
  };

  if (transactions.length === 0) {
    return (
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ textAlign: 'center', py: 3 }}
      >
        No transactions found
      </Typography>
    );
  }

  return (
    <Box>
      {/* Selection toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 40,
          mb: 0.5,
        }}
      >
        {selectionMode ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <IconButton
                size="small"
                onClick={exitSelection}
                aria-label="Exit selection"
                sx={{ color: 'text.secondary' }}
              >
                <CloseIcon sx={{ fontSize: 18 }} />
              </IconButton>
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={(e) => handleSelectAll(e.target.checked)}
                size="small"
                sx={{ p: 0.5 }}
              />
              <Typography
                variant="body2"
                sx={{ fontSize: '0.8125rem', fontWeight: 500 }}
              >
                {selectedIds.size} selected
              </Typography>
            </Box>
            {selectedIds.size > 0 && (
              <Box sx={{ display: 'flex', gap: 0.25 }}>
                <IconButton
                  size="small"
                  onClick={() => setBulkEditOpen(true)}
                  disabled={isBulkDeleting}
                  aria-label="Edit selected"
                  sx={{ color: 'text.secondary' }}
                >
                  <EditIcon sx={{ fontSize: 18 }} />
                </IconButton>
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
          </>
        ) : (
          <>
            <Typography
              variant="caption"
              noWrap
              sx={{ color: 'text.secondary', minWidth: 0 }}
            >
              {transactions.length} transaction
              {transactions.length !== 1 ? 's' : ''}
              {totalLabel && (
                <>
                  {' · '}
                  <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
                    {totalLabel}
                  </Box>
                </>
              )}
            </Typography>
            <IconButton
              onClick={() => setSelectionMode(true)}
              size="small"
              aria-label="Select multiple"
              sx={{ color: 'text.secondary', flexShrink: 0 }}
            >
              <ChecklistIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </>
        )}
      </Box>

      {/* Rows */}
      <Box>
        {visibleTransactions.map((txn) => {
          const isSelected = selectedIds.has(txn.transaction_id);
          const description = txn.description || '';
          return (
            <Box
              key={txn.transaction_id}
              onClick={() => handleRowClick(txn)}
              sx={{
                py: 1,
                px: 0.5,
                display: 'flex',
                gap: 0.75,
                alignItems: 'flex-start',
                borderBottom: '1px solid',
                borderColor: 'divider',
                backgroundColor: isSelected ? 'action.selected' : 'transparent',
                ...rowTapSx,
              }}
            >
              {selectionMode && (
                <Checkbox
                  checked={isSelected}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleSelect(txn.transaction_id, e.target.checked);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  size="small"
                  sx={{ p: 0, mt: 0.25, flexShrink: 0 }}
                />
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{ fontSize: '0.8125rem', fontWeight: 500, minWidth: 0, flex: 1 }}
                  >
                    {getCategoryDisplayName(txn.category_id)}
                  </Typography>
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    sx={{
                      fontSize: '0.8125rem',
                      color: amountColor(txn.type),
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {txn.currency}{' '}
                    {new Intl.NumberFormat('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(Math.abs(txn.amount))}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{ fontSize: '0.6875rem', color: 'text.secondary', minWidth: 0, flex: 1 }}
                  >
                    {getAccountName(txn.account_id)}
                    {description && ` • ${description}`}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontSize: '0.6875rem', color: 'text.secondary', flexShrink: 0 }}
                  >
                    {dateDisplay(txn.date)}
                  </Typography>
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>

      {hiddenCount > 0 && (
        <Button
          fullWidth
          size="small"
          onClick={() =>
            setVisibleCount((count) => count + (pageSize || count))
          }
          sx={{ mt: 1, textTransform: 'none', color: 'text.secondary' }}
        >
          Show {Math.min(pageSize, hiddenCount)} more ({hiddenCount} remaining)
        </Button>
      )}

      {/* Per-row edit (stacked over the modal) */}
      <EditTransactionDialog
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditingTransaction(null);
        }}
        transaction={editingTransaction}
      />

      {/* Bulk edit (all rows here are plain transactions) */}
      <BulkEditTransactionsDialog
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        onApplied={exitSelection}
        transactionIds={Array.from(selectedIds)}
        transferCount={0}
      />

      {/* Bulk delete confirmation */}
      <Dialog
        open={bulkDeleteConfirm}
        onClose={() => !isBulkDeleting && setBulkDeleteConfirm(false)}
      >
        <DialogTitle>
          Delete {selectedIds.size} transaction
          {selectedIds.size !== 1 ? 's' : ''}?
        </DialogTitle>
        <DialogContent>
          {bulkDeleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {bulkDeleteError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary">
            This can&apos;t be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setBulkDeleteConfirm(false)}
            disabled={isBulkDeleting}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleBulkDelete}
            disabled={isBulkDeleting}
            startIcon={
              isBulkDeleting ? (
                <CircularProgress size={20} color="inherit" />
              ) : null
            }
          >
            {isBulkDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default CategoryTransactionsList;
