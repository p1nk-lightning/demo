import { type FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, Mail, Send } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { resendVerification, verifyEmail } from '@/lib/auth';
import { useAuthStore } from '@/store/useAuthStore';

type VerificationStatus = 'idle' | 'verifying' | 'verified' | 'error';

export function VerifyEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const hydrate = useAuthStore((state) => state.hydrate);
  const registrationState = location.state as { verificationEmailSent?: boolean } | null;
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<VerificationStatus>('idle');
  const [serverChecked, setServerChecked] = useState(false);
  const [message, setMessage] = useState(() => (
    registrationState?.verificationEmailSent === false
      ? '账号已创建，但验证码邮件暂未发出，请重新发送。'
      : '验证码已发送到你的邮箱，请查收邮件。'
  ));
  const [sending, setSending] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(
    registrationState?.verificationEmailSent === undefined ? 0 : 60,
  );

  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [secondsRemaining]);

  useEffect(() => {
    let active = true;
    setServerChecked(false);
    void hydrate().then((result) => {
      if (!active) return;
      if (result === 'authenticated') {
        setServerChecked(true);
      } else if (result === 'unavailable') {
        setStatus('error');
        setMessage('暂时无法确认邮箱状态，请检查网络后刷新页面。');
      } else {
        setStatus('error');
        setMessage('请先登录后再验证邮箱。');
      }
    });
    return () => {
      active = false;
    };
  }, [hydrate]);

  useEffect(() => {
    if (!serverChecked) return;
    if (!user?.emailVerified) return;
    if (status === 'verifying') return;
    setStatus('verified');
    setMessage('这个邮箱之前已经验证过，无需再次输入验证码。');
  }, [serverChecked, user?.emailVerified]);

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setStatus('error');
      setMessage('请输入 6 位数字验证码。');
      return;
    }
    setStatus('verifying');
    try {
      await verifyEmail(code);
      await hydrate();
      setStatus('verified');
      setMessage('邮箱已验证，现在可以生成文章。');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '验证码错误，请重试。');
    }
  }

  async function handleResend() {
    if (sending || secondsRemaining > 0) return;
    setSending(true);
    setSecondsRemaining(60);
    try {
      const result = await resendVerification();
      setCode('');
      if (result.alreadyVerified) {
        await hydrate();
        setStatus('verified');
        setMessage('这个邮箱之前已经验证过，无需再次输入验证码。');
      } else {
        setStatus('idle');
        setMessage('新的验证码已发送，请查收邮箱。');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '邮件发送失败，请稍后重试。');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas px-5 py-10 sm:grid sm:place-items-center sm:py-16">
      <main className="w-full max-w-md rounded-lg border border-ink-200 bg-white p-6 shadow-card sm:p-8">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-50 text-brand-700">
          {status === 'verified' ? <CheckCircle2 size={23} /> : <Mail size={23} />}
        </span>
        <h1 className="mt-5 text-2xl font-bold text-ink-950">验证邮箱</h1>
        <p className="mt-3 leading-7 text-ink-500">{message}</p>
        {user && <p className="mt-3 text-sm text-ink-400">{user.email}</p>}

        {status !== 'verified' && (
          <form className="mt-6 space-y-4" onSubmit={handleVerify}>
            <label className="block">
              <span className="field-label">6 位验证码</span>
              <input
                className="field-control text-center text-xl tracking-[0.35em]"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                aria-label="6 位验证码"
              />
            </label>
            <Button type="submit" fullWidth loading={status === 'verifying'} disabled={code.length !== 6}>验证邮箱</Button>
          </form>
        )}

        <div className="mt-7 flex flex-wrap gap-3">
          {status === 'verified' ? (
            <Button onClick={() => navigate('/', { replace: true })}>进入首页</Button>
          ) : (
            <Button
              onClick={() => void handleResend()}
              loading={sending}
              disabled={secondsRemaining > 0}
              variant="secondary"
              trailing={<Send size={16} />}
            >
              {secondsRemaining > 0 ? `重新发送验证码 (${secondsRemaining}s)` : '重新发送验证码'}
            </Button>
          )}
          <Link className="btn-base border border-ink-200 px-4 py-2 text-sm text-ink-700 hover:bg-ink-50" to="/">返回首页</Link>
        </div>
      </main>
    </div>
  );
}
