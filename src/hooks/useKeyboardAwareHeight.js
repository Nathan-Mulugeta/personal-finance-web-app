import { useState, useEffect } from 'react';

/**
 * Hook to detect virtual keyboard visibility and calculate available height.
 * Uses the visualViewport API to detect keyboard presence on mobile devices.
 * 
 * @returns {{ keyboardVisible: boolean, keyboardHeight: number, viewportHeight: number }}
 */
export function useKeyboardAwareHeight() {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 0
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;
    const initialHeight = window.innerHeight;

    const handleResize = () => {
      const currentHeight = viewport.height;
      const heightDiff = initialHeight - currentHeight;
      
      // Consider keyboard visible if the viewport shrinks by more than 150px
      // This threshold helps avoid false positives from address bar changes
      const isKeyboardVisible = heightDiff > 150;
      
      setKeyboardVisible(isKeyboardVisible);
      setKeyboardHeight(isKeyboardVisible ? heightDiff : 0);
      setViewportHeight(currentHeight);
    };

    viewport.addEventListener('resize', handleResize);
    viewport.addEventListener('scroll', handleResize);

    // Initial check
    handleResize();

    return () => {
      viewport.removeEventListener('resize', handleResize);
      viewport.removeEventListener('scroll', handleResize);
    };
  }, []);

  return { keyboardVisible, keyboardHeight, viewportHeight };
}

export default useKeyboardAwareHeight;

