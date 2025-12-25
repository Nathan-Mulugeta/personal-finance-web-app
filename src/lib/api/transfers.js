import { supabase, generateId, getCurrentUser } from '../supabase'
import * as transactionsApi from './transactions'
import * as exchangeRatesApi from './exchangeRates'

// Create transfer
export async function createTransfer(transferData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const {
    fromAccountId,
    toAccountId,
    amount, // For same currency
    fromAmount, // For multi-currency
    toAmount, // For multi-currency
    categoryId = null,
    description = '',
    status = 'Cleared',
    date,
  } = transferData

  // Validation
  if (!fromAccountId || !toAccountId) {
    throw new Error('From account and to account are required')
  }
  if (fromAccountId === toAccountId) {
    throw new Error('From account and to account must be different')
  }

  // Get accounts
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'Active')
    .in('account_id', [fromAccountId, toAccountId])

  if (!accounts || accounts.length !== 2) {
    throw new Error('One or both accounts not found or inactive')
  }

  const fromAccount = accounts.find(acc => acc.account_id === fromAccountId)
  const toAccount = accounts.find(acc => acc.account_id === toAccountId)

  // Determine if same or multi-currency
  const sameCurrency = fromAccount.currency === toAccount.currency

  let finalFromAmount, finalToAmount

  if (sameCurrency) {
    // Same currency: use single amount
    if (amount === undefined) {
      throw new Error('Amount is required for same-currency transfers')
    }
    finalFromAmount = Math.abs(amount)
    finalToAmount = Math.abs(amount)
  } else {
    // Multi-currency: both amounts required
    if (fromAmount === undefined || toAmount === undefined) {
      throw new Error('Both fromAmount and toAmount are required for multi-currency transfers')
    }
    finalFromAmount = Math.abs(fromAmount)
    finalToAmount = Math.abs(toAmount)
  }

  // Generate transfer ID
  const transferId = generateId('TRF')
  const transferDate = date ? new Date(date) : new Date()

  // Create transfer out transaction
  const transferOut = await transactionsApi.createTransaction({
    accountId: fromAccountId,
    categoryId: categoryId || (await getDefaultTransferCategory(user.id, 'Expense')),
    amount: -finalFromAmount, // Negative for outbound
    currency: fromAccount.currency,
    description: description || `Transfer to ${toAccount.name}`,
    type: 'Transfer Out',
    status,
    date: transferDate.toISOString().split('T')[0],
    transferId,
  })

  // Create transfer in transaction
  const transferIn = await transactionsApi.createTransaction({
    accountId: toAccountId,
    categoryId: categoryId || (await getDefaultTransferCategory(user.id, 'Income')),
    amount: finalToAmount, // Positive for inbound
    currency: toAccount.currency,
    description: description || `Transfer from ${fromAccount.name}`,
    type: 'Transfer In',
    status,
    date: transferDate.toISOString().split('T')[0],
    transferId,
    linkedTransactionId: transferOut.transaction_id,
  })

  // Update transfer out with linked transaction ID
  await transactionsApi.updateTransaction(transferOut.transaction_id, {
    linkedTransactionId: transferIn.transaction_id,
  })

  // Log exchange rate if multi-currency
  if (!sameCurrency) {
    const rate = finalToAmount / finalFromAmount
    await exchangeRatesApi.createExchangeRate({
      transferId,
      fromCurrency: fromAccount.currency,
      toCurrency: toAccount.currency,
      rate,
      fromAmount: finalFromAmount,
      toAmount: finalToAmount,
      date: transferDate.toISOString().split('T')[0],
    })
  }

  return {
    transferId,
    transferOut,
    transferIn,
    exchangeRate: !sameCurrency ? {
      fromCurrency: fromAccount.currency,
      toCurrency: toAccount.currency,
      rate: finalToAmount / finalFromAmount,
    } : null,
  }
}

// Helper to get default transfer category
async function getDefaultTransferCategory(userId, type) {
  // Try to find a "Transfer" category
  const { data: categories } = await supabase
    .from('categories')
    .select('category_id')
    .eq('user_id', userId)
    .eq('type', type)
    .ilike('name', '%transfer%')
    .eq('status', 'Active')
    .limit(1)

  if (categories && categories.length > 0) {
    return categories[0].category_id
  }

  // If no transfer category, return null (will need to be handled by caller)
  return null
}

// Get transfers
export async function getTransfers(filters = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  // Get transactions with transfer_id
  let query = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .not('transfer_id', 'is', null)
    .is('deleted_at', null)

  if (filters.fromAccountId) {
    query = query.eq('account_id', filters.fromAccountId)
  }
  if (filters.toAccountId) {
    // This is more complex - need to check linked transactions
    // For now, we'll get all and filter in code
  }
  if (filters.startDate) {
    query = query.gte('date', filters.startDate)
  }
  if (filters.endDate) {
    query = query.lte('date', filters.endDate)
  }

  const { data: transactions, error } = await query.order('date', { ascending: false })

  if (error) throw error

  // Group by transfer_id
  const transfersMap = new Map()
  transactions.forEach(txn => {
    if (!txn.transfer_id) return

    if (!transfersMap.has(txn.transfer_id)) {
      transfersMap.set(txn.transfer_id, {
        transferId: txn.transfer_id,
        transactions: [],
      })
    }

    transfersMap.get(txn.transfer_id).transactions.push(txn)
  })

  // Get exchange rates for transfers
  const transferIds = Array.from(transfersMap.keys())
  const { data: exchangeRates } = await supabase
    .from('exchange_rates')
    .select('*')
    .eq('user_id', user.id)
    .in('transfer_id', transferIds)

  // Build transfer objects
  const transfers = Array.from(transfersMap.values()).map(transfer => {
    const transferOut = transfer.transactions.find(t => t.type === 'Transfer Out')
    const transferIn = transfer.transactions.find(t => t.type === 'Transfer In')
    const exchangeRate = exchangeRates?.find(er => er.transfer_id === transfer.transfer_id)

    return {
      transferId: transfer.transfer_id,
      transferOut,
      transferIn,
      exchangeRate,
      date: transferOut?.date || transferIn?.date,
    }
  })

  // Filter by toAccountId if specified
  if (filters.toAccountId) {
    return transfers.filter(t => t.transferIn?.account_id === filters.toAccountId)
  }

  return transfers
}

// Get transfer by ID
export async function getTransferById(transferId) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const transfers = await getTransfers()
  return transfers.find(t => t.transferId === transferId) || null
}

// Delete transfer (deletes both transactions)
export async function deleteTransfer(transactionId) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  // Get transaction
  const transaction = await transactionsApi.getTransactionById(transactionId)
  if (!transaction) {
    throw new Error('Transaction not found')
  }

  if (!transaction.transfer_id) {
    throw new Error('Transaction is not part of a transfer')
  }

  // Get all transactions with this transfer_id
  const { data: transferTransactions } = await supabase
    .from('transactions')
    .select('transaction_id')
    .eq('transfer_id', transaction.transfer_id)
    .eq('user_id', user.id)
    .is('deleted_at', null)

  // Delete all transactions
  for (const txn of transferTransactions || []) {
    await transactionsApi.deleteTransaction(txn.transaction_id)
  }

  // Delete exchange rates
  const { error } = await supabase
    .from('exchange_rates')
    .delete()
    .eq('transfer_id', transaction.transfer_id)
    .eq('user_id', user.id)

  if (error) throw error
}

