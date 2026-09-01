import { type FormEvent, useCallback, useState } from 'react';
import { AtSign, Eye, EyeOff, LockKeyhole, LogIn, UserPlus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { TurnstileWidget } from '@/components/TurnstileWidget';
import { useAuthStore } from '@/store/useAuthStore';

type AuthMode = 'login' | 'register';

interface AuthPageProps {
  mode: AuthMode;
}

export function AuthPage({ mode }: AuthPageProps) {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileAttempt, setTurnstileAttempt] = useState(0);
  const isRegister = mode === 'register';
  const handleTurnstileToken = useCallback((token: string) => setTurnstileToken(token), []);
  const handleTurnstileExpire = useCallback(() => setTurnstileToken(''), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (isRegister && password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    setSubmitting(true);
    try {
      if (isRegister) {
        if (!turnstileToken) {
          setError('请完成人机验证');
          return;
        }
        const result = await register(email.trim(), password, turnstileToken);
        navigate('/verify-email', { replace: true, state: { verificationEmailSent: result.verificationEmailSent } });
      } else {
        await login(email.trim(), password);
        navigate('/', { replace: true });
      }
    } catch (requestError) {
      if (isRegister) {
        setTurnstileToken('');
        setTurnstileAttempt((value) => value + 1);
      }
      setError(requestError instanceof Error ? requestError.message : '暂时无法完成操作，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas px-5 py-10 sm:grid sm:place-items-center sm:py-16">
      <main className="mx-auto w-full max-w-md">
        <Link to="/" className="mb-10 flex items-center justify-center gap-3 text-ink-950" aria-label="返回词境首页">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-600 text-white"><AtSign size={20} /></span>
          <span><span className="block text-xl font-bold leading-none">词境</span><span className="mt-1 block text-[10px] font-semibold uppercase text-ink-400">LexiScene</span></span>
        </Link>

        <section className="rounded-lg border border-ink-200 bg-white p-6 shadow-card sm:p-8">
          <div className="mb-7">
            <p className="text-sm font-semibold text-brand-700">{isRegister ? '创建学习账号' : '欢迎回来'}</p>
            <h1 className="mt-2 font-display text-3xl font-medium text-ink-950">{isRegister ? '使用邮箱注册' : '登录词境'}</h1>
          </div>

          <form className="space-y-5" onSubmit={submit}>
            <label className="block">
              <span className="field-label">邮箱</span>
              <span className="relative block">
                <AtSign className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" size={17} />
                <input className="field-control pl-10" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required />
              </span>
            </label>

            <label className="block">
              <span className="field-label">密码</span>
              <span className="relative block">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" size={17} />
                <input className="field-control px-10" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={8} required />
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-900" type="button" onClick={() => setShowPassword((value) => !value)} title={showPassword ? '隐藏密码' : '显示密码'} aria-label={showPassword ? '隐藏密码' : '显示密码'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </span>
              {isRegister && <span className="mt-2 block text-xs text-ink-400">至少 8 位字符</span>}
            </label>

            {isRegister && <label className="block">
              <span className="field-label">确认密码</span>
              <input className="field-control" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
            </label>}

            {isRegister && <TurnstileWidget key={turnstileAttempt} onToken={handleTurnstileToken} onExpire={handleTurnstileExpire} />}

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

            <Button type="submit" fullWidth size="lg" loading={submitting} disabled={isRegister && !turnstileToken} trailing={isRegister ? <UserPlus size={17} /> : <LogIn size={17} />}>
              {isRegister ? '创建账号' : '登录'}
            </Button>
          </form>

          <p className="mt-7 text-center text-sm text-ink-500">
            {isRegister ? '已有账号？' : '还没有账号？'}
            <Link className="ml-1 font-semibold text-brand-700 hover:text-brand-800" to={isRegister ? '/login' : '/register'}>{isRegister ? '去登录' : '创建账号'}</Link>
          </p>
          {!isRegister && (
            <p className="mt-2 text-center text-sm text-ink-500">
              <Link className="text-brand-600 hover:underline" to="/forgot-password">忘记密码？</Link>
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
