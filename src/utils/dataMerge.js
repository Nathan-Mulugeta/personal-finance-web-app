/**
 * Merge incremental data with existing data
 * Updates existing records and adds new ones
 * @param {Array} existing - Existing data array
 * @param {Array} incoming - New data from incremental sync
 * @param {string} idField - Field name to use as unique identifier (default: 'id')
 * @returns {Array} Merged data array
 */
export function mergeIncrementalData(existing, incoming, idField = 'id') {
  if (!existing || existing.length === 0) {
    return incoming || []
  }
  if (!incoming || incoming.length === 0) {
    return existing
  }

  // Create a map for quick lookup
  const map = new Map()
  
  // Add all existing items to map
  existing.forEach(item => {
    const id = item[idField] || item[`${idField}_id`] || item[`${idField}Id`]
    if (id) {
      map.set(id, item)
    }
  })

  // Update or add incoming items
  incoming.forEach(item => {
    const id = item[idField] || item[`${idField}_id`] || item[`${idField}Id`]
    if (id) {
      // For soft-deleted items, remove from map
      if (item.deleted_at) {
        map.delete(id)
      } else {
        // Update or add
        map.set(id, item)
      }
    }
  })

  return Array.from(map.values())
}

/**
 * Get the appropriate ID field name for an entity type
 */
export function getIdField(entityType) {
  const idFieldMap = {
    transactions: 'transaction_id',
    accounts: 'account_id',
    categories: 'category_id',
    budgets: 'budget_id',
    transfers: 'transferId',
    borrowingsLendings: 'record_id',
    settings: 'setting_key',
    exchangeRates: 'exchange_rate_id',
  }
  return idFieldMap[entityType] || 'id'
}

/**
 * Derive the next incremental-sync timestamp from fetched records.
 *
 * Uses the max updated_at/created_at of the returned rows (server clocks)
 * instead of the client clock, so incremental sync is immune to client
 * clock skew and to records written while a fetch was in flight.
 *
 * @param {Array} records - Rows returned by the fetch
 * @param {string|null} previousSync - Current lastSync value to fall back to
 * @returns {string|null} Timestamp to store as lastSync, or null if unknown
 */
export function getLatestSyncTimestamp(records, previousSync = null) {
  let latest = previousSync || null
  let latestMs = latest ? new Date(latest).getTime() : -Infinity

  ;(records || []).forEach(record => {
    [record?.updated_at, record?.created_at].forEach(ts => {
      if (!ts) return
      const ms = new Date(ts).getTime()
      if (!Number.isNaN(ms) && ms > latestMs) {
        latestMs = ms
        latest = ts
      }
    })
  })

  return latest
}

/**
 * Merge transfers (special case - transfers have nested structure)
 */
export function mergeTransfers(existing, incoming) {
  if (!existing || existing.length === 0) {
    return incoming || []
  }
  if (!incoming || incoming.length === 0) {
    return existing
  }

  const map = new Map()
  existing.forEach(transfer => {
    if (transfer.transferId) {
      map.set(transfer.transferId, transfer)
    }
  })

  incoming.forEach(transfer => {
    if (transfer.transferId) {
      // Check if transfer was deleted (both transactions deleted)
      const transferOutDeleted = transfer.transferOut?.deleted_at
      const transferInDeleted = transfer.transferIn?.deleted_at
      if (transferOutDeleted && transferInDeleted) {
        map.delete(transfer.transferId)
      } else {
        map.set(transfer.transferId, transfer)
      }
    }
  })

  return Array.from(map.values())
}

