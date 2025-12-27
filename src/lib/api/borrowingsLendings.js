import { supabase, generateId, getCurrentUser } from '../supabase'
import * as transactionsApi from './transactions'

// Borrowing/Lending types enum
export const BORROWING_LENDING_TYPES = ['Borrowing', 'Lending']
export const BORROWING_LENDING_STATUSES = ['Active', 'FullyPaid', 'Cancelled']

// Create borrowing/lending record
export async function createBorrowingLendingRecord(recordData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const {
    type,
    originalTransactionId,
    entityName,
    originalAmount,
    currency,
    notes = '',
  } = recordData

  // Validation
  if (!type || !originalTransactionId || !entityName || originalAmount === undefined || !currency) {
    throw new Error('Type, original transaction ID, entity name, original amount, and currency are required')
  }
  if (!BORROWING_LENDING_TYPES.includes(type)) {
    throw new Error(`Invalid type. Must be one of: ${BORROWING_LENDING_TYPES.join(', ')}`)
  }
  if (currency.length !== 3) {
    throw new Error('Currency must be a 3-letter ISO code')
  }

  // Verify transaction exists
  const transaction = await transactionsApi.getTransactionById(originalTransactionId)
  if (!transaction) {
    throw new Error('Original transaction not found')
  }

  const recordId = generateId('BL')
  const { data, error } = await supabase
    .from('borrowings_lendings')
    .insert({
      record_id: recordId,
      user_id: user.id,
      type,
      original_transaction_id: originalTransactionId,
      entity_name: entityName,
      original_amount: Math.abs(originalAmount),
      currency: currency.toUpperCase(),
      paid_amount: 0,
      remaining_amount: Math.abs(originalAmount),
      status: 'Active',
      notes,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// Get borrowing/lending records
export async function getBorrowingLendingRecords(filters = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  let query = supabase
    .from('borrowings_lendings')
    .select('*')
    .eq('user_id', user.id)

  if (filters.type) {
    query = query.eq('type', filters.type)
  }
  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.currency) {
    query = query.eq('currency', filters.currency.toUpperCase())
  }
  if (filters.entityName) {
    query = query.ilike('entity_name', `%${filters.entityName}%`)
  }

  // Incremental sync: fetch records updated or created since last sync
  if (filters.since) {
    query = query.or(`updated_at.gte.${filters.since},created_at.gte.${filters.since}`)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

// Get borrowing/lending record by ID
export async function getBorrowingLendingRecordById(recordId) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('borrowings_lendings')
    .select('*')
    .eq('record_id', recordId)
    .eq('user_id', user.id)
    .single()

  if (error) throw error
  return data
}

// Update borrowing/lending record
export async function updateBorrowingLendingRecord(recordId, updates) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  // Check if record exists
  const record = await getBorrowingLendingRecordById(recordId)
  if (!record) {
    throw new Error('Record not found')
  }

  // Validation
  if (updates.type && !BORROWING_LENDING_TYPES.includes(updates.type)) {
    throw new Error(`Invalid type. Must be one of: ${BORROWING_LENDING_TYPES.join(', ')}`)
  }
  if (updates.status && !BORROWING_LENDING_STATUSES.includes(updates.status)) {
    throw new Error(`Invalid status. Must be one of: ${BORROWING_LENDING_STATUSES.join(', ')}`)
  }

  const updateData = {}
  if (updates.entityName !== undefined) updateData.entity_name = updates.entityName
  if (updates.notes !== undefined) updateData.notes = updates.notes
  if (updates.status !== undefined) updateData.status = updates.status
  // Note: paid_amount and remaining_amount are updated via recordPayment

  const { data, error } = await supabase
    .from('borrowings_lendings')
    .update(updateData)
    .eq('record_id', recordId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Record payment
export async function recordPayment(recordId, paymentData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const { amount, notes = '' } = paymentData

  if (amount === undefined || amount <= 0) {
    throw new Error('Payment amount is required and must be positive')
  }

  // Get record
  const record = await getBorrowingLendingRecordById(recordId)
  if (!record) {
    throw new Error('Record not found')
  }

  if (record.status !== 'Active') {
    throw new Error('Can only record payments for active records')
  }

  // Get original transaction to get account and category
  const originalTransaction = await transactionsApi.getTransactionById(record.original_transaction_id)
  if (!originalTransaction) {
    throw new Error('Original transaction not found')
  }

  // Get settings to determine payment category
  const { getSettings } = await import('./settings')
  const settings = await getSettings()
  const borrowingPaymentCategoryId = settings.find(s => s.setting_key === 'BorrowingPaymentCategoryID')?.setting_value
  const lendingPaymentCategoryId = settings.find(s => s.setting_key === 'LendingPaymentCategoryID')?.setting_value

  // Determine category and type based on record type
  let paymentCategoryId = null
  let paymentType = 'Expense'

  if (record.type === 'Borrowing') {
    paymentCategoryId = borrowingPaymentCategoryId || originalTransaction.category_id
    paymentType = 'Expense' // Paying back borrowing is an expense
  } else if (record.type === 'Lending') {
    paymentCategoryId = lendingPaymentCategoryId || originalTransaction.category_id
    paymentType = 'Income' // Receiving payment for lending is income
  }

  // Create payment transaction
  const paymentTransaction = await transactionsApi.createTransaction({
    accountId: originalTransaction.account_id,
    categoryId: paymentCategoryId || null,
    amount: record.type === 'Borrowing' ? -Math.abs(amount) : Math.abs(amount), // Negative for borrowing payment, positive for lending payment
    currency: record.currency,
    description: `Payment for ${record.type.toLowerCase()} to ${record.entity_name}${notes ? `: ${notes}` : ''}`,
    type: paymentType,
    status: 'Cleared',
  })

  // Update record
  const newPaidAmount = parseFloat(record.paid_amount) + Math.abs(amount)
  const newRemainingAmount = parseFloat(record.original_amount) - newPaidAmount

  // Update payment transaction IDs
  const existingPaymentIds = record.payment_transaction_ids
    ? record.payment_transaction_ids.split(',').filter(Boolean)
    : []
  const updatedPaymentIds = [...existingPaymentIds, paymentTransaction.transaction_id].join(',')

  const updateData = {
    paid_amount: newPaidAmount,
    remaining_amount: newRemainingAmount,
    payment_transaction_ids: updatedPaymentIds,
  }

  // Auto-update status if fully paid
  if (newRemainingAmount <= 0) {
    updateData.status = 'FullyPaid'
  }

  const { data, error } = await supabase
    .from('borrowings_lendings')
    .update(updateData)
    .eq('record_id', recordId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) throw error
  return { record: data, paymentTransaction }
}

// Mark as fully paid
export async function markAsFullyPaid(recordId) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  // Get record
  const record = await getBorrowingLendingRecordById(recordId)
  if (!record) {
    throw new Error('Record not found')
  }

  if (record.status !== 'Active') {
    throw new Error('Can only mark active records as fully paid')
  }

  const remainingAmount = parseFloat(record.remaining_amount)

  if (remainingAmount <= 0) {
    throw new Error('Record is already fully paid')
  }

  // Create final payment transaction
  await recordPayment(recordId, {
    amount: remainingAmount,
    notes: 'Final payment - marking as fully paid',
  })

  // Status will be updated automatically by recordPayment
  return await getBorrowingLendingRecordById(recordId)
}

// Delete borrowing/lending record
export async function deleteBorrowingLendingRecord(recordId) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const { error } = await supabase
    .from('borrowings_lendings')
    .delete()
    .eq('record_id', recordId)
    .eq('user_id', user.id)

  if (error) throw error
}

// Get summary
export async function getBorrowingLendingSummary(filters = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  let query = supabase
    .from('borrowings_lendings')
    .select('*')
    .eq('user_id', user.id)

  if (filters.type) {
    query = query.eq('type', filters.type)
  }
  if (filters.currency) {
    query = query.eq('currency', filters.currency.toUpperCase())
  }

  const { data, error } = await query

  if (error) throw error

  // Calculate totals
  const summary = {
    borrowing: {
      total: 0,
      paid: 0,
      remaining: 0,
      count: 0,
      byEntity: {},
    },
    lending: {
      total: 0,
      paid: 0,
      remaining: 0,
      count: 0,
      byEntity: {},
    },
    byCurrency: {},
  }

  data.forEach(record => {
    const type = record.type.toLowerCase()
    const currency = record.currency

    // Update type totals
    summary[type].total += parseFloat(record.original_amount)
    summary[type].paid += parseFloat(record.paid_amount)
    summary[type].remaining += parseFloat(record.remaining_amount)
    summary[type].count += 1

    // Update by entity
    if (!summary[type].byEntity[record.entity_name]) {
      summary[type].byEntity[record.entity_name] = {
        total: 0,
        paid: 0,
        remaining: 0,
        count: 0,
      }
    }
    summary[type].byEntity[record.entity_name].total += parseFloat(record.original_amount)
    summary[type].byEntity[record.entity_name].paid += parseFloat(record.paid_amount)
    summary[type].byEntity[record.entity_name].remaining += parseFloat(record.remaining_amount)
    summary[type].byEntity[record.entity_name].count += 1

    // Update by currency
    if (!summary.byCurrency[currency]) {
      summary.byCurrency[currency] = {
        borrowing: { total: 0, paid: 0, remaining: 0 },
        lending: { total: 0, paid: 0, remaining: 0 },
      }
    }
    summary.byCurrency[currency][type].total += parseFloat(record.original_amount)
    summary.byCurrency[currency][type].paid += parseFloat(record.paid_amount)
    summary.byCurrency[currency][type].remaining += parseFloat(record.remaining_amount)
  })

  return summary
}

