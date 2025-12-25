import { supabase, getCurrentUser } from '../supabase'
import * as accountsApi from './accounts'
import * as exchangeRatesApi from './exchangeRates'
import * as settingsApi from './settings'
import * as budgetsApi from './budgets'
import * as categoriesApi from './categories'

// Get all account balances
export async function getAllAccountBalances(filters = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  // Get base currency from settings
  const settings = await settingsApi.getSettings()
  const baseCurrency = filters.baseCurrency || 
    settings.find(s => s.setting_key === 'BaseCurrency')?.setting_value || 
    'USD'

  // Get all accounts
  const accounts = await accountsApi.getAccounts({ status: 'Active' })

  // Calculate balances and convert to base currency
  const accountBalances = await Promise.all(
    accounts.map(async account => {
      const balance = await accountsApi.getAccountBalance(account.account_id)
      
      let convertedBalance = null
      let conversionError = null
      let exchangeRate = null

      if (balance.currency === baseCurrency) {
        convertedBalance = balance.current_balance
        exchangeRate = 1
      } else {
        try {
          const conversion = await exchangeRatesApi.convertCurrency(
            balance.current_balance,
            balance.currency,
            baseCurrency
          )
          convertedBalance = conversion.convertedAmount
          exchangeRate = conversion.rate
        } catch (err) {
          conversionError = `No exchange rate found for ${balance.currency} to ${baseCurrency}`
        }
      }

      return {
        ...balance,
        convertedBalance,
        exchangeRate,
        conversionError,
      }
    })
  )

  // Calculate total
  const totalBalance = accountBalances.reduce((sum, acc) => {
    return sum + (acc.convertedBalance || 0)
  }, 0)

  return {
    totalBalance,
    baseCurrency,
    accounts: accountBalances,
  }
}

// Get budget report
export async function getBudgetReport(month, filters = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  if (!month) {
    throw new Error('Month is required (YYYY-MM format)')
  }

  // Get base currency from settings
  const settings = await settingsApi.getSettings()
  const baseCurrency = filters.baseCurrency || 
    settings.find(s => s.setting_key === 'BaseCurrency')?.setting_value || 
    'USD'

  // Build category tree
  const categoryTree = await categoriesApi.buildCategoryTree({ status: 'Active' })

  // Get all budgets for the month
  const budgets = await budgetsApi.getBudgets({ month, status: 'Active' })

  // Get all transactions for the month
  const transactions = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'Cleared')
    .is('deleted_at', null)
    .gte('date', `${month}-01`)
    .lt('date', new Date(new Date(`${month}-01`).setMonth(new Date(`${month}-01`).getMonth() + 1))
      .toISOString()
      .split('T')[0])

  const { data: transactionsData } = await transactions

  // Build report tree
  const buildReportNode = async (category) => {
    // Get effective budget
    const effectiveBudget = await budgetsApi.getEffectiveBudget(category.category_id, month)

    // Calculate spending for this category
    const categoryTransactions = (transactionsData || []).filter(
      txn => txn.category_id === category.category_id
    )

    let spending = 0
    for (const txn of categoryTransactions) {
      if (txn.type === 'Expense') {
        spending += parseFloat(txn.amount)
      } else if (txn.type === 'Income') {
        spending -= parseFloat(txn.amount)
      }

      // Convert to base currency if needed
      if (txn.currency !== baseCurrency) {
        try {
          const conversion = await exchangeRatesApi.convertCurrency(
            spending,
            txn.currency,
            baseCurrency
          )
          spending = conversion.convertedAmount
        } catch (err) {
          // Handle conversion error
        }
      }
    }

    // Process children
    const children = await Promise.all(
      (category.children || []).map(child => buildReportNode(child))
    )

    // Calculate children totals
    const childrenBudget = children.reduce((sum, child) => sum + (child.budget || 0), 0)
    const childrenSpending = children.reduce((sum, child) => sum + (child.spending || 0), 0)

    // Final budget: max of own or sum of children, or own if both exist
    let finalBudget = effectiveBudget
    if (effectiveBudget > 0 && childrenBudget > 0) {
      finalBudget = Math.max(effectiveBudget, childrenBudget)
    } else if (effectiveBudget === 0 && childrenBudget > 0) {
      finalBudget = childrenBudget
    }

    // Final spending: own + children
    const finalSpending = spending + childrenSpending

    // Only include if has budget or spending
    if (finalBudget === 0 && finalSpending === 0) {
      return null
    }

    return {
      categoryId: category.category_id,
      categoryName: category.name,
      categoryType: category.type,
      budget: finalBudget,
      spending: finalSpending,
      difference: finalBudget - finalSpending,
      children: children.filter(Boolean),
    }
  }

  // Build report for each root category
  const reportTree = await Promise.all(
    categoryTree.map(category => buildReportNode(category))
  )

  // Calculate totals
  const totalBudget = reportTree.reduce((sum, node) => sum + (node?.budget || 0), 0)
  const totalSpending = reportTree.reduce((sum, node) => sum + (node?.spending || 0), 0)

  return {
    month,
    baseCurrency,
    totalBudget,
    totalSpending,
    totalDifference: totalBudget - totalSpending,
    categories: reportTree.filter(Boolean),
  }
}

