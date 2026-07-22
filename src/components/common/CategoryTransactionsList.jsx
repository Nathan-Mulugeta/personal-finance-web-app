import {
  useState,
  useEffect,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
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
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ChecklistIcon from '@mui/icons-material/Checklist';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloseIcon from '@mui/icons-material/Close';
import { format, parseISO, isToday } from 'date-fns';
import {
  getTransactionsTotalLabel,
  formatCurrency,
} from '../../utils/currencyConversion';
import {
  selectAccountNameGetter,
  selectCategoryDisplayNameGetter,
} from '../../store/selectors';
import { bulkDeleteTransactions } from '../../store/slices/transactionsSlice';
import EditTransactionDialog from './EditTransactionDialog';
import { useInlineEdit, InlineFieldInput } from './InlineFieldEditor';
import { editableTextSx } from './inlineEditStyles';
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
 * @param {boolean} [showSummary=true] - show the "N transactions · Total" line
 *   in the header. Set false when the count/total is shown elsewhere.
 * @param {boolean} [showRestingHeader=true] - render the resting header row
 *   (which hosts the multi-select toggle). Set false when the parent hosts the
 *   toggle in its own header and calls `enterSelection()` via ref, avoiding an
 *   empty toggle-only row above the list.
 * @param {React.Ref} ref - exposes `{ enterSelection() }` so a parent-hosted
 *   toggle can start multi-select.
 */
function CategoryTransactionsList(
  { transactions, pageSize, showSummary = true, showRestingHeader = true },
  ref
) {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isDesktopView = useMediaQuery(theme.breakpoints.up('md'));
  const getAccountName = useSelector(selectAccountNameGetter);
  const getCategoryDisplayName = useSelector(selectCategoryDisplayNameGetter);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  // Shared quick-editor for tap-to-edit category/amount/note on rows (both the
  // desktop table and mobile rows are inline maps, so one state serves all)
  const inline = useInlineEdit();
  const startEdit = (field, txn) =>
    selectionMode ? undefined : inline.start(field, txn);
  const quickCursor = selectionMode ? 'inherit' : 'pointer';

  // Let a parent-hosted toggle start multi-select (used when the resting
  // header is suppressed via showRestingHeader={false})
  useImperativeHandle(ref, () => ({
    enterSelection: () => setSelectionMode(true),
  }));
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

  // Per-currency total (like the Transactions page)
  const totalLabel = useMemo(
    () => (showSummary ? getTransactionsTotalLabel(transactions) : ''),
    [transactions, showSummary]
  );

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
    // Swallow the click that just dismissed an inline editor
    if (inline.justClosed()) return;
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
      {/* Selection toolbar — omitted entirely in resting state when the parent
          hosts the toggle, so there's no empty row above the list */}
      {(selectionMode || showRestingHeader) && (
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
            {showSummary && (
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
                    <Box
                      component="span"
                      sx={{ fontWeight: 600, color: 'text.primary' }}
                    >
                      {totalLabel}
                    </Box>
                  </>
                )}
              </Typography>
            )}
            <IconButton
              onClick={() => setSelectionMode(true)}
              size="small"
              aria-label="Select multiple"
              sx={{ color: 'text.secondary', flexShrink: 0, ml: 'auto' }}
            >
              <ChecklistIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </>
        )}
      </Box>
      )}

      {/* Rows — a single-line aligned table on desktop (like the Transactions
          page), the dense two-line format on mobile (untouched) */}
      {isDesktopView ? (
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
                  <TableCell padding="checkbox" sx={{ width: 40 }} />
                )}
                <TableCell>Category</TableCell>
                <TableCell>Account</TableCell>
                <TableCell>Description</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Date</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleTransactions.map((txn) => {
                const isSelected = selectedIds.has(txn.transaction_id);
                return (
                  <TableRow
                    key={txn.transaction_id}
                    hover
                    selected={isSelected}
                    onClick={() => handleRowClick(txn)}
                    sx={{
                      cursor: 'pointer',
                      userSelect: 'none',
                      backgroundColor: isSelected
                        ? 'action.selected'
                        : 'transparent',
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
                            toggleSelect(txn.transaction_id, e.target.checked);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          size="small"
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      {inline.isEditing('category', txn) ? (
                        <InlineFieldInput transaction={txn} field="category" onDone={inline.stop} textSx={{ fontSize: '0.8125rem', fontWeight: 500 }} />
                      ) : (
                        <Typography
                          variant="body2"
                          component="span"
                          onClick={startEdit('category', txn)}
                          sx={[
                            { fontSize: '0.8125rem', fontWeight: 500, display: 'inline-block' },
                            !selectionMode && editableTextSx,
                          ]}
                        >
                          {getCategoryDisplayName(txn.category_id)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                        {getAccountName(txn.account_id)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {inline.isEditing('description', txn) ? (
                        <InlineFieldInput transaction={txn} field="description" onDone={inline.stop} textSx={{ fontSize: '0.8125rem', color: 'text.secondary' }} />
                      ) : (
                        <Typography
                          variant="body2"
                          noWrap
                          component="span"
                          onClick={startEdit('description', txn)}
                          sx={[
                            {
                              fontSize: '0.8125rem',
                              color: 'text.secondary',
                              display: 'inline-block',
                              maxWidth: 280,
                              fontStyle: txn.description ? 'normal' : 'italic',
                              opacity: txn.description ? 1 : 0.7,
                            },
                            !selectionMode && editableTextSx,
                          ]}
                        >
                          {txn.description || 'Add note'}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                        {dateDisplay(txn.date)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {inline.isEditing('amount', txn) ? (
                        <InlineFieldInput transaction={txn} field="amount" onDone={inline.stop} textSx={{ fontSize: '0.8125rem', fontWeight: 600, color: amountColor(txn.type) }} />
                      ) : (
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          component="span"
                          onClick={startEdit('amount', txn)}
                          sx={[
                            { fontSize: '0.8125rem', color: amountColor(txn.type), whiteSpace: 'nowrap', display: 'inline-block' },
                            !selectionMode && editableTextSx,
                          ]}
                        >
                          {formatCurrency(Math.abs(txn.amount), txn.currency)}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
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
                  {inline.isEditing('category', txn) ? (
                    <Box sx={{ flex: 1, minWidth: 0, mr: 1 }}>
                      <InlineFieldInput transaction={txn} field="category" onDone={inline.stop} textSx={{ fontSize: '0.8125rem', fontWeight: 500 }} />
                    </Box>
                  ) : (
                    <Typography
                      variant="body2"
                      noWrap
                      onClick={startEdit('category', txn)}
                      sx={[
                        { fontSize: '0.8125rem', fontWeight: 500, minWidth: 0, cursor: quickCursor },
                        !selectionMode && editableTextSx,
                      ]}
                    >
                      {getCategoryDisplayName(txn.category_id)}
                    </Typography>
                  )}
                  {inline.isEditing('amount', txn) ? (
                    <InlineFieldInput transaction={txn} field="amount" onDone={inline.stop} textSx={{ fontSize: '0.8125rem', fontWeight: 600, color: amountColor(txn.type) }} />
                  ) : (
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      onClick={startEdit('amount', txn)}
                      sx={[
                        {
                          fontSize: '0.8125rem',
                          color: amountColor(txn.type),
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          cursor: quickCursor,
                        },
                        !selectionMode && editableTextSx,
                      ]}
                    >
                      {formatCurrency(Math.abs(txn.amount), txn.currency)}
                    </Typography>
                  )}
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  {inline.isEditing('description', txn) ? (
                    <Box sx={{ flex: 1, minWidth: 0, mr: 1 }}>
                      <InlineFieldInput transaction={txn} field="description" onDone={inline.stop} textSx={{ fontSize: '0.6875rem', color: 'text.secondary' }} prefix={`${getAccountName(txn.account_id)} · `} />
                    </Box>
                  ) : (
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{ fontSize: '0.6875rem', color: 'text.secondary', minWidth: 0, flex: 1 }}
                    >
                      {/* Account taps bubble to the row → full edit */}
                      <Box component="span">{getAccountName(txn.account_id)}</Box>
                      {' • '}
                      {description ? (
                        <Box
                          component="span"
                          onClick={startEdit('description', txn)}
                          sx={[{ cursor: quickCursor }, !selectionMode && editableTextSx]}
                        >
                          {description}
                        </Box>
                      ) : (
                        <Box
                          component="span"
                          onClick={startEdit('description', txn)}
                          sx={[
                            { cursor: quickCursor, fontStyle: 'italic', opacity: 0.7 },
                            !selectionMode && editableTextSx,
                          ]}
                        >
                          Add note
                        </Box>
                      )}
                    </Typography>
                  )}
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
      )}

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
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogContent sx={{ textAlign: 'center', pt: 3.5, pb: 1 }}>
          {bulkDeleteError && (
            <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>
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
            Delete {selectedIds.size} transaction
            {selectedIds.size !== 1 ? 's' : ''}?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This can&apos;t be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 1, gap: 1.5 }}>
          <Button
            fullWidth
            variant="outlined"
            onClick={() => setBulkDeleteConfirm(false)}
            disabled={isBulkDeleting}
            sx={{ textTransform: 'none', py: 1 }}
          >
            Cancel
          </Button>
          <Button
            fullWidth
            color="error"
            variant="contained"
            onClick={handleBulkDelete}
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
    </Box>
  );
}

export default forwardRef(CategoryTransactionsList);
