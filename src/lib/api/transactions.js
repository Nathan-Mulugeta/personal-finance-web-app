import { supabase, generateId, getCurrentUser } from '../supabase';
import { parseEntityName } from '../../utils/borrowingLendingParser';
import * as settingsApi from './settings';

// Transaction types enum
export const TRANSACTION_TYPES = [
  'Income',
  'Expense',
  'Transfer',
  'Transfer Out',
  'Transfer In',
];
export const TRANSACTION_STATUSES = [
  'Pending',
  'Cleared',
  'Reconciled',
  'Cancelled',
];

// Create transaction using validated RPC function
// This reduces multiple database round trips to a single call
export async function createTransaction(transactionData) {
  const user = await getCurrentUser();
  if (!user) throw new Error('User not authenticated');

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
  } = transactionData;

  // Basic client-side validation
  const isTransferType = type === 'Transfer Out' || type === 'Transfer In';
  if (
    !accountId ||
    (!isTransferType && !categoryId) ||
    amount === undefined ||
    !currency
  ) {
    throw new Error(
      'Account ID, category ID, amount, and currency are required'
    );
  }
  if (currency.length !== 3) {
    throw new Error('Currency must be a 3-letter ISO code');
  }

  const transactionId = generateId('TXN');
  // Use full datetime - if date is provided as date-only string, add current time
  // Otherwise use the provided datetime or current datetime
  let transactionDate;
  if (date) {
    const parsedDate = new Date(date);
    // Check if it's a date-only string (YYYY-MM-DD format without time)
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // Date-only string: add current time
      const now = new Date();
      parsedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    }
    transactionDate = parsedDate;
  } else {
    transactionDate = new Date();
  }

  // Use RPC function for validated creation (single database call)
  const { data, error } = await supabase.rpc('create_transaction_validated', {
    p_transaction_id: transactionId,
    p_user_id: user.id,
    p_account_id: accountId,
    p_category_id: categoryId,
    p_date: transactionDate.toISOString(),
    p_amount: amount,
    p_currency: currency.toUpperCase(),
    p_description: description,
    p_type: type,
    p_status: status,
    p_transfer_id: transferId,
    p_linked_transaction_id: linkedTransactionId,
  });

  if (error) {
    // Parse Postgres error messages for user-friendly display
    const message = error.message || 'Failed to create transaction';
    throw new Error(message);
  }

  // Auto-create borrowing/lending record if category matches
  try {
    await autoCreateBorrowingLending(data, user.id);
  } catch (err) {
    // Log error but don't fail transaction creation
    console.error('Failed to create borrowing/lending record:', err);
  }

  return data;
}

// Auto-create borrowing/lending record
async function autoCreateBorrowingLending(transaction, userId) {
  // Get settings
  const settings = await settingsApi.getSettings();
  const borrowingCategoryId = settings.find(
    (s) => s.setting_key === 'BorrowingCategoryID'
  )?.setting_value;
  const lendingCategoryId = settings.find(
    (s) => s.setting_key === 'LendingCategoryID'
  )?.setting_value;

  // Check if transaction category matches borrowing or lending category
  // Handle empty strings and null values
  const hasBorrowingCategory =
    borrowingCategoryId && borrowingCategoryId.trim() !== '';
  const hasLendingCategory =
    lendingCategoryId && lendingCategoryId.trim() !== '';

  if (!hasBorrowingCategory && !hasLendingCategory) {
    return; // No categories configured
  }

  // Skip if transaction has no category
  if (!transaction.category_id) {
    return;
  }

  let recordType = null;
  // Compare category IDs (both should be strings)
  const transactionCategoryId = String(transaction.category_id);

  if (
    hasBorrowingCategory &&
    transactionCategoryId === String(borrowingCategoryId)
  ) {
    recordType = 'Borrowing';
  } else if (
    hasLendingCategory &&
    transactionCategoryId === String(lendingCategoryId)
  ) {
    recordType = 'Lending';
  }

  if (!recordType) {
    return; // Category doesn't match
  }

  // Parse entity name from description
  const { entityName, notes } = parseEntityName(transaction.description);

  // Create borrowing/lending record
  const { createBorrowingLendingRecord } = await import('./borrowingsLendings');
  await createBorrowingLendingRecord({
    type: recordType,
    originalTransactionId: transaction.transaction_id,
    entityName,
    originalAmount: Math.abs(transaction.amount),
    currency: transaction.currency,
    notes,
  });
}