// Get category spending report
export async function getCategorySpendingReport(filters = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const month = filters.month
  if (!month) {
    throw new Error('Month is required (YYYY-MM format)')
  }

  // Get base currency
  const settings = await settingsApi.getSettings()
  const baseCurrency = filters.baseCurrency || 
    settings.find(s => s.setting_key === 'BaseCurrency')?.setting_value || 
    'USD'

  // Get transactions for the month
  const transactions = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'Cleared')
    .is('deleted_at', null)
    .gte('date', `${month}-01`)
    .lt('date', new Date(new Date(`${month}-01`).setMonth(new Date(`${month}-01`).getMonth() + 1))
      .toISOString()
      .split('T')[0])

  const { data: transactionsData } = await transactions

  // Get all categories
  const categories = await categoriesApi.getCategories({ status: 'Active' })
  const categoryMap = new Map(categories.map(cat => [cat.category_id, cat]))

  // Calculate spending by category
  const spendingByCategory = new Map()

  for (const txn of transactionsData || []) {
    if (!spendingByCategory.has(txn.category_id)) {
      spendingByCategory.set(txn.category_id, {
        categoryId: txn.category_id,
        categoryName: categoryMap.get(txn.category_id)?.name || 'Unknown',
        spending: 0,
        transactionCount: 0,
      })
    }

    const categorySpending = spendingByCategory.get(txn.category_id)
    let amount = parseFloat(txn.amount)

    if (txn.type === 'Expense') {
      categorySpending.spending += amount
    } else if (txn.type === 'Income') {
      categorySpending.spending -= amount
    }

    // Convert to base currency if needed
    if (txn.currency !== baseCurrency) {
      try {
        const conversion = await exchangeRatesApi.convertCurrency(
          categorySpending.spending,
          txn.currency,
          baseCurrency
        )
        categorySpending.spending = conversion.convertedAmount
      } catch (err) {
        // Handle conversion error
      }
    }

    categorySpending.transactionCount += 1
  }

  // Roll up to parent categories
  const rollUpSpending = (categoryId) => {
    const category = categoryMap.get(categoryId)
    if (!category) return 0

    let totalSpending = spendingByCategory.get(categoryId)?.spending || 0

    // Add children spending
    const children = categories.filter(cat => cat.parent_category_id === categoryId)
    children.forEach(child => {
      totalSpending += rollUpSpending(child.category_id)
    })

    return totalSpending
  }

  // Build final report
  const report = Array.from(spendingByCategory.values()).map(item => {
    const category = categoryMap.get(item.categoryId)
    const totalSpending = rollUpSpending(item.categoryId)

    return {
      ...item,
      totalSpending,
      parentCategoryId: category?.parent_category_id,
    }
  })

  return {
    month,
    baseCurrency,
    categories: report,
    totalSpending: report.reduce((sum, item) => sum + item.totalSpending, 0),
  }
}

