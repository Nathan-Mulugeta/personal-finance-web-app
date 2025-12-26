import { supabase, getCurrentUser } from '../supabase'

// Get all settings
export async function getSettings() {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', user.id)
    .order('setting_key', { ascending: true })

  if (error) throw error

  // If no settings exist, initialize defaults
  if (!data || data.length === 0) {
    await initializeDefaultSettings(user.id)
    return getSettings() // Recursive call to get initialized settings
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

  const updates = Object.entries(settingsObject).map(([key, value]) => ({
    user_id: user.id,
    setting_key: key,
    setting_value: value,
  }))

  // Use upsert to update or insert
  const { data, error } = await supabase
    .from('settings')
    .upsert(updates, { onConflict: 'user_id,setting_key' })
    .select()

  if (error) throw error
  return data
}

// Initialize default settings
export async function initializeDefaultSettings(userId) {
  const defaults = [
    { setting_key: 'BaseCurrency', setting_value: 'ETB' },
    { setting_key: 'BorrowingCategoryID', setting_value: '' },
    { setting_key: 'LendingCategoryID', setting_value: '' },
    { setting_key: 'BorrowingPaymentCategoryID', setting_value: '' },
    { setting_key: 'LendingPaymentCategoryID', setting_value: '' },
  ]

  const { error } = await supabase
    .from('settings')
    .insert(
      defaults.map(setting => ({
        user_id: userId,
        ...setting,
      }))
    )

  if (error) throw error
}

