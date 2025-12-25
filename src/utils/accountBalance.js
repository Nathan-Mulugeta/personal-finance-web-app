/**
 * Calculate account balance from transactions
 * This is a client-side utility - the database function is the source of truth
 */
export function calculateAccountBalance(openingBalance, transactions) {
  let balance = parseFloat(openingBalance) || 0

  transactions.forEach(txn => {
    if (txn.deleted_at || txn.status === 'Cancelled') {
      return // Skip deleted or cancelled transactions
    }

    if (txn.type === 'Income' || txn.type === 'Transfer In') {
      balance += parseFloat(txn.amount) || 0
    } else if (txn.type === 'Expense' || txn.type === 'Transfer Out') {
      balance -= parseFloat(txn.amount) || 0
    }
  })

  return balance
}

