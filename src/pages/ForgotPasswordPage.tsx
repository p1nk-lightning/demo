// 忘记密码第一步:邮箱提交 → 发送重置验证码(AC-006,防枚举统一文案)。
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { requestPasswordReset } from '@/lib/auth';
import { useAuthStore } from '@/store/useAuthStore';

const RESEND_COOLDOWN_S = 60;

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      navigate('/reset-password', { state: { email: email.trim() } });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '暂时无法发送重置邮件，请稍后再试');
      setCooldown(RESEND_COOLDOWN_S); // 失败也进入冷却,防连点
    } finally {
      setSubmitting(false);
    }
  }

  if (user) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-sm text-ink-600">你已登录 — 如需改密请先退出。</p>
        <div className="mt-4">
          <Link to="/" className="text-sm text-brand-600 hover:underline">返回首页</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-16">
      <div className="text-center">
        <KeyRound className="mx-auto text-brand-600" size={36} />
        <h1 className="mt-3 text-xl font-bold text-ink-900">找回密码</h1>
        <p className="mt-1 text-sm text-ink-500">输入注册邮箱，我们会发送 6 位重置验证码。</p>
      </div>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="forgot-email" className="block text-sm font-medium text-ink-700">邮箱</label>
          <input
            id="forgot-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" fullWidth loading={submitting} disabled={cooldown > 0}>
          {cooldown > 0 ? `重新发送（${cooldown}s）` : '发送验证码'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-ink-500">
        想起来了？<Link to="/login" className="text-brand-600 hover:underline">返回登录</Link>
      </p>
    </div>
  );
}