// Batch create transactions
export async function batchCreateTransactions(transactionsArray) {
  const user = await getCurrentUser();
  if (!user) throw new Error('User not authenticated');

  if (!Array.isArray(transactionsArray) || transactionsArray.length === 0) {
    throw new Error('Transactions array is required');
  }
  if (transactionsArray.length > 1000) {
    throw new Error('Maximum 1000 transactions per batch');
  }

  // Pre-validate all transactions
  const validationErrors = [];
  const accountsMap = new Map();
  const categoriesMap = new Map();

  // Get all unique account and category IDs
  const accountIds = [...new Set(transactionsArray.map((t) => t.accountId))];
  const categoryIds = [...new Set(transactionsArray.map((t) => t.categoryId))];

  // Fetch accounts
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'Active')
    .in('account_id', accountIds);

  accounts?.forEach((acc) => accountsMap.set(acc.account_id, acc));

  // Fetch categories
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'Active')
    .in('category_id', categoryIds);

  categories?.forEach((cat) => categoriesMap.set(cat.category_id, cat));

  // Validate each transaction
  transactionsArray.forEach((txn, index) => {
    const errors = [];
    if (
      !txn.accountId ||
      !txn.categoryId ||
      txn.amount === undefined ||
      !txn.currency
    ) {
      errors.push('Missing required fields');
    }
    const account = accountsMap.get(txn.accountId);
    if (!account) {
      errors.push(`Account ${txn.accountId} not found or inactive`);
    } else if (txn.currency.toUpperCase() !== account.currency) {
      errors.push(`Currency mismatch: account uses ${account.currency}`);
    }
    if (!categoriesMap.get(txn.categoryId)) {
      errors.push(`Category ${txn.categoryId} not found or inactive`);
    }
    if (txn.currency && txn.currency.length !== 3) {
      errors.push('Currency must be 3-letter ISO code');
    }
    if (txn.type && !TRANSACTION_TYPES.includes(txn.type)) {
      errors.push(`Invalid type: ${txn.type}`);
    }
    if (txn.status && !TRANSACTION_STATUSES.includes(txn.status)) {
      errors.push(`Invalid status: ${txn.status}`);
    }

    if (errors.length > 0) {
      validationErrors.push({
        index,
        transaction: txn,
        errors,
      });
    }
  });

  if (validationErrors.length > 0) {
    throw new Error(
      `Validation failed for ${validationErrors.length} transaction(s)`,
      {
        cause: validationErrors,
      }
    );
  }

  // Prepare transactions for insert
  const now = new Date();
  const transactionsToInsert = transactionsArray.map((txn) => {
    let txnDate;
    if (txn.date) {
      const parsedDate = new Date(txn.date);
      // Check if it's a date-only string (YYYY-MM-DD format without time)
      if (typeof txn.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(txn.date)) {
        // Date-only string: add current time
        parsedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      }
      txnDate = parsedDate;
    } else {
      txnDate = now;
    }
    return {
      transaction_id: generateId('TXN'),
      user_id: user.id,
      account_id: txn.accountId,
      category_id: txn.categoryId,
      date: txnDate.toISOString(),
      amount: txn.amount,
      currency: txn.currency.toUpperCase(),
      description: txn.description || '',
      type: txn.type || 'Expense',
      status: txn.status || 'Cleared',
      transfer_id: txn.transferId || null,
      linked_transaction_id: txn.linkedTransactionId || null,
      created_at: now.toISOString(),
    };
  });

  // Insert all transactions
  const { data, error } = await supabase
    .from('transactions')
    .insert(transactionsToInsert)
    .select();

  if (error) throw error;

  // Auto-create borrowing/lending records (non-blocking)
  for (const transaction of data) {
    try {
      await autoCreateBorrowingLending(transaction, user.id);
    } catch (err) {
      console.error('Failed to create borrowing/lending record:', err);
    }
  }

  return data;
}

