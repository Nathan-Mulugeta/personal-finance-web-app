/**
 * Validate currency code (3-letter ISO)
 */
export function isValidCurrency(currency) {
  return typeof currency === 'string' && currency.length === 3 && /^[A-Z]{3}$/.test(currency.toUpperCase())
}

/**
 * Validate date format (YYYY-MM-DD)
 */
export function isValidDate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/
  if (!regex.test(dateString)) return false
  const date = new Date(dateString)
  return date instanceof Date && !isNaN(date)
}

/**
 * Validate month format (YYYY-MM)
 */
export function isValidMonth(monthString) {
  const regex = /^\d{4}-\d{2}$/
  if (!regex.test(monthString)) return false
  const [year, month] = monthString.split('-')
  const monthNum = parseInt(month, 10)
  return monthNum >= 1 && monthNum <= 12
}

/**
 * Normalize category name (trim and lowercase for comparison)
 */
export function normalizeCategoryName(name) {
  return name.trim().toLowerCase()
}

