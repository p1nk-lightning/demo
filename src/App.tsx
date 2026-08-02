import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ToastHost } from '@/components/ui/Toast';

const HomePage = lazy(() => import('@/pages/HomePage').then((module) => ({ default: module.HomePage })));
const ReadingPage = lazy(() => import('@/pages/ReadingPage').then((module) => ({ default: module.ReadingPage })));
const HistoryPage = lazy(() => import('@/pages/HistoryPage').then((module) => ({ default: module.HistoryPage })));
const LibraryPage = lazy(() => import('@/pages/LibraryPage').then((module) => ({ default: module.LibraryPage })));
const ImportPage = lazy(() => import('@/pages/ImportPage').then((module) => ({ default: module.ImportPage })));
const ApiSettingsPage = lazy(() => import('@/pages/ApiSettingsPage').then((module) => ({ default: module.ApiSettingsPage })));

function PageLoader() {
  return (
    <div className="mx-auto flex min-h-[45vh] max-w-7xl items-center justify-center px-5 text-sm text-ink-400">
      正在打开…
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <ToastHost />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/library/import" element={<ImportPage />} />
            <Route path="/reading/:articleId" element={<ReadingPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/settings/api" element={<ApiSettingsPage />} />
            <Route path="/vocab" element={<Navigate to="/library" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
