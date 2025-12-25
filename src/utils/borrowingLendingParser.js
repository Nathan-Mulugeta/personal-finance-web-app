/**
 * Parse entity name from transaction description
 * Format: "Description @EntityName" or "@EntityName Description"
 * Returns: { entityName: string, notes: string }
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

