import { useState, useEffect } from 'react';

// The viewport must shrink by more than this for it to count as a keyboard.
// Comfortably above the mobile address bar's show/hide delta, which would
// otherwise read as a very short keyboard.
const KEYBOARD_THRESHOLD_PX = 150;

/**
 * Hook to detect virtual keyboard visibility and calculate available height.
 * Uses the visualViewport API to detect keyboard presence on mobile devices.
 *
 * Measures the gap between the layout viewport (window.innerHeight) and the
 * visual viewport, both read live. Nothing is captured at mount: a remembered
 * baseline is wrong the moment the component mounts while the viewport is
 * already reduced — a dialog opened after the page was scrolled, with the
 * address bar collapsed — and every later reading is then measured against it.
 *
 * The gap is also what distinguishes a keyboard from browser chrome. Showing or
 * hiding the address bar moves both viewports together, so it cancels out;
 * only the keyboard pushes them apart. Rotating changes both, so it needs no
 * special handling either.
 *
 * On browsers that reflow the layout viewport for the keyboard (Android Chrome
 * by default) the gap stays near zero and this reports no keyboard — which is
 * correct there, because the page has already been resized to fit above it.
 * iOS Safari leaves the layout viewport alone, so the gap is the keyboard's
 * height and callers can pad by it.
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

    const handleResize = () => {
      const currentHeight = viewport.height;
      const heightDiff = window.innerHeight - currentHeight;
      const isKeyboardVisible = heightDiff > KEYBOARD_THRESHOLD_PX;

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

