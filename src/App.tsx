import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ToastHost } from '@/components/ui/Toast';
import { useAuthStore } from '@/store/useAuthStore';
import { setLocalOwnerId } from '@/lib/localScope';
import { useSyncStore } from '@/lib/sync';
import { useAppStore } from '@/store/useAppStore';

const HomePage = lazy(() => import('@/pages/HomePage').then((module) => ({ default: module.HomePage })));
const ReadingPage = lazy(() => import('@/pages/ReadingPage').then((module) => ({ default: module.ReadingPage })));
const HistoryPage = lazy(() => import('@/pages/HistoryPage').then((module) => ({ default: module.HistoryPage })));
const LibraryPage = lazy(() => import('@/pages/LibraryPage').then((module) => ({ default: module.LibraryPage })));
const ImportPage = lazy(() => import('@/pages/ImportPage').then((module) => ({ default: module.ImportPage })));
const AuthPage = lazy(() => import('@/pages/AuthPage').then((module) => ({ default: module.AuthPage })));
const VerifyEmailPage = lazy(() => import('@/pages/VerifyEmailPage').then((module) => ({ default: module.VerifyEmailPage })));

function PageLoader() {
  return (
    <div className="mx-auto flex min-h-[45vh] max-w-7xl items-center justify-center px-5 text-sm text-ink-400">
      正在打开…
    </div>
  );
}

export function App() {
  const hydrateAuth = useAuthStore((state) => state.hydrate);
  const user = useAuthStore((state) => state.user);
  const authStatus = useAuthStore((state) => state.status);
  const startForUser = useSyncStore((state) => state.startForUser);
  const resetSync = useSyncStore((state) => state.reset);
  const resetSessionState = useAppStore((state) => state.resetSessionState);

  useEffect(() => {
    void hydrateAuth();
  }, [hydrateAuth]);

  useEffect(() => {
    resetSessionState();
    if (authStatus === 'authenticated' && user) {
      void startForUser(user.id);
    } else if (authStatus === 'unauthenticated' || authStatus === 'unavailable') {
      setLocalOwnerId(null);
      resetSync();
    }
  }, [authStatus, resetSessionState, resetSync, startForUser, user]);

  return (
    <HashRouter>
      <ToastHost />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/library/import" element={<ImportPage />} />
            <Route path="/reading/:articleId" element={<ReadingPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/vocab" element={<Navigate to="/library" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
