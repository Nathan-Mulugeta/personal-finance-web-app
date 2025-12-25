import { supabase, generateId, getCurrentUser } from '../supabase'

// Account types enum
export const ACCOUNT_TYPES = ['Checking', 'Savings', 'Credit', 'Investment', 'Cash', 'Bank']
export const ACCOUNT_STATUSES = ['Active', 'Closed', 'Suspended']

// Create account
export async function createAccount(accountData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const { name, type, currency, openingBalance = 0, status = 'Active' } = accountData

  // Validation
  if (!name || !type || !currency) {
    throw new Error('Name, type, and currency are required')
  }
  if (!ACCOUNT_TYPES.includes(type)) {
    throw new Error(`Invalid account type. Must be one of: ${ACCOUNT_TYPES.join(', ')}`)
  }
  if (!ACCOUNT_STATUSES.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${ACCOUNT_STATUSES.join(', ')}`)
  }
  if (currency.length !== 3) {
    throw new Error('Currency must be a 3-letter ISO code')
  }

  const accountId = generateId('ACC')
  const { data, error } = await supabase
    .from('accounts')
    .insert({
      account_id: accountId,
      user_id: user.id,
      name,
      type,
      currency: currency.toUpperCase(),
      opening_balance: openingBalance,
      status,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// Get all accounts
export async function getAccounts(filters = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  let query = supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)

  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.type) {
    query = query.eq('type', filters.type)
  }
  if (filters.currency) {
    query = query.eq('currency', filters.currency)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

// Get account by ID
export async function getAccountById(accountId) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('account_id', accountId)
    .eq('user_id', user.id)
    .single()

  if (error) throw error
  return data
}

// Update account
export async function updateAccount(accountId, updates) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  // Check if account exists and belongs to user
  const account = await getAccountById(accountId)
  if (!account) {
    throw new Error('Account not found')
  }

  // Validation
  if (updates.type && !ACCOUNT_TYPES.includes(updates.type)) {
    throw new Error(`Invalid account type. Must be one of: ${ACCOUNT_TYPES.join(', ')}`)
  }
  if (updates.status && !ACCOUNT_STATUSES.includes(updates.status)) {
    throw new Error(`Invalid status. Must be one of: ${ACCOUNT_STATUSES.join(', ')}`)
  }
  if (updates.currency && updates.currency.length !== 3) {
    throw new Error('Currency must be a 3-letter ISO code')
  }

  // Check if currency change is allowed (no transactions)
  if (updates.currency && updates.currency !== account.currency) {
    const { data: transactions } = await supabase
      .from('transactions')
      .select('transaction_id')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .limit(1)

    if (transactions && transactions.length > 0) {
      throw new Error('Cannot change currency for account with existing transactions')
    }
  }

  // Check if opening balance change is allowed (no transactions)
  if (updates.openingBalance !== undefined && updates.openingBalance !== account.opening_balance) {
    const { data: transactions } = await supabase
      .from('transactions')
      .select('transaction_id')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .limit(1)

    if (transactions && transactions.length > 0) {
      throw new Error('Cannot change opening balance for account with existing transactions')
    }
  }

  const updateData = {}
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.type !== undefined) updateData.type = updates.type
  if (updates.currency !== undefined) updateData.currency = updates.currency.toUpperCase()
  if (updates.openingBalance !== undefined) updateData.opening_balance = updates.openingBalance
  if (updates.status !== undefined) updateData.status = updates.status

  const { data, error } = await supabase
    .from('accounts')
    .update(updateData)
    .eq('account_id', accountId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Delete account
export async function deleteAccount(accountId) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  // Check if account has transactions
  const { data: transactions } = await supabase
    .from('transactions')
    .select('transaction_id')
    .eq('account_id', accountId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .limit(1)

  if (transactions && transactions.length > 0) {
    throw new Error('Cannot delete account with existing transactions')
  }

  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('account_id', accountId)
    .eq('user_id', user.id)

  if (error) throw error
}

// Get account balance
export async function getAccountBalance(accountId) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  // Get account
  const account = await getAccountById(accountId)
  if (!account) {
    throw new Error('Account not found')
  }

  // Calculate balance using database function
  const { data, error } = await supabase.rpc('calculate_account_balance', {
    p_account_id: accountId,
    p_user_id: user.id,
  })

  if (error) throw error

  return {
    account_id: account.account_id,
    name: account.name,
    opening_balance: account.opening_balance,
    current_balance: data || 0,
    currency: account.currency,
    last_updated: new Date().toISOString(),
  }
}

