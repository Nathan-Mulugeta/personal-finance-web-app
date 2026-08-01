/**
 * Does this transaction need a counterparty? True when its category is one of
 * the configured borrowing/lending categories (or a subcategory of one), since
 * saving it creates a borrowing/lending record that is filed under that name.
 *
 * @param {string} categoryId
 * @param {Set<string>} borrowingLendingCategoryIds - see
 *   selectBorrowingLendingCategoryIds
 * @returns {boolean}
 */
export function isEntityNameRequired(categoryId, borrowingLendingCategoryIds) {
  if (!categoryId || !borrowingLendingCategoryIds) return false
  return borrowingLendingCategoryIds.has(categoryId)
}

export const ENTITY_NAME_REQUIRED_MESSAGE =
  'Who this is with is required for borrowing and lending'

/**
 * Parse entity name from transaction description
 * Format: "Description @EntityName" or "@EntityName Description"
 * Returns: { entityName: string, notes: string }
 *
 * Superseded by the explicit entity_name field — kept because the database
 * still falls back to this convention for descriptions that use it.
 */
export function parseEntityName(description) {
  if (!description || typeof description !== 'string') {
    return {
      entityName: 'Unknown',
      notes: description || '',
    }
  }

  const trimmed = description.trim()
  const atIndex = trimmed.indexOf('@')

  if (atIndex === -1) {
    // No @ found
    return {
      entityName: 'Unknown',
      notes: trimmed,
    }
  }

  // Extract text after @
  const afterAt = trimmed.substring(atIndex + 1).trim()
  const spaceIndex = afterAt.indexOf(' ')

  if (spaceIndex === -1) {
    // No space after @, entire rest is entity name
    const entityName = afterAt || 'Unknown'
    const notes = trimmed.substring(0, atIndex).trim()
    return {
      entityName,
      notes,
    }
  }

  // Extract entity name (up to first space) and notes
  const entityName = afterAt.substring(0, spaceIndex).trim() || 'Unknown'
  const beforeAt = trimmed.substring(0, atIndex).trim()
  const afterEntity = afterAt.substring(spaceIndex).trim()
  const notes = [beforeAt, afterEntity].filter(Boolean).join(' ').trim() || ''

  return {
    entityName,
    notes,
  }
}

