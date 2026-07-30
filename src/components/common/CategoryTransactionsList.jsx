import {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Button,
  Checkbox,
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
import { format, parseISO, isToday } from 'date-fns';
import {
  getTransactionsTotalLabel,
  formatCurrency,
} from '../../utils/currencyConversion';
import {
  selectAccountNameGetter,
  selectCategoryDisplayNameGetter,
  selectShowBudgetOnRows,
} from '../../store/selectors';
import {
  bulkDeleteTransactions,
  deleteTransaction,
} from '../../store/slices/transactionsSlice';
import EditTransactionDialog from './EditTransactionDialog';
import SwipeToDelete from './SwipeToDelete';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import { useInlineEdit, InlineFieldInput } from './InlineFieldEditor';
import { editableTextSx } from './inlineEditStyles';
import {
  rowCategoryTextSx,
  rowNoteTextSx,
  rowSubTextSx,
  rowAmountTextSx,
} from './transactionRowStyles';
import BulkEditTransactionsDialog from './BulkEditTransactionsDialog';
import { useBudgetStatusMap } from '../../hooks/useBudgetStatusMap';
import RowBudgetBadge from './RowBudgetBadge';

const rowTapSx = {
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  userSelect: 'none',
  '&:active': { backgroundColor: 'action.hover' },
  '@media (hover: hover)': {
    '&:hover': { backgroundColor: 'action.hover' },
  },
};


const dateDisplay = (dateStr) => {
  try {
    const dt = parseISO(dateStr);
    return isToday(dt) ? format(dt, 'h:mm a') : format(dt, 'MMM dd · h:mm a');
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
  {
    transactions,
    pageSize,
    showSummary = true,
    showRestingHeader = true,
    onSelectionModeChange,
  },
  ref
) {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isDesktopView = useMediaQuery(theme.breakpoints.up('md'));
  const getAccountName = useSelector(selectAccountNameGetter);
  const getCategoryDisplayName = useSelector(selectCategoryDisplayNameGetter);
  // Per-row budget badge (F1): one lookup map for the whole list, gated by the
  // Settings toggle. RowBudgetBadge decides per row whether it applies.
  const showBudgetOnRows = useSelector(selectShowBudgetOnRows);
  const { byCategoryId: budgetByCategoryId } = useBudgetStatusMap();

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Let a parent (e.g. Home) swap its own header into selection mode in place.
  // Re-fires false on remount.
  useLayoutEffect(() => {
    onSelectionModeChange?.(selectionMode);
  }, [selectionMode, onSelectionModeChange]);
  // Shared quick-editor for tap-to-edit category/amount/note on rows (both the
  // desktop table and mobile rows are inline maps, so one state serves all)
  const inline = useInlineEdit();
  const startEdit = (field, txn) =>
    selectionMode ? undefined : inline.start(field, txn);

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
  // Single-row delete (swipe on mobile, hover icon on desktop) → confirm modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

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
    if (selectionMode) {
      toggleSelect(txn.transaction_id, !selectedIds.has(txn.transaction_id));
    } else {
      setEditingTransaction(txn);
      setEditOpen(true);
    }
  };

  const handleSingleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await dispatch(
        deleteTransaction(deleteTarget.transaction_id)
      ).unwrap();
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(
        err?.message || 'Failed to delete transaction. Please try again.'
      );
    } finally {
      setIsDeleting(false);
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
          minHeight: 36,
          mb: 0.5,
        }}
      >
        {selectionMode ? (
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}
          >
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onChange={(e) => handleSelectAll(e.target.checked)}
              size="small"
              sx={{ p: 0.5 }}
            />
            <Typography
              variant="body2"
              sx={{ fontSize: '0.8125rem', fontWeight: 500, whiteSpace: 'nowrap' }}
            >
              {selectedIds.size} selected
            </Typography>
            {selectedIds.size > 0 && (
              <>
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
              </>
            )}
          </Box>
        ) : showSummary ? (
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
        ) : (
          <Box />
        )}
        {/* The multi-select toggle doubles as the on/off switch — same spot in
            both modes, highlighted while selecting. */}
        <IconButton
          onClick={() =>
            selectionMode ? exitSelection() : setSelectionMode(true)
          }
          size="small"
          aria-label={selectionMode ? 'Exit selection' : 'Select multiple'}
          sx={{
            flexShrink: 0,
            ml: 'auto',
            color: selectionMode ? 'primary.main' : 'text.secondary',
            backgroundColor: selectionMode ? 'action.selected' : 'transparent',
            '&:hover': { backgroundColor: 'action.hover' },
          }}
        >
          <ChecklistIcon sx={{ fontSize: 18 }} />
        </IconButton>
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
                <TableCell padding="none" sx={{ width: 36 }} />
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
                      // Reveal the trailing delete icon only on row hover
                      '&:hover .row-delete-btn': { opacity: 1 },
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
                        <InlineFieldInput transaction={txn} field="category" onDone={inline.stop} textSx={rowCategoryTextSx} />
                      ) : (
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            component="span"
                            onClick={startEdit('category', txn)}
                            sx={[
                              { ...rowCategoryTextSx, display: 'inline-block' },
                              !selectionMode && editableTextSx,
                            ]}
                          >
                            {getCategoryDisplayName(txn.category_id)}
                          </Typography>
                          <RowBudgetBadge
                            transaction={txn}
                            status={budgetByCategoryId.get(txn.category_id)}
                            enabled={showBudgetOnRows}
                            sx={{ flexShrink: 0 }}
                          />
                        </Box>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                        {getAccountName(txn.account_id)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {inline.isEditing('description', txn) ? (
                        <InlineFieldInput transaction={txn} field="description" onDone={inline.stop} textSx={rowNoteTextSx} />
                      ) : (
                        <Typography
                          variant="body2"
                          noWrap
                          component="span"
                          onClick={startEdit('description', txn)}
                          sx={[
                            {
                              ...rowNoteTextSx,
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
                        <InlineFieldInput transaction={txn} field="amount" onDone={inline.stop} textSx={rowAmountTextSx(txn.type)} />
                      ) : (
                        <Typography
                          variant="body2"
                          component="span"
                          onClick={startEdit('amount', txn)}
                          sx={[
                            { ...rowAmountTextSx(txn.type), whiteSpace: 'nowrap', display: 'inline-block' },
                            !selectionMode && editableTextSx,
                          ]}
                        >
                          {formatCurrency(Math.abs(txn.amount), txn.currency)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell padding="none" align="right">
                      {!selectionMode && (
                        <IconButton
                          size="small"
                          aria-label="Delete transaction"
                          className="row-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(txn);
                          }}
                          sx={{
                            color: 'text.disabled',
                            opacity: 0,
                            transition: 'opacity 0.15s',
                            '&:hover': { color: 'google.red' },
                          }}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                        </IconButton>
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
            <SwipeToDelete
              key={txn.transaction_id}
              onSwipe={() => setDeleteTarget(txn)}
              disabled={selectionMode}
            >
            <Box
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
                      <InlineFieldInput transaction={txn} field="category" onDone={inline.stop} textSx={rowCategoryTextSx} />
                    </Box>
                  ) : (
                    <Typography
                      variant="body2"
                      noWrap
                      onClick={startEdit('category', txn)}
                      sx={[
                        { ...rowCategoryTextSx, minWidth: 0 },
                        !selectionMode && editableTextSx,
                      ]}
                    >
                      {getCategoryDisplayName(txn.category_id)}
                    </Typography>
                  )}
                  {inline.isEditing('amount', txn) ? (
                    <InlineFieldInput transaction={txn} field="amount" onDone={inline.stop} textSx={rowAmountTextSx(txn.type)} />
                  ) : (
                    <Typography
                      variant="body2"
                      onClick={startEdit('amount', txn)}
                      sx={[
                        {
                          ...rowAmountTextSx(txn.type),
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
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
                      <InlineFieldInput transaction={txn} field="description" onDone={inline.stop} textSx={rowSubTextSx} prefix={`${getAccountName(txn.account_id)} · `} />
                    </Box>
                  ) : (
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{ ...rowSubTextSx, minWidth: 0, flex: 1 }}
                    >
                      {/* Account taps bubble to the row → full edit */}
                      <Box component="span">{getAccountName(txn.account_id)}</Box>
                      {' • '}
                      {description ? (
                        <Box
                          component="span"
                          onClick={startEdit('description', txn)}
                          sx={[!selectionMode && editableTextSx]}
                        >
                          {description}
                        </Box>
                      ) : (
                        <Box
                          component="span"
                          onClick={startEdit('description', txn)}
                          sx={[
                            { fontStyle: 'italic', opacity: 0.7 },
                            !selectionMode && editableTextSx,
                          ]}
                        >
                          Add note
                        </Box>
                      )}
                    </Typography>
                  )}
                  <RowBudgetBadge
                    transaction={txn}
                    status={budgetByCategoryId.get(txn.category_id)}
                    enabled={showBudgetOnRows}
                    sx={{ flexShrink: 0 }}
                  />
                  <Typography
                    variant="body2"
                    sx={{ fontSize: '0.6875rem', color: 'text.secondary', flexShrink: 0 }}
                  >
                    {dateDisplay(txn.date)}
                  </Typography>
                </Box>
              </Box>
            </Box>
            </SwipeToDelete>
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

      {/* Single-row delete (swipe / hover icon) */}
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={handleSingleDelete}
        title="Delete this transaction?"
        isDeleting={isDeleting}
        error={deleteError}
      />

      {/* Bulk delete confirmation */}
      <ConfirmDeleteDialog
        open={bulkDeleteConfirm}
        onClose={() => setBulkDeleteConfirm(false)}
        onConfirm={handleBulkDelete}
        title={`Delete ${selectedIds.size} transaction${
          selectedIds.size !== 1 ? 's' : ''
        }?`}
        isDeleting={isBulkDeleting}
        error={bulkDeleteError}
      />
    </Box>
  );
}

export default forwardRef(CategoryTransactionsList);
