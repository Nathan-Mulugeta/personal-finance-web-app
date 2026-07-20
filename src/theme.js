import { createContext, useContext } from 'react';
import { createTheme } from '@mui/material/styles';

// Light palette: Google Material colors (unchanged from the original theme).
// Dark palette: Google dark-theme equivalents — lighter accent tones for
// text/icons, translucent tints for the pastel chip/badge backgrounds, and
// Google dark surfaces (#202124 / #2d2e30) instead of MUI's default #121212.
const palettes = {
  light: {
    mode: 'light',
    primary: {
      main: '#1a73e8', // Google Blue
    },
    secondary: {
      main: '#5f6368', // Google Gray
    },
    success: {
      main: '#1e8e3e', // Google Green
      light: '#e6f4ea', // Google Green background
    },
    error: {
      main: '#d93025', // Google Red
      light: '#fce8e6', // Google Red background
    },
    warning: {
      main: '#e37400', // Google Yellow/Amber
      light: '#fef7e0', // Google Yellow background
    },
    info: {
      main: '#1a73e8', // Google Blue
      light: '#e8f0fe', // Google Blue background
    },
    // Custom Google-style colors for the app
    google: {
      green: '#1e8e3e',
      greenDark: '#2e7d32',
      greenBg: '#e6f4ea',
      red: '#d93025',
      redDark: '#b71c1c',
      redBg: '#fce8e6',
      yellow: '#e37400',
      yellowBg: '#fef7e0',
      blue: '#1a73e8',
      blueBg: '#e8f0fe',
      gray: '#5f6368',
      grayBg: '#f1f3f4',
      grayLight: '#f8f9fa',
    },
    // Legacy aliases for backwards compatibility
    softRed: {
      main: '#d93025', // Google Red
    },
    softGreen: {
      main: '#1e8e3e', // Google Green
    },
  },
  dark: {
    mode: 'dark',
    primary: {
      main: '#8ab4f8', // Google Blue (dark theme)
    },
    secondary: {
      main: '#9aa0a6', // Google Gray (dark theme)
    },
    success: {
      main: '#81c995', // Google Green (dark theme)
      light: 'rgba(129, 201, 149, 0.16)',
    },
    error: {
      main: '#f28b82', // Google Red (dark theme)
      light: 'rgba(242, 139, 130, 0.16)',
    },
    warning: {
      main: '#fdd663', // Google Yellow (dark theme)
      light: 'rgba(253, 214, 99, 0.16)',
    },
    info: {
      main: '#8ab4f8',
      light: 'rgba(138, 180, 248, 0.16)',
    },
    google: {
      green: '#81c995',
      greenDark: '#81c995',
      greenBg: 'rgba(129, 201, 149, 0.16)',
      red: '#f28b82',
      redDark: '#f28b82',
      redBg: 'rgba(242, 139, 130, 0.16)',
      yellow: '#fdd663',
      yellowBg: 'rgba(253, 214, 99, 0.16)',
      blue: '#8ab4f8',
      blueBg: 'rgba(138, 180, 248, 0.16)',
      gray: '#9aa0a6',
      grayBg: 'rgba(154, 160, 166, 0.16)',
      grayLight: 'rgba(255, 255, 255, 0.05)',
    },
    softRed: {
      main: '#f28b82',
    },
    softGreen: {
      main: '#81c995',
    },
    // Cool, slate-tinted dark surfaces (modern) rather than neutral grey.
    // paper is a subtle step above the page for elevation without the washed
    // Google-grey look.
    background: {
      default: '#14161b',
      paper: '#1c1f26',
    },
    text: {
      primary: '#e8eaed',
      secondary: '#9aa0a6',
    },
    divider: 'rgba(233, 236, 244, 0.10)',
  },
};

export const getTheme = (mode) =>
  createTheme({
    palette: palettes[mode === 'dark' ? 'dark' : 'light'],
    components: {
      // MUI dark mode lightens Paper with an elevation overlay gradient,
      // which is what made dialogs/menus look washed-out grey. Drop it and
      // let the real paper color show; depth still comes from the shadow.
      MuiPaper: {
        styleOverrides: { root: { backgroundImage: 'none' } },
      },
    },
  });

// Matches the <meta name="theme-color"> so the PWA titlebar follows the theme
export const THEME_COLOR = { light: '#1a73e8', dark: '#14161b' };

export const THEME_MODE_STORAGE_KEY = 'themeMode';

// mode: 'light' | 'dark' | 'system' (user preference)
// resolvedMode: 'light' | 'dark' (what is actually rendered)
export const ColorModeContext = createContext({
  mode: 'system',
  resolvedMode: 'light',
  setMode: () => {},
});

export const useColorMode = () => useContext(ColorModeContext);