// Get transactions
export async function getTransactions(filters = {}) {
  const user = await getCurrentUser();
  if (!user) throw new Error('User not authenticated');

  let query = supabase.from('transactions').select('*').eq('user_id', user.id);

  // For incremental sync, include deleted transactions that were updated since last sync
  // For full sync, only include active transactions
  if (filters.since) {
    // Incremental sync: include both active and recently deleted transactions
    // Active transactions: deleted_at IS NULL AND (updated_at >= since OR created_at >= since)
    // Deleted transactions: deleted_at IS NOT NULL AND updated_at >= since
    query = query.or(
      `and(deleted_at.is.null,or(updated_at.gte.${filters.since},created_at.gte.${filters.since})),and(deleted_at.not.is.null,updated_at.gte.${filters.since})`
    );
  } else {
    // Full sync: only include active transactions
    query = query.is('deleted_at', null);
  }

  if (filters.accountId) {
    query = query.eq('account_id', filters.accountId);
  }
  if (filters.categoryId) {
    query = query.eq('category_id', filters.categoryId);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.type) {
    query = query.eq('type', filters.type);
  }
  if (filters.startDate) {
    query = query.gte('date', filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte('date', filters.endDate);
  }
  if (filters.month) {
    // Filter by month (YYYY-MM format)
    const startDate = `${filters.month}-01`;
    const endDate = new Date(
      new Date(startDate).setMonth(new Date(startDate).getMonth() + 1)
    )
      .toISOString()
      .split('T')[0];
    query = query.gte('date', startDate).lt('date', endDate);
  }

  // If explicit pagination is requested, use single query with limit/offset
  if (filters.limit || filters.offset) {
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.range(
        filters.offset,
        filters.offset + (filters.limit || 100) - 1
      );
    }

    // Order by date descending, then by created_at descending (newest first)
    const { data, error } = await query
      .order('date', { ascending: false })
      .order('created_at', { ascending: false, nullsFirst: false });

    if (error) throw error;
    return data || [];
  }

  // No explicit pagination: fetch ALL records by paginating in batches of 1000
  // This overcomes Supabase's default 1000 row limit
  const BATCH_SIZE = 1000;
  let allData = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await query
      .order('date', { ascending: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      allData = [...allData, ...data];
    }

    hasMore = data && data.length === BATCH_SIZE;
    offset += BATCH_SIZE;
  }

  return allData;
}

// Get transaction by ID
export async function getTransactionById(transactionId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('transaction_id', transactionId)
    .eq('user_id', user.id)
    .is('deleted_at', null);

  if (error) throw error;

  // Return null if no transaction found, otherwise return the first (and should be only) transaction
  if (!data || data.length === 0) {
    return null;
  }

  return data[0];
}

// Update transaction
export async function updateTransaction(transactionId, updates) {
  const user = await getCurrentUser();
  if (!user) throw new Error('User not authenticated');

  // Check if transaction exists
  const transaction = await getTransactionById(transactionId);
  if (!transaction) {
    throw new Error('Transaction not found');
  }

  // Validation
  if (updates.type && !TRANSACTION_TYPES.includes(updates.type)) {
    throw new Error(
      `Invalid transaction type. Must be one of: ${TRANSACTION_TYPES.join(
        ', '
      )}`
    );
  }
  if (updates.status && !TRANSACTION_STATUSES.includes(updates.status)) {
    throw new Error(
      `Invalid status. Must be one of: ${TRANSACTION_STATUSES.join(', ')}`
    );
  }

  // If updating account or currency, validate
  if (updates.accountId || updates.currency) {
    const accountId = updates.accountId || transaction.account_id;
    const currency = updates.currency || transaction.currency;

    const { data: account } = await supabase
      .from('accounts')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .eq('status', 'Active')
      .single();

    if (!account) {
      throw new Error('Account not found or is not active');
    }

    if (currency.toUpperCase() !== account.currency) {
      throw new Error(
        `Currency must match account currency: ${account.currency}`
      );
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
      .single();

    if (!category) {
      throw new Error('Category not found or is not active');
    }
  }

  const updateData = {};
  if (updates.accountId !== undefined)
    updateData.account_id = updates.accountId;
  if (updates.categoryId !== undefined)
    updateData.category_id = updates.categoryId;
  if (updates.date !== undefined) {
    const parsedDate = new Date(updates.date);
    // Check if it's a date-only string (YYYY-MM-DD format without time)
    if (typeof updates.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(updates.date)) {
      // Date-only string: preserve the time from the original transaction
      const originalDate = new Date(transaction.date);
      parsedDate.setHours(
        originalDate.getHours(),
        originalDate.getMinutes(),
        originalDate.getSeconds(),
        originalDate.getMilliseconds()
      );
    }
    updateData.date = parsedDate.toISOString();
  }
  if (updates.amount !== undefined) updateData.amount = updates.amount;
  if (updates.currency !== undefined)
    updateData.currency = updates.currency.toUpperCase();
  if (updates.description !== undefined)
    updateData.description = updates.description;
  if (updates.type !== undefined) updateData.type = updates.type;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.linkedTransactionId !== undefined)
    updateData.linked_transaction_id = updates.linkedTransactionId;

  // If no fields to update, return the existing transaction
  if (Object.keys(updateData).length === 0) {
    return transaction;
  }

  const { data, error } = await supabase
    .from('transactions')
    .update(updateData)
    .eq('transaction_id', transactionId)
    .eq('user_id', user.id)
    .select('*');

  if (error) throw error;

  if (!data || data.length === 0) {
    throw new Error('Transaction not found or could not be updated');
  }

  if (data.length > 1) {
    // This shouldn't happen, but handle it just in case
    return data[0];
  }

  return data[0];
}

