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

  // Look for direct rate (fromCurrency -> toCurrency)
  const directRate = exchangeRates.find(
    (er) =>
      er.from_currency === fromCurrency.toUpperCase() &&
      er.to_currency === toCurrency.toUpperCase()
  )

  if (directRate) {
    return amount * directRate.rate
  }

  // Look for reverse rate (toCurrency -> fromCurrency) and invert
  const reverseRate = exchangeRates.find(
    (er) =>
      er.from_currency === toCurrency.toUpperCase() &&
      er.to_currency === fromCurrency.toUpperCase()
  )

  if (reverseRate) {
    return amount / reverseRate.rate
  }

  // No rate found
  return null
}

