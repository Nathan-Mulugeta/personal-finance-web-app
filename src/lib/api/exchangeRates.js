import { supabase, generateId, getCurrentUser } from '../supabase'

// Create exchange rate
export async function createExchangeRate(exchangeRateData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const {
    transferId = null,
    fromCurrency,
    toCurrency,
    rate,
    fromAmount,
    toAmount,
    date,
  } = exchangeRateData

  // Validation
  if (!fromCurrency || !toCurrency || rate === undefined || fromAmount === undefined || toAmount === undefined) {
    throw new Error('From currency, to currency, rate, from amount, and to amount are required')
  }
  if (fromCurrency.length !== 3 || toCurrency.length !== 3) {
    throw new Error('Currencies must be 3-letter ISO codes')
  }
  if (fromCurrency === toCurrency) {
    throw new Error('From and to currencies must be different')
  }

  const exchangeRateId = generateId('EXR')
  const rateDate = date ? new Date(date) : new Date()

  const { data, error } = await supabase
    .from('exchange_rates')
    .insert({
      exchange_rate_id: exchangeRateId,
      user_id: user.id,
      transfer_id: transferId,
      from_currency: fromCurrency.toUpperCase(),
      to_currency: toCurrency.toUpperCase(),
      rate,
      from_amount: fromAmount,
      to_amount: toAmount,
      date: rateDate.toISOString().split('T')[0],
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// Get latest exchange rate
export async function getLatestExchangeRate(fromCurrency, toCurrency) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  if (!fromCurrency || !toCurrency) {
    throw new Error('From currency and to currency are required')
  }
  if (fromCurrency.length !== 3 || toCurrency.length !== 3) {
    throw new Error('Currencies must be 3-letter ISO codes')
  }

  // If same currency, return rate of 1
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
    return {
      exchange_rate_id: null,
      from_currency: fromCurrency.toUpperCase(),
      to_currency: toCurrency.toUpperCase(),
      rate: 1,
      from_amount: 1,
      to_amount: 1,
      date: new Date().toISOString().split('T')[0],
    }
  }

  // Try direct rate (fromCurrency -> toCurrency)
  let { data, error } = await supabase
    .from('exchange_rates')
    .select('*')
    .eq('user_id', user.id)
    .eq('from_currency', fromCurrency.toUpperCase())
    .eq('to_currency', toCurrency.toUpperCase())
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (!error && data) {
    return data
  }

  // Try reverse rate (toCurrency -> fromCurrency) and invert
  const { data: reverseData, error: reverseError } = await supabase
    .from('exchange_rates')
    .select('*')
    .eq('user_id', user.id)
    .eq('from_currency', toCurrency.toUpperCase())
    .eq('to_currency', fromCurrency.toUpperCase())
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (!reverseError && reverseData) {
    return {
      ...reverseData,
      from_currency: fromCurrency.toUpperCase(),
      to_currency: toCurrency.toUpperCase(),
      rate: 1 / reverseData.rate,
      from_amount: reverseData.to_amount,
      to_amount: reverseData.from_amount,
    }
  }

  // No rate found
  return null
}

// Convert currency
export async function convertCurrency(amount, fromCurrency, toCurrency) {
  const rate = await getLatestExchangeRate(fromCurrency, toCurrency)

  if (!rate) {
    throw new Error(`No exchange rate found for ${fromCurrency} to ${toCurrency}`)
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

// Get exchange rates
export async function getExchangeRates(filters = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  let query = supabase
    .from('exchange_rates')
    .select('*')
    .eq('user_id', user.id)

  if (filters.transferId) {
    query = query.eq('transfer_id', filters.transferId)
  }
  if (filters.fromCurrency) {
    query = query.eq('from_currency', filters.fromCurrency.toUpperCase())
  }
  if (filters.toCurrency) {
    query = query.eq('to_currency', filters.toCurrency.toUpperCase())
  }
  if (filters.date) {
    query = query.eq('date', filters.date)
  }
  if (filters.startDate) {
    query = query.gte('date', filters.startDate)
  }
  if (filters.endDate) {
    query = query.lte('date', filters.endDate)
  }

  // Incremental sync: fetch records created since last sync (exchange rates only have created_at)
  if (filters.since) {
    query = query.gte('created_at', filters.since)
  }

  const { data, error } = await query.order('date', { ascending: false })

  if (error) throw error
  return data || []
}

