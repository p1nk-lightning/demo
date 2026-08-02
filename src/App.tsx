import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { ReadingPage } from './pages/ReadingPage';
import { HistoryPage } from './pages/HistoryPage';
import { VocabPage } from './pages/VocabPage';
import { ToastHost } from './components/ui/Toast';

export function App() {
  return (
    <HashRouter>
      <ToastHost />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/vocab" element={<VocabPage />} />
        <Route path="/reading/:articleId" element={<ReadingPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
