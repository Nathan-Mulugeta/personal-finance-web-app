import { supabase, generateId, getCurrentUser } from '../supabase'

// Budget statuses enum
export const BUDGET_STATUSES = ['Active', 'Archived']

// Create budget
export async function createBudget(budgetData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const {
    categoryId,
    currency,
    amount,
    month = null,
    recurring = false,
    startMonth = null,
    endMonth = null,
    notes = '',
    status = 'Active',
  } = budgetData

  // Validation
  if (!categoryId || !currency || amount === undefined) {
    throw new Error('Category ID, currency, and amount are required')
  }
  if (!BUDGET_STATUSES.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${BUDGET_STATUSES.join(', ')}`)
  }
  if (currency.length !== 3) {
    throw new Error('Currency must be a 3-letter ISO code')
  }

  // Validate recurring vs non-recurring
  if (!recurring && !month) {
    throw new Error('Month is required for non-recurring budgets')
  }
  if (recurring && !startMonth) {
    // Default to current month if not provided
    const now = new Date()
    startMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-06`
  }

  // Verify category exists
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

  // Format month dates (use 6th day to avoid timezone issues)
  let monthDate = null
  let startMonthDate = null
  let endMonthDate = null

  if (month) {
    const [year, monthNum] = month.split('-')
    monthDate = `${year}-${monthNum}-06`
  }

  if (startMonth) {
    const [year, monthNum] = startMonth.split('-')
    startMonthDate = `${year}-${monthNum}-06`
  }

  if (endMonth) {
    const [year, monthNum] = endMonth.split('-')
    endMonthDate = `${year}-${monthNum}-06`
  }

  const budgetId = generateId('BDG')
  const { data, error } = await supabase
    .from('budgets')
    .insert({
      budget_id: budgetId,
      user_id: user.id,
      category_id: categoryId,
      currency: currency.toUpperCase(),
      month: monthDate,
      amount,
      recurring,
      start_month: startMonthDate,
      end_month: endMonthDate,
      notes,
      status,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// Get budgets
export async function getBudgets(filters = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  let query = supabase
    .from('budgets')
    .select('*')
    .eq('user_id', user.id)

  if (filters.month) {
    // For month filter, include non-recurring budgets for that month
    // and recurring budgets that apply to that month
    const [year, monthNum] = filters.month.split('-')
    const monthDate = `${year}-${monthNum}-06`

    query = query.or(
      `and(recurring.eq.false,month.eq.${monthDate}),and(recurring.eq.true,start_month.lte.${monthDate},or(end_month.is.null,end_month.gte.${monthDate}))`
    )
  }
  if (filters.currency) {
    query = query.eq('currency', filters.currency)
  }
  if (filters.categoryId) {
    query = query.eq('category_id', filters.categoryId)
  }
  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.includeRecurring !== undefined) {
    if (!filters.includeRecurring) {
      query = query.eq('recurring', false)
    }
  }

  // Incremental sync: fetch records updated or created since last sync
  if (filters.since) {
    query = query.or(`updated_at.gte.${filters.since},created_at.gte.${filters.since}`)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

// Get budget by ID
export async function getBudgetById(budgetId) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('budget_id', budgetId)
    .eq('user_id', user.id)
    .single()

  if (error) throw error
  return data
}

// Update budget
export async function updateBudget(budgetId, updates) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  // Check if budget exists
  const budget = await getBudgetById(budgetId)
  if (!budget) {
    throw new Error('Budget not found')
  }

  // Validation
  if (updates.status && !BUDGET_STATUSES.includes(updates.status)) {
    throw new Error(`Invalid status. Must be one of: ${BUDGET_STATUSES.join(', ')}`)
  }

  const updateData = {}
  if (updates.categoryId !== undefined) updateData.category_id = updates.categoryId
  if (updates.currency !== undefined) updateData.currency = updates.currency.toUpperCase()
  if (updates.amount !== undefined) updateData.amount = updates.amount
  if (updates.notes !== undefined) updateData.notes = updates.notes
  if (updates.status !== undefined) updateData.status = updates.status

  // Handle month/startMonth/endMonth updates
  if (updates.month !== undefined) {
    if (updates.month) {
      const [year, monthNum] = updates.month.split('-')
      updateData.month = `${year}-${monthNum}-06`
    } else {
      updateData.month = null
    }
  }

  if (updates.startMonth !== undefined) {
    if (updates.startMonth) {
      const [year, monthNum] = updates.startMonth.split('-')
      updateData.start_month = `${year}-${monthNum}-06`
    } else {
      updateData.start_month = null
    }
  }

  if (updates.endMonth !== undefined) {
    if (updates.endMonth) {
      const [year, monthNum] = updates.endMonth.split('-')
      updateData.end_month = `${year}-${monthNum}-06`
    } else {
      updateData.end_month = null
    }
  }

  if (updates.recurring !== undefined) {
    updateData.recurring = updates.recurring
  }

  const { data, error } = await supabase
    .from('budgets')
    .update(updateData)
    .eq('budget_id', budgetId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Delete budget
export async function deleteBudget(budgetId) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const { error } = await supabase
    .from('budgets')
    .delete()
    .eq('budget_id', budgetId)
    .eq('user_id', user.id)

  if (error) throw error
}

// Get effective budget for a category and month (using database function)
export async function getEffectiveBudget(categoryId, month) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const [year, monthNum] = month.split('-')
  const monthDate = `${year}-${monthNum}-06`

  const { data, error } = await supabase.rpc('get_effective_budget', {
    p_category_id: categoryId,
    p_month: monthDate,
    p_user_id: user.id,
  })

  if (error) throw error
  return data || 0
}

