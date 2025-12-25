/**
 * Format currency amount
 */
export function formatCurrency(amount, currency = 'USD', locale = 'en-US') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
  }).format(amount)
}

/**
 * Convert amount between currencies using exchange rate
 */
export function convertAmount(amount, exchangeRate) {
  if (!exchangeRate || exchangeRate === 1) {
    return amount
  }
  return amount * exchangeRate
}

