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
import { format, parseISO, isToday } from 'date-fns';
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
 */
function CategoryTransactionsList({ transactions }) {
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={(e) => handleSelectAll(e.target.checked)}
                size="small"
              />
              <Typography variant="body2" color="text.secondary">
                {selectedIds.size > 0
                  ? `${selectedIds.size} selected`
                  : 'Select items'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" onClick={exitSelection} sx={{ minHeight: 32 }}>
                Cancel
              </Button>
              {selectedIds.size > 0 && (
                <>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<EditIcon sx={{ fontSize: 16 }} />}
                    onClick={() => setBulkEditOpen(true)}
                    disabled={isBulkDeleting}
                    sx={{ minHeight: 32 }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon sx={{ fontSize: 16 }} />}
                    onClick={() => setBulkDeleteConfirm(true)}
                    disabled={isBulkDeleting}
                    sx={{ minHeight: 32 }}
                  >
                    Delete
                  </Button>
                </>
              )}
            </Box>
          </>
        ) : (
          <>
            <Typography variant="caption" color="text.secondary">
              {transactions.length} transaction
              {transactions.length !== 1 ? 's' : ''}
            </Typography>
            <IconButton
              onClick={() => setSelectionMode(true)}
              size="small"
              aria-label="Select multiple"
              sx={{ color: 'text.secondary' }}
            >
              <ChecklistIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </>
        )}
      </Box>

      {/* Rows */}
      <Box>
        {transactions.map((txn) => {
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
