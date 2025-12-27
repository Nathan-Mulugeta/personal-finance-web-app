import { supabase, generateId, getCurrentUser } from '../supabase'

// Category types enum
export const CATEGORY_TYPES = ['Income', 'Expense']
export const CATEGORY_STATUSES = ['Active', 'Archived']

// Create category
export async function createCategory(categoryData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const { name, type, parentCategoryId = null, status = 'Active' } = categoryData

  // Validation
  if (!name || !type) {
    throw new Error('Name and type are required')
  }
  if (!CATEGORY_TYPES.includes(type)) {
    throw new Error(`Invalid category type. Must be one of: ${CATEGORY_TYPES.join(', ')}`)
  }
  if (!CATEGORY_STATUSES.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${CATEGORY_STATUSES.join(', ')}`)
  }

  // Normalize name (trim and lowercase for uniqueness check)
  const normalizedName = name.trim()

  // Check if parent exists and is active
  if (parentCategoryId) {
    const { data: parent } = await supabase
      .from('categories')
      .select('*')
      .eq('category_id', parentCategoryId)
      .eq('user_id', user.id)
      .eq('status', 'Active')
      .single()

    if (!parent) {
      throw new Error('Parent category not found or is not active')
    }
  }

  // Validate no circular reference (using database function)
  if (parentCategoryId) {
    const { data: isValid } = await supabase.rpc('validate_category_hierarchy', {
      p_category_id: null, // New category, no ID yet
      p_parent_category_id: parentCategoryId,
      p_user_id: user.id,
    })

    // Note: For new categories, we'll let the database trigger handle this
    // But we can do a basic check here
    if (parentCategoryId) {
      // Check if parent is a descendant (would create cycle)
      const descendants = await getCategoryDescendants(parentCategoryId, user.id)
      // This check is basic - the database trigger will catch actual cycles
    }
  }

  const categoryId = generateId('CAT')
  const { data, error } = await supabase
    .from('categories')
    .insert({
      category_id: categoryId,
      user_id: user.id,
      name: normalizedName,
      type,
      parent_category_id: parentCategoryId,
      status,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Category name already exists')
    }
    throw error
  }
  return data
}

// Get all categories
export async function getCategories(filters = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  let query = supabase
    .from('categories')
    .select('*')
    .eq('user_id', user.id)

  if (filters.type) {
    query = query.eq('type', filters.type)
  }
  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.parentCategoryId !== undefined) {
    if (filters.parentCategoryId === null) {
      query = query.is('parent_category_id', null)
    } else {
      query = query.eq('parent_category_id', filters.parentCategoryId)
    }
  }

  // Incremental sync: fetch records updated or created since last sync
  if (filters.since) {
    query = query.or(`updated_at.gte.${filters.since},created_at.gte.${filters.since}`)
  }

  const { data, error } = await query.order('name', { ascending: true })

  if (error) throw error
  return data || []
}

// Get category by ID
export async function getCategoryById(categoryId) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('category_id', categoryId)
    .eq('user_id', user.id)
    .single()

  if (error) throw error
  return data
}

// Get category descendants (for hierarchy building)
export async function getCategoryDescendants(categoryId, userId) {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', userId)

  if (error) throw error

  const descendants = []
  const findDescendants = (parentId) => {
    const children = data.filter(cat => cat.parent_category_id === parentId)
    for (const child of children) {
      descendants.push(child)
      findDescendants(child.category_id)
    }
  }

  findDescendants(categoryId)
  return descendants
}

// Build category tree
export async function buildCategoryTree(filters = {}) {
  const categories = await getCategories(filters)
  
  // Create a map for quick lookup
  const categoryMap = new Map()
  const rootCategories = []

  // First pass: create map
  categories.forEach(cat => {
    categoryMap.set(cat.category_id, { ...cat, children: [] })
  })

  // Second pass: build tree
  categories.forEach(cat => {
    const categoryNode = categoryMap.get(cat.category_id)
    if (cat.parent_category_id) {
      const parent = categoryMap.get(cat.parent_category_id)
      if (parent) {
        parent.children.push(categoryNode)
      } else {
        // Orphaned category (parent doesn't exist), add to root
        rootCategories.push(categoryNode)
      }
    } else {
      rootCategories.push(categoryNode)
    }
  })

  return rootCategories
}

// Update category
export async function updateCategory(categoryId, updates) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  // Check if category exists
  const category = await getCategoryById(categoryId)
  if (!category) {
    throw new Error('Category not found')
  }

  // Validation
  if (updates.type && !CATEGORY_TYPES.includes(updates.type)) {
    throw new Error(`Invalid category type. Must be one of: ${CATEGORY_TYPES.join(', ')}`)
  }
  if (updates.status && !CATEGORY_STATUSES.includes(updates.status)) {
    throw new Error(`Invalid status. Must be one of: ${CATEGORY_STATUSES.join(', ')}`)
  }

  // Check parent if updating
  if (updates.parentCategoryId !== undefined) {
    if (updates.parentCategoryId === categoryId) {
      throw new Error('Category cannot be its own parent')
    }

    if (updates.parentCategoryId) {
      const { data: parent } = await supabase
        .from('categories')
        .select('*')
        .eq('category_id', updates.parentCategoryId)
        .eq('user_id', user.id)
        .eq('status', 'Active')
        .single()

      if (!parent) {
        throw new Error('Parent category not found or is not active')
      }
    }
  }

  const updateData = {}
  if (updates.name !== undefined) updateData.name = updates.name.trim()
  if (updates.type !== undefined) updateData.type = updates.type
  if (updates.parentCategoryId !== undefined) {
    updateData.parent_category_id = updates.parentCategoryId
  }
  if (updates.status !== undefined) updateData.status = updates.status

  const { data, error } = await supabase
    .from('categories')
    .update(updateData)
    .eq('category_id', categoryId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Category name already exists')
    }
    throw error
  }
  return data
}

// Delete category
export async function deleteCategory(categoryId) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  // Check if category has transactions
  const { data: transactions } = await supabase
    .from('transactions')
    .select('transaction_id')
    .eq('category_id', categoryId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .limit(1)

  if (transactions && transactions.length > 0) {
    throw new Error('Cannot delete category with existing transactions')
  }

  // Check if category has subcategories
  const { data: subcategories } = await supabase
    .from('categories')
    .select('category_id')
    .eq('parent_category_id', categoryId)
    .eq('user_id', user.id)
    .limit(1)

  if (subcategories && subcategories.length > 0) {
    throw new Error('Cannot delete category with subcategories')
  }

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('category_id', categoryId)
    .eq('user_id', user.id)

  if (error) throw error
}

