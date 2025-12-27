import { supabase, getCurrentUser } from '../supabase'

// Get all settings
export async function getSettings(filters = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  let query = supabase
    .from('settings')
    .select('*')
    .eq('user_id', user.id)

  // Incremental sync: fetch records updated since last sync
  if (filters?.since) {
    query = query.gte('updated_at', filters.since)
  }

  const { data, error } = await query.order('setting_key', { ascending: true })

  if (error) throw error

  // Only initialize defaults if this is a full fetch (not incremental) and no settings exist
  // For incremental sync, empty array just means nothing changed, not that settings don't exist
  const isIncremental = !!filters?.since
  if (!isIncremental && (!data || data.length === 0)) {
    await initializeDefaultSettings(user.id)
    return getSettings(filters) // Recursive call to get initialized settings
  }

  return data || []
}

// Get setting by key
export async function getSetting(key) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', user.id)
    .eq('setting_key', key)
    .single()

  if (error && error.code !== 'PGRST116') throw error // PGRST116 = not found
  return data
}

// Update setting
export async function updateSetting(key, value) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  // Check if setting exists
  const existing = await getSetting(key)

  if (existing) {
    // Update existing
    const { data, error } = await supabase
      .from('settings')
      .update({ setting_value: value })
      .eq('user_id', user.id)
      .eq('setting_key', key)
      .select()
      .single()

    if (error) throw error
    return data
  } else {
    // Create new
    const { data, error } = await supabase
      .from('settings')
      .insert({
        user_id: user.id,
        setting_key: key,
        setting_value: value,
      })
      .select()
      .single()

    if (error) throw error
    return data
  }
}

// Update multiple settings
export async function updateSettings(settingsObject) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  // Update each setting individually to avoid conflicts
  const results = []
  for (const [key, value] of Object.entries(settingsObject)) {
    try {
      // Check if setting exists
      const existing = await getSetting(key)
      
      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from('settings')
          .update({ setting_value: value })
          .eq('user_id', user.id)
          .eq('setting_key', key)
          .select()
          .single()

        if (error) throw error
        results.push(data)
      } else {
        // Create new
        const { data, error } = await supabase
          .from('settings')
          .insert({
            user_id: user.id,
            setting_key: key,
            setting_value: value,
          })
          .select()
          .single()

        if (error) throw error
        results.push(data)
      }
    } catch (err) {
      // If insert fails due to conflict, try update instead
      if (err.code === '23505' || err.message?.includes('duplicate') || err.message?.includes('unique')) {
        const { data, error } = await supabase
          .from('settings')
          .update({ setting_value: value })
          .eq('user_id', user.id)
          .eq('setting_key', key)
          .select()
          .single()

        if (error) throw error
        results.push(data)
      } else {
        throw err
      }
    }
  }

  return results
}

// Initialize default settings
export async function initializeDefaultSettings(userId) {
  // Pre-check: verify if any settings already exist for this user
  const { data: existingSettings, error: checkError } = await supabase
    .from('settings')
    .select('setting_key')
    .eq('user_id', userId)
    .limit(1)

  // If check fails or settings already exist, skip initialization
  if (checkError || (existingSettings && existingSettings.length > 0)) {
    return
  }

  const defaults = [
    { setting_key: 'BaseCurrency', setting_value: 'ETB' },
    { setting_key: 'BorrowingCategoryID', setting_value: '' },
    { setting_key: 'LendingCategoryID', setting_value: '' },
    { setting_key: 'BorrowingPaymentCategoryID', setting_value: '' },
    { setting_key: 'LendingPaymentCategoryID', setting_value: '' },
  ]

  // Use upsert to avoid conflicts if settings already exist
  const settingsToInsert = defaults.map(setting => ({
    user_id: userId,
    ...setting,
  }))

  try {
    const { error } = await supabase
      .from('settings')
      .upsert(settingsToInsert, { 
        onConflict: ['user_id', 'setting_key'],
        ignoreDuplicates: false // Update if exists
      })

    // Handle 409 Conflict errors gracefully - means settings already exist
    if (error) {
      // If it's a conflict error (409), settings already exist, so we can safely ignore it
      if (error.code === '23505' || error.status === 409 || 
          error.message?.includes('duplicate') || 
          error.message?.includes('unique') ||
          error.message?.includes('conflict')) {
        // Settings already exist, no need to throw
        return
      }
      // For other errors, throw them
      throw error
    }
  } catch (err) {
    // Handle any other errors that might occur during upsert
    // If it's a conflict, settings already exist, so we can safely ignore it
    if (err.code === '23505' || err.status === 409 || 
        err.message?.includes('duplicate') || 
        err.message?.includes('unique') ||
        err.message?.includes('conflict')) {
      // Settings already exist, no need to throw
      return
    }
    // Re-throw other errors
    throw err
  }
}

