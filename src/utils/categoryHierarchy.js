/**
 * Build category tree from flat list
 */
export function buildCategoryTree(categories) {
  const categoryMap = new Map()
  const rootCategories = []

  // Create map
  categories.forEach(cat => {
    categoryMap.set(cat.category_id, { ...cat, children: [] })
  })

  // Build tree
  categories.forEach(cat => {
    const categoryNode = categoryMap.get(cat.category_id)
    if (cat.parent_category_id) {
      const parent = categoryMap.get(cat.parent_category_id)
      if (parent) {
        parent.children.push(categoryNode)
      } else {
        // Orphaned category, add to root
        rootCategories.push(categoryNode)
      }
    } else {
      rootCategories.push(categoryNode)
    }
  })

  return rootCategories
}

/**
 * Get all descendants of a category
 */
export function getCategoryDescendants(categoryId, categories) {
  const descendants = []
  const findDescendants = (parentId) => {
    const children = categories.filter(cat => cat.parent_category_id === parentId)
    children.forEach(child => {
      descendants.push(child)
      findDescendants(child.category_id)
    })
  }
  findDescendants(categoryId)
  return descendants
}

/**
 * Validate no circular reference
 */
export function validateCategoryHierarchy(categoryId, parentCategoryId, categories) {
  if (!parentCategoryId) return true
  if (categoryId === parentCategoryId) return false

  // Check if parent is a descendant
  const descendants = getCategoryDescendants(categoryId, categories)
  return !descendants.some(desc => desc.category_id === parentCategoryId)
}

/**
 * Flatten category tree for dropdown display
 * Returns flat array with hierarchy metadata for styling
 */
export function flattenCategoryTree(categories) {
  const tree = buildCategoryTree(categories)
  const result = []

  const flatten = (nodes, depth = 0, parentIndex = null) => {
    nodes.forEach((node, index) => {
      const hasChildren = node.children && node.children.length > 0
      const isLastChild = index === nodes.length - 1
      
      result.push({
        ...node,
        depth,
        hasChildren,
        isLastChild,
        parentIndex,
      })
      
      if (hasChildren) {
        flatten(node.children, depth + 1, result.length - 1)
      }
    })
  }

  flatten(tree)
  return result
}

/**
 * Build a Set of category_ids that are parents (referenced as another
 * category's parent_category_id) within the given list. Transactions must post
 * to leaf categories, so any id in this set should be blocked in transaction
 * pickers and at save time. Pass an Active-only list to match what the pickers
 * show — a parent whose only children are archived then counts as a leaf.
 *
 * @param {Array} categories - flat category list (raw or flattened)
 * @returns {Set<string>} category_ids that have at least one child in the list
 */
export function getParentCategoryIds(categories) {
  const parents = new Set()
  ;(categories || []).forEach((cat) => {
    if (cat.parent_category_id) parents.add(cat.parent_category_id)
  })
  return parents
}

