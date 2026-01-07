import { useEffect } from 'react';

/**
 * Hook to automatically dismiss an error after a specified duration
 * @param {Function} setError - Function to clear the error (e.g., () => setError(null))
 * @param {*} error - The error value (will auto-dismiss if truthy)
 * @param {number} duration - Duration in milliseconds (default: 8000ms = 8 seconds)
 */
export function useAutoDismissError(setError, error, duration = 8000) {
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [error, setError, duration]);
}


