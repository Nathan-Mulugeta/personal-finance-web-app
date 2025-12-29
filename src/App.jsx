import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import InstallPrompt from './components/common/InstallPrompt';
import LoadingSpinner from './components/common/LoadingSpinner';
import ScrollToTop from './components/common/ScrollToTop';

// Auth pages - keep eager loaded for fast initial access
import Login from './pages/Login';
import Signup from './pages/Signup';
import AuthCallback from './pages/AuthCallback';

// Lazy load all main app pages for code splitting
const Home = lazy(() => import('./pages/Home'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Categories = lazy(() => import('./pages/Categories'));
const Budgets = lazy(() => import('./pages/Budgets'));
const BorrowingsLendings = lazy(() => import('./pages/BorrowingsLendings'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const ExchangeRates = lazy(() => import('./pages/ExchangeRates'));

function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/home" replace />} />
          <Route
            path="home"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <Home />
              </Suspense>
            }
          />
          <Route
            path="transactions"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <Transactions />
              </Suspense>
            }
          />
          <Route
            path="accounts"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <Accounts />
              </Suspense>
            }
          />
          <Route
            path="categories"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <Categories />
              </Suspense>
            }
          />
          <Route
            path="budgets"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <Budgets />
              </Suspense>
            }
          />
          <Route
            path="borrowings-lendings"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <BorrowingsLendings />
              </Suspense>
            }
          />
          <Route
            path="reports"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <Reports />
              </Suspense>
            }
          />
          <Route
            path="exchange-rates"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <ExchangeRates />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <Settings />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
      <InstallPrompt />
    </>
  );
}

export default App;
