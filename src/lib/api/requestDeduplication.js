/**
 * Request Deduplication Layer
 * 
 * Prevents duplicate concurrent requests to the same endpoint with the same parameters.
 * If a request is already in progress, subsequent identical requests will wait for
 * and receive the result of the first request.
 */

// Map of in-flight requests: key -> Promise
const pendingRequests = new Map();

/**
 * Generate a cache key from a request signature
 * @param {string} endpoint - The API endpoint or function name
 * @param {Object} params - Request parameters
 * @returns {string} Cache key
 */
function generateCacheKey(endpoint, params) {
  try {
    return `${endpoint}:${JSON.stringify(params)}`;
  } catch {
    // If params can't be serialized, use just the endpoint
    return endpoint;
  }
}

/**
 * Execute a request with deduplication.
 * If an identical request is already in progress, returns its promise.
 * Otherwise, executes the request and caches the promise.
 * 
 * @param {string} endpoint - Unique identifier for this request type
 * @param {Object} params - Request parameters (used for cache key generation)
 * @param {Function} requestFn - Async function that performs the actual request
 * @returns {Promise<any>} The request result
 */
export async function deduplicatedRequest(endpoint, params, requestFn) {
  const cacheKey = generateCacheKey(endpoint, params);
  
  // Check if there's already a pending request with the same key
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }
  
  // Create the request promise
  const requestPromise = (async () => {
    try {
      return await requestFn();
    } finally {
      // Always clean up when done (success or error)
      pendingRequests.delete(cacheKey);
    }
  })();
  
  // Store the promise for deduplication
  pendingRequests.set(cacheKey, requestPromise);
  
  return requestPromise;
}

/**
 * Clear all pending requests.
 * Useful for testing or when user logs out.
 */
export function clearPendingRequests() {
  pendingRequests.clear();
}

/**
 * Get the count of pending requests.
 * Useful for debugging and testing.
 * @returns {number} Number of pending requests
 */
export function getPendingRequestCount() {
  return pendingRequests.size;
}

/**
 * Create a deduplicated version of an API function.
 * 
 * @param {string} endpoint - Unique identifier for this request type
 * @param {Function} fn - The API function to wrap
 * @returns {Function} Wrapped function with deduplication
 * 
 * @example
 * const getAccountsDeduplicated = createDeduplicatedFn(
 *   'accounts/getAccounts',
 *   getAccounts
 * );
 */
export function createDeduplicatedFn(endpoint, fn) {
  return function (...args) {
    return deduplicatedRequest(
      endpoint,
      args,
      () => fn(...args)
    );
  };
}

