import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { AppShell } from '@/components/layout/AppShell';
import { AppErrorFallback } from '@/components/AppErrorFallback';
import { ToastHost } from '@/components/ui/Toast';
import { useAuthStore } from '@/store/useAuthStore';
import { setLocalOwnerId } from '@/lib/localScope';
import { useSyncStore } from '@/lib/sync';
import { useAppStore } from '@/store/useAppStore';
import { getVocabularyItems, listVocabularyLists } from '@/lib/db';

const HomePage = lazy(() => import('@/pages/HomePage').then((module) => ({ default: module.HomePage })));
const ReadingPage = lazy(() => import('@/pages/ReadingPage').then((module) => ({ default: module.ReadingPage })));
const HistoryPage = lazy(() => import('@/pages/HistoryPage').then((module) => ({ default: module.HistoryPage })));
const FavoritesPage = lazy(() => import('@/pages/FavoritesPage').then((module) => ({ default: module.FavoritesPage })));
const LibraryPage = lazy(() => import('@/pages/LibraryPage').then((module) => ({ default: module.LibraryPage })));
const ImportPage = lazy(() => import('@/pages/DocumentImportPage').then((module) => ({ default: module.DocumentImportPage })));
const AuthPage = lazy(() => import('@/pages/AuthPage').then((module) => ({ default: module.AuthPage })));
const VerifyEmailPage = lazy(() => import('@/pages/VerifyEmailPage').then((module) => ({ default: module.VerifyEmailPage })));
const AdminContentPage = lazy(() => import('@/pages/AdminContentPage').then((module) => ({ default: module.AdminContentPage })));
const QuizPage = lazy(() => import('@/pages/QuizPage'));
const StatsPage = lazy(() => import('@/pages/StatsPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'));

function PageLoader() {
  return (
    <div className="mx-auto flex min-h-[45vh] max-w-7xl items-center justify-center px-5 text-sm text-ink-400">
      正在打开…
    </div>
  );
}

function AdminRoute() {
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  if (status === 'loading') return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/" replace />;
  return <AdminContentPage />;
}

function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      FallbackComponent={AppErrorFallback}
      onReset={() => window.location.assign('#/')}
    >
      {children}
    </ErrorBoundary>
  );
}

export function App() {
  const hydrateAuth = useAuthStore((state) => state.hydrate);
  const user = useAuthStore((state) => state.user);
  const authStatus = useAuthStore((state) => state.status);
  const startForUser = useSyncStore((state) => state.startForUser);
  const resetSync = useSyncStore((state) => state.reset);
  const resetSessionState = useAppStore((state) => state.resetSessionState);
  const setWords = useAppStore((state) => state.setWords);

  useEffect(() => {
    void hydrateAuth();
  }, [hydrateAuth]);

  useEffect(() => {
    resetSessionState();
    if (authStatus === 'authenticated' && user) {
      let active = true;
      void startForUser(user.id).then(async () => {
        const lists = await listVocabularyLists();
        const items = lists[0] ? await getVocabularyItems(lists[0].id) : [];
        if (active) setWords(items);
      });
      return () => {
        active = false;
      };
    } else if (authStatus === 'unauthenticated' || authStatus === 'unavailable') {
      setLocalOwnerId(null);
      resetSync();
    }
  }, [authStatus, resetSessionState, resetSync, setWords, startForUser, user]);

  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ErrorBoundary FallbackComponent={AppErrorFallback} onReset={() => window.location.assign('#/')}>
        <ToastHost />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<AuthPage key="login" mode="login" />} />
            <Route path="/register" element={<AuthPage key="register" mode="register" />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/forgot-password" element={<RouteErrorBoundary><ForgotPasswordPage /></RouteErrorBoundary>} />
            <Route path="/reset-password" element={<RouteErrorBoundary><ResetPasswordPage /></RouteErrorBoundary>} />
            <Route element={<AppShell />}>
              <Route path="/" element={<RouteErrorBoundary><HomePage /></RouteErrorBoundary>} />
              <Route path="/library" element={<RouteErrorBoundary><LibraryPage /></RouteErrorBoundary>} />
              <Route path="/library/import" element={<RouteErrorBoundary><ImportPage /></RouteErrorBoundary>} />
              <Route path="/reading/:articleId" element={<RouteErrorBoundary><ReadingPage /></RouteErrorBoundary>} />
              <Route path="/history" element={<RouteErrorBoundary><HistoryPage /></RouteErrorBoundary>} />
              <Route path="/favorites" element={<RouteErrorBoundary><FavoritesPage /></RouteErrorBoundary>} />
              <Route path="/quiz" element={<RouteErrorBoundary><QuizPage /></RouteErrorBoundary>} />
              <Route path="/stats" element={<RouteErrorBoundary><StatsPage /></RouteErrorBoundary>} />
              <Route path="/admin/content" element={<RouteErrorBoundary><AdminRoute /></RouteErrorBoundary>} />
              <Route path="/vocab" element={<Navigate to="/library" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </HashRouter>
  );
}
