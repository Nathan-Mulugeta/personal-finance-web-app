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

/**
 * Find the latest exchange rate for a currency pair
 * @param {Array} rates - Array of matching exchange rate objects
 * @returns {Object|null} - The latest rate or null if none found
 */
function findLatestRate(rates) {
  if (!rates || rates.length === 0) return null
  if (rates.length === 1) return rates[0]
  
  // Sort by date descending and return the latest
  return rates.reduce((latest, current) => {
    if (!latest) return current
    const latestDate = new Date(latest.date || latest.created_at || 0)
    const currentDate = new Date(current.date || current.created_at || 0)
    return currentDate > latestDate ? current : latest
  }, null)
}

/**
 * Convert amount between currencies using exchange rates array
 * @param {number} amount - Amount to convert
 * @param {string} fromCurrency - Source currency code
 * @param {string} toCurrency - Target currency code
 * @param {Array} exchangeRates - Array of exchange rate objects
 * @returns {number|null} - Converted amount or null if no rate found
 */
export function convertAmountWithExchangeRates(amount, fromCurrency, toCurrency, exchangeRates) {
  if (!amount || !fromCurrency || !toCurrency) {
    return null
  }

  // If same currency, return amount as-is
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
    return amount
  }

  if (!exchangeRates || exchangeRates.length === 0) {
    return null
  }

  // Find all direct rates (fromCurrency -> toCurrency) and get the latest
  const directRates = exchangeRates.filter(
    (er) =>
      er.from_currency === fromCurrency.toUpperCase() &&
      er.to_currency === toCurrency.toUpperCase()
  )
  const directRate = findLatestRate(directRates)

  if (directRate) {
    return amount * directRate.rate
  }

  // Find all reverse rates (toCurrency -> fromCurrency) and get the latest
  const reverseRates = exchangeRates.filter(
    (er) =>
      er.from_currency === toCurrency.toUpperCase() &&
      er.to_currency === fromCurrency.toUpperCase()
  )
  const reverseRate = findLatestRate(reverseRates)

  if (reverseRate) {
    return amount / reverseRate.rate
  }

  // No rate found
  return null
}

