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
  // Verify user is authenticated and userId matches the current session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  
  if (sessionError || !session) {
    console.warn('No active session when initializing settings')
    return
  }

  // Ensure the userId matches the authenticated user
  if (session.user.id !== userId) {
    console.warn('User ID mismatch when initializing settings')
    return
  }

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

  // Insert settings one by one to handle any conflicts gracefully
  for (const setting of defaults) {
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({
          user_id: userId,
          setting_key: setting.setting_key,
          setting_value: setting.setting_value,
        }, { 
          onConflict: 'user_id,setting_key',
          ignoreDuplicates: true
        })

      // Log but don't throw on errors - settings might already exist
      if (error) {
        // If it's a conflict/duplicate error, settings already exist
        if (error.code === '23505' || error.status === 409 || 
            error.message?.includes('duplicate') || 
            error.message?.includes('unique') ||
            error.message?.includes('conflict') ||
            error.message?.includes('row-level security')) {
          console.log(`Setting ${setting.setting_key} already exists or RLS prevented insert`)
          continue
        }
        console.warn(`Error inserting setting ${setting.setting_key}:`, error.message)
      }
    } catch (err) {
      // Handle any errors gracefully - don't block app initialization
      if (err.code === '23505' || err.status === 409 || 
          err.message?.includes('duplicate') || 
          err.message?.includes('unique') ||
          err.message?.includes('conflict') ||
          err.message?.includes('row-level security')) {
        console.log(`Setting ${setting.setting_key} already exists or RLS prevented insert`)
        continue
      }
      console.warn(`Error inserting setting ${setting.setting_key}:`, err.message)
    }
  }
}

