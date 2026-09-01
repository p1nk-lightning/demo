// 渲染异常兜底(AC-007):品牌文案 + 回到首页/刷新;开发模式附错误信息。
import { FallbackProps } from 'react-error-boundary';

interface AppErrorFallbackProps extends FallbackProps {
  /** 开发模式下展示错误详情,便于定位 */
  devDetails?: boolean;
}

export function AppErrorFallback({ error, resetErrorBoundary, devDetails }: AppErrorFallbackProps) {
  const isDev = devDetails ?? import.meta.env.DEV;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div
      role="alert"
      className="flex min-h-[45vh] flex-col items-center justify-center px-5 py-12 text-center"
    >
      <div className="text-5xl" aria-hidden>🛠️</div>
      <h1 className="mt-4 text-lg font-bold text-ink-900">页面出错了 — 你的数据没有丢。</h1>
      <p className="mt-2 max-w-md text-sm text-ink-500">刷新重试，或回到首页。如果反复出现，请把下面的时间告诉管理员。</p>
      <p className="mt-1 text-xs text-ink-400">{new Date().toLocaleString()}</p>
      {isDev && (
        <pre className="mt-4 max-w-xl overflow-auto rounded-lg bg-ink-50 p-3 text-left text-xs text-red-700">
          {message}
        </pre>
      )}
      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg border border-ink-200 px-4 py-2 text-sm text-ink-700 hover:bg-ink-50"
        >
          刷新
        </button>
        <button
          type="button"
          onClick={resetErrorBoundary}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700"
        >
          回到首页
        </button>
      </div>
    </div>
  );
}
