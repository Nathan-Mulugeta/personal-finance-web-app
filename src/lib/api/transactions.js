import { supabase, generateId, getCurrentUser } from '../supabase'
import { parseEntityName } from '../../utils/borrowingLendingParser'
import * as settingsApi from './settings'

// Transaction types enum
export const TRANSACTION_TYPES = ['Income', 'Expense', 'Transfer', 'Transfer Out', 'Transfer In']
export const TRANSACTION_STATUSES = ['Pending', 'Cleared', 'Reconciled', 'Cancelled']

// Create transaction
export async function createTransaction(transactionData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const {
    accountId,
    categoryId,
    amount,
    currency,
    description = '',
    type = 'Expense',
    status = 'Cleared',
    date,
    transferId = null,
    linkedTransactionId = null,
  } = transactionData

  // Validation
  if (!accountId || !categoryId || amount === undefined || !currency) {
    throw new Error('Account ID, category ID, amount, and currency are required')
  }
  if (!TRANSACTION_TYPES.includes(type)) {
    throw new Error(`Invalid transaction type. Must be one of: ${TRANSACTION_TYPES.join(', ')}`)
  }
  if (!TRANSACTION_STATUSES.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${TRANSACTION_STATUSES.join(', ')}`)
  }
  if (currency.length !== 3) {
    throw new Error('Currency must be a 3-letter ISO code')
  }

  // Verify account exists and is active
  const { data: account } = await supabase
    .from('accounts')
    .select('*')
    .eq('account_id', accountId)
    .eq('user_id', user.id)
    .eq('status', 'Active')
    .single()

  if (!account) {
    throw new Error('Account not found or is not active')
  }

  // Verify currency matches account
  if (currency.toUpperCase() !== account.currency) {
    throw new Error(`Currency must match account currency: ${account.currency}`)
  }

  // Verify category exists and is active
  const { data: category } = await supabase
    .from('categories')
    .select('*')
    .eq('category_id', categoryId)
    .eq('user_id', user.id)
    .eq('status', 'Active')
    .single()

  if (!category) {
    throw new Error('Category not found or is not active')
  }

  const transactionId = generateId('TXN')
  const transactionDate = date ? new Date(date) : new Date()

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      transaction_id: transactionId,
      user_id: user.id,
      account_id: accountId,
      category_id: categoryId,
      date: transactionDate.toISOString().split('T')[0],
      amount,
      currency: currency.toUpperCase(),
      description,
      type,
      status,
      transfer_id: transferId,
      linked_transaction_id: linkedTransactionId,
    })
    .select()
    .single()

  if (error) throw error

  // Auto-create borrowing/lending record if category matches
  try {
    await autoCreateBorrowingLending(data, user.id)
  } catch (err) {
    // Log error but don't fail transaction creation
    console.error('Failed to create borrowing/lending record:', err)
  }

  return data
}

// Auto-create borrowing/lending record
async function autoCreateBorrowingLending(transaction, userId) {
  // Get settings
  const settings = await settingsApi.getSettings()
  const borrowingCategoryId = settings.find(s => s.setting_key === 'BorrowingCategoryID')?.setting_value
  const lendingCategoryId = settings.find(s => s.setting_key === 'LendingCategoryID')?.setting_value

  // Check if transaction category matches borrowing or lending category
  if (!borrowingCategoryId && !lendingCategoryId) {
    return // No categories configured
  }

  let recordType = null
  if (transaction.category_id === borrowingCategoryId) {
    recordType = 'Borrowing'
  } else if (transaction.category_id === lendingCategoryId) {
    recordType = 'Lending'
  }

  if (!recordType) {
    return // Category doesn't match
  }

  // Parse entity name from description
  const { entityName, notes } = parseEntityName(transaction.description)

  // Create borrowing/lending record
  const { createBorrowingLendingRecord } = await import('./borrowingsLendings')
  await createBorrowingLendingRecord({
    type: recordType,
    originalTransactionId: transaction.transaction_id,
    entityName,
    originalAmount: Math.abs(transaction.amount),
    currency: transaction.currency,
    notes,
  })
}

// Batch create transactions
export async function batchCreateTransactions(transactionsArray) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  if (!Array.isArray(transactionsArray) || transactionsArray.length === 0) {
    throw new Error('Transactions array is required')
  }
  if (transactionsArray.length > 1000) {
    throw new Error('Maximum 1000 transactions per batch')
  }

  // Pre-validate all transactions
  const validationErrors = []
  const accountsMap = new Map()
  const categoriesMap = new Map()

  // Get all unique account and category IDs
  const accountIds = [...new Set(transactionsArray.map(t => t.accountId))]
  const categoryIds = [...new Set(transactionsArray.map(t => t.categoryId))]

  // Fetch accounts
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'Active')
    .in('account_id', accountIds)

  accounts?.forEach(acc => accountsMap.set(acc.account_id, acc))

  // Fetch categories
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'Active')
    .in('category_id', categoryIds)

  categories?.forEach(cat => categoriesMap.set(cat.category_id, cat))

  // Validate each transaction
  transactionsArray.forEach((txn, index) => {
    const errors = []
    if (!txn.accountId || !txn.categoryId || txn.amount === undefined || !txn.currency) {
      errors.push('Missing required fields')
    }
    const account = accountsMap.get(txn.accountId)
    if (!account) {
      errors.push(`Account ${txn.accountId} not found or inactive`)
    } else if (txn.currency.toUpperCase() !== account.currency) {
      errors.push(`Currency mismatch: account uses ${account.currency}`)
    }
    if (!categoriesMap.get(txn.categoryId)) {
      errors.push(`Category ${txn.categoryId} not found or inactive`)
    }
    if (txn.currency && txn.currency.length !== 3) {
      errors.push('Currency must be 3-letter ISO code')
    }
    if (txn.type && !TRANSACTION_TYPES.includes(txn.type)) {
      errors.push(`Invalid type: ${txn.type}`)
    }
    if (txn.status && !TRANSACTION_STATUSES.includes(txn.status)) {
      errors.push(`Invalid status: ${txn.status}`)
    }

    if (errors.length > 0) {
      validationErrors.push({
        index,
        transaction: txn,
        errors,
      })
    }
  })

  if (validationErrors.length > 0) {
    throw new Error(`Validation failed for ${validationErrors.length} transaction(s)`, {
      cause: validationErrors,
    })
  }

  // Prepare transactions for insert
  const transactionDate = new Date()
  const transactionsToInsert = transactionsArray.map(txn => {
    const txnDate = txn.date ? new Date(txn.date) : transactionDate
    return {
      transaction_id: generateId('TXN'),
      user_id: user.id,
      account_id: txn.accountId,
      category_id: txn.categoryId,
      date: txnDate.toISOString().split('T')[0],
      amount: txn.amount,
      currency: txn.currency.toUpperCase(),
      description: txn.description || '',
      type: txn.type || 'Expense',
      status: txn.status || 'Cleared',
      transfer_id: txn.transferId || null,
      linked_transaction_id: txn.linkedTransactionId || null,
    }
  })

  // Insert all transactions
  const { data, error } = await supabase
    .from('transactions')
    .insert(transactionsToInsert)
    .select()

  if (error) throw error

  // Auto-create borrowing/lending records (non-blocking)
  for (const transaction of data) {
    try {
      await autoCreateBorrowingLending(transaction, user.id)
    } catch (err) {
      console.error('Failed to create borrowing/lending record:', err)
    }
  }

  return data
}

// Get transactions
export async function getTransactions(filters = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  let query = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .is('deleted_at', null) // Soft delete filter

  if (filters.accountId) {
    query = query.eq('account_id', filters.accountId)
  }
  if (filters.categoryId) {
    query = query.eq('category_id', filters.categoryId)
  }
  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.type) {
    query = query.eq('type', filters.type)
  }
  if (filters.startDate) {
    query = query.gte('date', filters.startDate)
  }
  if (filters.endDate) {
    query = query.lte('date', filters.endDate)
  }
  if (filters.month) {
    // Filter by month (YYYY-MM format)
    const startDate = `${filters.month}-01`
    const endDate = new Date(new Date(startDate).setMonth(new Date(startDate).getMonth() + 1))
      .toISOString()
      .split('T')[0]
    query = query.gte('date', startDate).lt('date', endDate)
  }

  // Pagination
  if (filters.limit) {
    query = query.limit(filters.limit)
  }
  if (filters.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 100) - 1)
  }

  const { data, error } = await query.order('date', { ascending: false })

  if (error) throw error
  return data || []
}

// Get transaction by ID
export async function getTransactionById(transactionId) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('transaction_id', transactionId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (error) throw error
  return data
}

// Update transaction
export async function updateTransaction(transactionId, updates) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  // Check if transaction exists
  const transaction = await getTransactionById(transactionId)
  if (!transaction) {
    throw new Error('Transaction not found')
  }

  // Validation
  if (updates.type && !TRANSACTION_TYPES.includes(updates.type)) {
    throw new Error(`Invalid transaction type. Must be one of: ${TRANSACTION_TYPES.join(', ')}`)
  }
  if (updates.status && !TRANSACTION_STATUSES.includes(updates.status)) {
    throw new Error(`Invalid status. Must be one of: ${TRANSACTION_STATUSES.join(', ')}`)
  }

  // If updating account or currency, validate
  if (updates.accountId || updates.currency) {
    const accountId = updates.accountId || transaction.account_id
    const currency = updates.currency || transaction.currency

    const { data: account } = await supabase
      .from('accounts')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .eq('status', 'Active')
      .single()

    if (!account) {
      throw new Error('Account not found or is not active')
    }

    if (currency.toUpperCase() !== account.currency) {
      throw new Error(`Currency must match account currency: ${account.currency}`)
    }
  }

  // If updating category, validate
  if (updates.categoryId) {
    const { data: category } = await supabase
      .from('categories')
      .select('*')
      .eq('category_id', updates.categoryId)
      .eq('user_id', user.id)
      .eq('status', 'Active')
      .single()

    if (!category) {
      throw new Error('Category not found or is not active')
    }
  }

  const updateData = {}
  if (updates.accountId !== undefined) updateData.account_id = updates.accountId
  if (updates.categoryId !== undefined) updateData.category_id = updates.categoryId
  if (updates.date !== undefined) {
    updateData.date = new Date(updates.date).toISOString().split('T')[0]
  }
  if (updates.amount !== undefined) updateData.amount = updates.amount
  if (updates.currency !== undefined) updateData.currency = updates.currency.toUpperCase()
  if (updates.description !== undefined) updateData.description = updates.description
  if (updates.type !== undefined) updateData.type = updates.type
  if (updates.status !== undefined) updateData.status = updates.status

  const { data, error } = await supabase
    .from('transactions')
    .update(updateData)
    .eq('transaction_id', transactionId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Soft delete transaction
export async function deleteTransaction(transactionId) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  // Check if transaction is part of a transfer
  const transaction = await getTransactionById(transactionId)
  if (!transaction) {
    throw new Error('Transaction not found')
  }

  // If part of transfer, delete both transactions
  if (transaction.transfer_id || transaction.linked_transaction_id) {
    const transferId = transaction.transfer_id
    const linkedId = transaction.linked_transaction_id

    // Delete both transactions
    const { error: error1 } = await supabase
      .from('transactions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('transaction_id', transactionId)
      .eq('user_id', user.id)

    if (error1) throw error1

    // Delete linked transaction if exists
    if (linkedId) {
      const { error: error2 } = await supabase
        .from('transactions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('transaction_id', linkedId)
        .eq('user_id', user.id)

      if (error2) throw error2
    }

    // Delete other transaction with same transfer_id
    if (transferId) {
      const { error: error3 } = await supabase
        .from('transactions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('transfer_id', transferId)
        .eq('user_id', user.id)
        .neq('transaction_id', transactionId)

      if (error3) throw error3
    }
  } else {
    // Regular transaction, just soft delete
    const { error } = await supabase
      .from('transactions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('transaction_id', transactionId)
      .eq('user_id', user.id)

    if (error) throw error
  }
}

