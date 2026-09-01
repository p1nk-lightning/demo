// 忘记密码第二步:验证码 + 新密码(AC-006)。成功后所有会话被吊销。
import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { resetPassword } from '@/lib/auth';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const emailFromState = (location.state as { email?: string } | null)?.email ?? '';
  const [email, setEmail] = useState(emailFromState);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('新密码至少 8 位');
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(email.trim(), code.trim(), newPassword);
      setDone(true);
      window.setTimeout(() => navigate('/login', { replace: true }), 1600);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '重置失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-bold text-ink-900">密码已更新 — 用新密码登录吧。</h1>
        <p className="mt-2 text-sm text-ink-500">正在跳转到登录页…</p>
        <div className="mt-4">
          <Link to="/login" className="text-sm text-brand-600 hover:underline">立即登录</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-16">
      <div className="text-center">
        <h1 className="text-xl font-bold text-ink-900">设置新密码</h1>
        <p className="mt-1 text-sm text-ink-500">输入邮件里的 6 位验证码和新密码。</p>
      </div>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="reset-email" className="block text-sm font-medium text-ink-700">邮箱</label>
          <input
            id="reset-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="reset-code" className="block text-sm font-medium text-ink-700">验证码</label>
          <input
            id="reset-code"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            placeholder="6 位数字"
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm tracking-widest focus:border-brand-400 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="reset-password" className="block text-sm font-medium text-ink-700">新密码</label>
          <input
            id="reset-password"
            type="password"
            required
            minLength={8}
            maxLength={128}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="至少 8 位"
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" fullWidth loading={submitting}>重置密码</Button>
      </form>
      <p className="mt-4 text-center text-sm text-ink-500">
        没收到？<Link to="/forgot-password" className="text-brand-600 hover:underline">重新发送验证码</Link>
      </p>
    </div>
  );
}
