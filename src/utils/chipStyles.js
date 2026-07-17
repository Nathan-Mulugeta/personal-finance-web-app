/**
 * Shared chip styling so status/type badges look identical on every page
 * (previously each page kept its own copy, which drifted).
 * All colors are theme palette tokens, so both modes work.
 */

// Filled tint style — used for status badges on Categories and Budgets
export function getStatusChipSx(status) {
  const style =
    status === 'Active'
      ? { backgroundColor: 'google.greenBg', color: 'google.green' }
      : { backgroundColor: 'google.grayBg', color: 'google.gray' };
  return { ...style, fontWeight: 500 };
}

// Outlined style — used for status badges on Accounts
export function getOutlinedStatusChipSx(status) {
  const colors = {
    Active: 'google.greenDark',
    Suspended: 'google.yellow',
  };
  const color = colors[status] || 'google.gray';
  return {
    color,
    borderColor: color,
    fontWeight: 500,
    '& .MuiChip-label': { px: 0.75 },
  };
}

// Outlined Income/Expense type chip (green/red text, no fill)
export function getTypeChipSx(type) {
  if (type === 'Income' || type === 'Expense') {
    const color = type === 'Income' ? 'google.green' : 'google.redDark';
    return {
      backgroundColor: 'transparent',
      borderColor: color,
      color,
      fontWeight: 500,
      border: '1px solid',
    };
  }
  return {
    backgroundColor: 'transparent',
    color: 'google.gray',
    fontWeight: 500,
    border: 'none',
  };
}
