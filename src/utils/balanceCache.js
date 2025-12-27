/**
 * Calculate currency totals from account balances
 * @param {Array} accounts - Array of account objects
 * @param {Object} balances - Map of account_id to balance objects
 * @returns {Object} Map of currency code to total balance
 */
export function calculateCurrencyTotals(accounts, balances) {
  const currencyTotals = {}
  
  accounts.forEach((account) => {
    const balance = balances[account.account_id]
    if (balance) {
      const currency = account.currency
      if (!currencyTotals[currency]) {
        currencyTotals[currency] = 0
      }
      currencyTotals[currency] += balance.current_balance || 0
    }
  })
  
  return currencyTotals
}

/**
 * Get exchange rate from cached rates
 * @param {Array} exchangeRates - Array of exchange rate objects
 * @param {string} fromCurrency - Source currency code
 * @param {string} toCurrency - Target currency code
 * @returns {Object|null} Exchange rate object or null if not found
 */
export function getCachedExchangeRate(exchangeRates, fromCurrency, toCurrency) {
  if (!exchangeRates || exchangeRates.length === 0) {
    return null
  }
  
  if (fromCurrency === toCurrency) {
    return {
      from_currency: fromCurrency,
      to_currency: toCurrency,
      rate: 1,
    }
  }
  
  // Try direct rate (fromCurrency -> toCurrency)
  const directRate = exchangeRates
    .filter(rate => 
      rate.from_currency === fromCurrency.toUpperCase() &&
      rate.to_currency === toCurrency.toUpperCase()
    )
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0]
  
  if (directRate) {
    return directRate
  }
  
  // Try reverse rate (toCurrency -> fromCurrency) and invert
  const reverseRate = exchangeRates
    .filter(rate =>
      rate.from_currency === toCurrency.toUpperCase() &&
      rate.to_currency === fromCurrency.toUpperCase()
    )
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0]
  
  if (reverseRate) {
    return {
      ...reverseRate,
      from_currency: fromCurrency.toUpperCase(),
      to_currency: toCurrency.toUpperCase(),
      rate: 1 / reverseRate.rate,
      from_amount: reverseRate.to_amount,
      to_amount: reverseRate.from_amount,
    }
  }
  
  return null
}

/**
 * Convert amount using cached exchange rates
 * @param {number} amount - Amount to convert
 * @param {string} fromCurrency - Source currency
 * @param {string} toCurrency - Target currency
 * @param {Array} exchangeRates - Array of exchange rate objects
 * @returns {Object|null} Conversion result or null if rate not found
 */
export function convertAmountWithCache(amount, fromCurrency, toCurrency, exchangeRates) {
  const rate = getCachedExchangeRate(exchangeRates, fromCurrency, toCurrency)
  
  if (!rate) {
    return null
  }
  
  return {
    originalAmount: amount,
    convertedAmount: amount * rate.rate,
    fromCurrency: rate.from_currency,
    toCurrency: rate.to_currency,
    rate: rate.rate,
    date: rate.date,
  }
}

/**
 * Calculate converted balances for all accounts
 * @param {Array} accounts - Array of account objects
 * @param {Object} balances - Map of account_id to balance objects
 * @param {string} baseCurrency - Base currency for conversion
 * @param {Array} exchangeRates - Array of exchange rate objects
 * @returns {Object} Map of account_id to balance object with convertedBalance
 */
export function calculateConvertedBalances(accounts, balances, baseCurrency, exchangeRates) {
  const convertedBalances = {}
  
  accounts.forEach((account) => {
    const balance = balances[account.account_id]
    if (!balance) return
    
    let convertedBalance = null
    let exchangeRate = null
    
    if (account.currency === baseCurrency) {
      convertedBalance = balance.current_balance
      exchangeRate = 1
    } else {
      const conversion = convertAmountWithCache(
        balance.current_balance,
        account.currency,
        baseCurrency,
        exchangeRates
      )
      
      if (conversion) {
        convertedBalance = conversion.convertedAmount
        exchangeRate = conversion.rate
      }
    }
    
    convertedBalances[account.account_id] = {
      ...balance,
      convertedBalance,
      exchangeRate,
    }
  })
  
  return convertedBalances
}



