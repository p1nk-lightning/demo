import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AppErrorFallback } from './AppErrorFallback';

function ThrowingChild(): never {
  throw new Error('模拟渲染崩溃');
}

afterEach(cleanup);

describe('AppErrorFallback', () => {
  it('renders brand copy with recovery actions; details only in dev mode', () => {
    render(<AppErrorFallback error={new Error('secret internals')} resetErrorBoundary={() => {}} devDetails={false} />);
    expect(screen.getByText('页面出错了 — 你的数据没有丢。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '回到首页' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '刷新' })).toBeInTheDocument();
    // devDetails=false(即生产模式)不显示错误详情
    expect(screen.queryByText(/secret internals/)).not.toBeInTheDocument();
  });

  it('shows error details in dev mode', () => {
    render(<AppErrorFallback error={new Error('dev only detail')} resetErrorBoundary={() => {}} devDetails />);
    expect(screen.getByText(/dev only detail/)).toBeInTheDocument();
  });

  it('ErrorBoundary catches child render errors and shows the fallback', async () => {
    const ErrorBoundary = (await import('react-error-boundary')).ErrorBoundary;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary FallbackComponent={AppErrorFallback}>
        <ThrowingChild />
      </ErrorBoundary>,
    );
    expect(await screen.findByText('页面出错了 — 你的数据没有丢。')).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
