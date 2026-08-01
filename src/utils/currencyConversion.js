/**
 * Short standalone label for a currency (not an amount) — birr shows as "Br"
 * to match how amounts are written; everything else keeps its ISO code. Use
 * for currency group headers/badges that sit alongside amounts.
 */
export function currencyLabel(currency) {
  return (currency || '').toUpperCase() === 'ETB' ? 'Br' : currency
}

/**
 * Break a money value into its editable number and its static currency text,
 * keeping the currency in its natural position: after for birr ("170.00" + " Br"),
 * before for symbol currencies ("$" + "170.00"). formatCurrency is built on
 * this split, so inline editing (which keeps the currency fixed and edits only
 * the number) can never disagree with how the display writes the amount.
 * Expects a non-negative amount; formatCurrency handles the sign.
 *
 * @returns {{ prefix: string, number: string, suffix: string }}
 */
export function splitMoney(amount, currency, locale = 'en-US') {
  const value = Number.isFinite(amount) ? amount : Number(amount) || 0
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
  const code = (currency || '').toUpperCase()
  if (code === 'ETB') return { prefix: '', number, suffix: ' Br' }
  if (!/^[A-Z]{3}$/.test(code)) {
    return { prefix: '', number, suffix: code ? ` ${code}` : '' }
  }
  let symbol = code
  try {
    symbol = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
      .format(0)
      .replace(/[\d\s]/g, '')
  } catch {
    // keep the code as a fallback
  }
  return { prefix: symbol, number, suffix: '' }
}

/**
 * Format an amount with its currency: "4,500.00 Br" for birr (symbol after),
 * each other currency in its own convention ("$1,200.00"), degrading to a plain
 * number for a missing/invalid code instead of crashing. Built ON splitMoney so
 * display and inline editing structurally cannot disagree about how a currency
 * is written.
 */
export function formatCurrency(amount, currency = 'USD', locale = 'en-US') {
  const value = Number.isFinite(amount) ? amount : Number(amount) || 0
  const { prefix, number, suffix } = splitMoney(
    Math.abs(value),
    currency,
    locale
  )
  return `${value < 0 ? '-' : ''}${prefix}${number}${suffix}`
}

/**
 * Build a per-currency total label for a list of transactions, mirroring the
 * Transactions page: sums outgoing money (Expense / Transfer Out) by currency,
 * falling back to incoming money for income-only lists. Returns '' when empty.
 */
export function getTransactionsTotalLabel(transactions) {
  const out = {};
  const inc = {};
  (transactions || []).forEach((t) => {
    const bucket =
      t.type === 'Expense' || t.type === 'Transfer Out'
        ? out
        : t.type === 'Income' || t.type === 'Transfer In'
        ? inc
        : null;
    if (!bucket) return;
    bucket[t.currency] = (bucket[t.currency] || 0) + Math.abs(t.amount || 0);
  });
  const source = Object.keys(out).length ? out : inc;
  const parts = Object.entries(source).map(([currency, amount]) =>
    formatCurrency(amount, currency)
  );
  return parts.length ? `Total: ${parts.join(', ')}` : '';
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
 * Pre-resolve the latest rate for every currency pair, once.
 *
 * convertAmountWithExchangeRates below scans the whole rate list twice on every
 * call. That is fine for one-off conversions, but the Reports page converts
 * once per transaction per category scan, where it becomes a measurable share
 * of the page's cost. Build this once (memoize on the rates array) and pass it
 * to convertAmountWithLookup instead.
 *
 * Tie-breaking matches findLatestRate exactly: a later date wins, and an equal
 * or unparseable date leaves the earlier entry in place.
 *
 * @param {Array} exchangeRates
 * @returns {Map<string, {rate: number|string, time: number}>} keyed "FROM>TO"
 */
export function buildExchangeRateLookup(exchangeRates) {
  const lookup = new Map()
  ;(exchangeRates || []).forEach((er) => {
    const key = `${er.from_currency}>${er.to_currency}`
    const time = new Date(er.date || er.created_at || 0).getTime()
    const existing = lookup.get(key)
    // Strictly greater, so the first entry wins ties — and a NaN time never
    // displaces an existing entry, mirroring the reduce in findLatestRate.
    if (!existing || time > existing.time) lookup.set(key, { rate: er.rate, time })
  })
  return lookup
}

/**
 * convertAmountWithExchangeRates using a prebuilt lookup. Same contract:
 * direct rate wins, then the reverse rate (dividing), then null. A falsy
 * amount and an unknown pair both return null; same-currency short-circuits
 * before any lookup.
 *
 * @param {number} amount
 * @param {string} fromCurrency
 * @param {string} toCurrency
 * @param {Map} lookup - from buildExchangeRateLookup
 * @returns {number|null}
 */
export function convertAmountWithLookup(amount, fromCurrency, toCurrency, lookup) {
  if (!amount || !fromCurrency || !toCurrency) {
    return null
  }

  const from = fromCurrency.toUpperCase()
  const to = toCurrency.toUpperCase()

  if (from === to) {
    return amount
  }

  if (!lookup || lookup.size === 0) {
    return null
  }

  const direct = lookup.get(`${from}>${to}`)
  if (direct) {
    return amount * direct.rate
  }

  const reverse = lookup.get(`${to}>${from}`)
  if (reverse) {
    return amount / reverse.rate
  }

  return null
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

