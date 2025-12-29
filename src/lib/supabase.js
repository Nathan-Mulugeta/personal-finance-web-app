import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Check if environment variables are set
const isConfigured = supabaseUrl && supabaseAnonKey && 
  supabaseUrl !== 'your_supabase_project_url' && 
  supabaseAnonKey !== 'your_supabase_anon_key'

if (!isConfigured) {
  console.warn(
    '⚠️ Missing Supabase environment variables.\n' +
    'Please create a .env file in the root directory with:\n' +
    'VITE_SUPABASE_URL=your_supabase_project_url\n' +
    'VITE_SUPABASE_ANON_KEY=your_supabase_anon_key\n\n' +
    'The app will still load, but API calls will fail until configured.'
  )
}

// Create client - Supabase client can be created even with invalid URLs
// It will just fail on actual API calls, which we handle gracefully
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
)

// Helper function to generate IDs
export function generateId(prefix) {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `${prefix}_${timestamp}_${random}`
}

// Cached user state to avoid redundant auth calls
let cachedUser = null
let userCacheTimestamp = 0
const USER_CACHE_TTL = 5000 // 5 seconds cache

/**
 * Get current user with caching to reduce redundant auth calls.
 * The cache is invalidated after 5 seconds or when auth state changes.
 * @returns {Promise<Object|null>} User object or null
 */
export async function getCurrentUser() {
  const now = Date.now()
  
  // Return cached user if still valid
  if (cachedUser && (now - userCacheTimestamp) < USER_CACHE_TTL) {
    return cachedUser
  }
  
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  
  // Cache the user
  cachedUser = user
  userCacheTimestamp = now
  
  return user
}

/**
 * Get current user synchronously from cache.
 * Returns null if no cached user available.
 * Use this only when you're certain the user has been fetched recently.
 * @returns {Object|null} Cached user object or null
 */
export function getCachedUser() {
  const now = Date.now()
  if (cachedUser && (now - userCacheTimestamp) < USER_CACHE_TTL) {
    return cachedUser
  }
  return null
}

/**
 * Clear the user cache. Call this on logout.
 */
export function clearUserCache() {
  cachedUser = null
  userCacheTimestamp = 0
}

/**
 * Set the cached user directly.
 * Use this when you receive the user from auth state change.
 * @param {Object|null} user - User object to cache
 */
export function setCachedUser(user) {
  cachedUser = user
  userCacheTimestamp = Date.now()
}

// Helper function to get current session
export async function getCurrentSession() {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) throw error
  return session
}

// Listen for auth changes and update cache
supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    setCachedUser(session.user)
  } else {
    clearUserCache()
  }
})
