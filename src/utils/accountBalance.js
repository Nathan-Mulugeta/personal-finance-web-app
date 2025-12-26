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

/**
 * Calculate balances for all accounts from transactions
 * @param {Array} accounts - Array of account objects
 * @param {Array} transactions - Array of all transactions
 * @returns {Object} Map of account_id to balance object
 */
export function calculateAllAccountBalances(accounts, transactions) {
  const balances = {}
  
  accounts.forEach((account) => {
    const accountTransactions = transactions.filter(
      (txn) =>
        txn.account_id === account.account_id &&
        !txn.deleted_at &&
        txn.status !== 'Cancelled'
    )
    
    const balance = calculateAccountBalance(
      account.opening_balance,
      accountTransactions
    )
    
    balances[account.account_id] = {
      account_id: account.account_id,
      name: account.name,
      opening_balance: account.opening_balance,
      current_balance: balance,
      currency: account.currency,
      last_updated: new Date().toISOString(),
    }
  })
  
  return balances
}

