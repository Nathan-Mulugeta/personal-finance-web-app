import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import CssBaseline from '@mui/material/CssBaseline';
import App from './App.jsx';
import store, { persistor } from './store';
import LoadingSpinner from './components/common/LoadingSpinner';
import {
  getTheme,
  ColorModeContext,
  THEME_COLOR,
  THEME_MODE_STORAGE_KEY,
} from './theme';
import './index.css';

function ThemedApp() {
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  });
  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)', {
    noSsr: true,
  });

  const resolvedMode =
    mode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : mode;

  const colorMode = useMemo(
    () => ({
      mode,
      resolvedMode,
      setMode: (newMode) => {
        setMode(newMode);
        localStorage.setItem(THEME_MODE_STORAGE_KEY, newMode);
      },
    }),
    [mode, resolvedMode]
  );

  const theme = useMemo(() => getTheme(resolvedMode), [resolvedMode]);

  // Keep the PWA titlebar / browser chrome color in sync with the theme
  useEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLOR[resolvedMode]);
  }, [resolvedMode]);

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate
        loading={<LoadingSpinner fullScreen />}
        persistor={persistor}
      >
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <ThemedApp />
        </BrowserRouter>
      </PersistGate>
    </Provider>
  </React.StrictMode>
);
