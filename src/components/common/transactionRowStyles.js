// Shared text styles for transaction rows. The display spans and their inline
// editors both consume these, so entering edit mode can never drift from the
// row it replaces — a mismatch here is exactly what causes visible jumps.

// Green for money in, red for money out — the same read everywhere an amount
// shows (rows, tables, editors).
export const amountColor = (type) => {
  if (type === 'Income' || type === 'Transfer In') return 'google.green';
  if (type === 'Expense' || type === 'Transfer Out') return 'google.red';
  return 'text.primary';
};

// Primary label (category name)
export const rowCategoryTextSx = { fontSize: '0.8125rem', fontWeight: 500 };

// Note/description at row size (desktop cells)
export const rowNoteTextSx = { fontSize: '0.8125rem', color: 'text.secondary' };

// Muted sub-line (mobile "account · note" line)
export const rowSubTextSx = { fontSize: '0.6875rem', color: 'text.secondary' };

// Amounts: dense rows vs the roomier desktop table
export const rowAmountTextSx = (type) => ({
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: amountColor(type),
});
export const tableAmountTextSx = (type) => ({
  fontSize: '0.875rem',
  fontWeight: 600,
  color: amountColor(type),
});