// Soft delete transaction
export async function deleteTransaction(transactionId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('User not authenticated');

  // Check if transaction is part of a transfer
  const transaction = await getTransactionById(transactionId);
  if (!transaction) {
    throw new Error('Transaction not found');
  }

  // Track all transaction IDs that will be deleted
  const deletedTransactionIds = [transactionId];
  let linkedTransactionId = null;

  // If part of transfer, delete both transactions
  if (transaction.transfer_id || transaction.linked_transaction_id) {
    const transferId = transaction.transfer_id;
    const linkedId = transaction.linked_transaction_id;

    // Delete both transactions
    const { error: error1 } = await supabase
      .from('transactions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('transaction_id', transactionId)
      .eq('user_id', user.id);

    if (error1) throw error1;

    // Delete linked transaction if exists
    if (linkedId) {
      const { error: error2 } = await supabase
        .from('transactions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('transaction_id', linkedId)
        .eq('user_id', user.id);

      if (error2) throw error2;
      deletedTransactionIds.push(linkedId);
      linkedTransactionId = linkedId;
    }

    // Delete other transaction with same transfer_id
    if (transferId) {
      // Get the other transaction ID first
      const { data: otherTransaction } = await supabase
        .from('transactions')
        .select('transaction_id')
        .eq('transfer_id', transferId)
        .eq('user_id', user.id)
        .neq('transaction_id', transactionId)
        .is('deleted_at', null)
        .single();

      if (otherTransaction) {
        const { error: error3 } = await supabase
          .from('transactions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('transfer_id', transferId)
          .eq('user_id', user.id)
          .neq('transaction_id', transactionId);

        if (error3) throw error3;
        if (!deletedTransactionIds.includes(otherTransaction.transaction_id)) {
          deletedTransactionIds.push(otherTransaction.transaction_id);
        }
      }
    }
  } else {
    // Regular transaction, just soft delete
    const { error } = await supabase
      .from('transactions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('transaction_id', transactionId)
      .eq('user_id', user.id);

    if (error) throw error;
  }

  // Return deleted transaction IDs
  return {
    transactionId,
    linkedTransactionId,
    deletedTransactionIds,
  };
}

// Bulk soft delete transactions
export async function bulkDeleteTransactions(transactionIds) {
  const user = await getCurrentUser();
  if (!user) throw new Error('User not authenticated');

  if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
    throw new Error('Transaction IDs array is required');
  }

  if (transactionIds.length > 100) {
    throw new Error('Maximum 100 transactions can be deleted at once');
  }

  // Get all transactions to validate and find linked ones
  const { data: transactions, error: fetchError } = await supabase
    .from('transactions')
    .select('*')
    .in('transaction_id', transactionIds)
    .eq('user_id', user.id)
    .is('deleted_at', null);

  if (fetchError) throw fetchError;

  if (!transactions || transactions.length === 0) {
    throw new Error('No valid transactions found to delete');
  }

  // Track all transaction IDs that will be deleted (including linked ones)
  const allTransactionIdsToDelete = new Set(transactionIds);

  // Find all linked transactions (transfers)
  for (const transaction of transactions) {
    if (transaction.transfer_id) {
      // Get all transactions with this transfer_id
      const { data: linkedTransactions } = await supabase
        .from('transactions')
        .select('transaction_id')
        .eq('transfer_id', transaction.transfer_id)
        .eq('user_id', user.id)
        .is('deleted_at', null);

      if (linkedTransactions) {
        linkedTransactions.forEach((t) => {
          allTransactionIdsToDelete.add(t.transaction_id);
        });
      }
    }

    if (transaction.linked_transaction_id) {
      allTransactionIdsToDelete.add(transaction.linked_transaction_id);
    }
  }

  const idsToDelete = Array.from(allTransactionIdsToDelete);

  // Soft delete all transactions in a single operation
  const { error: deleteError } = await supabase
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .in('transaction_id', idsToDelete)
    .eq('user_id', user.id)
    .is('deleted_at', null);

  if (deleteError) throw deleteError;

  // Return deleted transaction IDs
  return {
    deletedTransactionIds: idsToDelete,
    requestedTransactionIds: transactionIds,
  };
}
