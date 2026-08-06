import { useEffect, useRef, useState } from 'react';

interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  onExpire: () => void;
}

interface TurnstileApi {
  render: (element: HTMLElement, options: {
    sitekey: string;
    callback: (token: string) => void;
    'expired-callback': () => void;
    'error-callback': () => void;
  }) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const scriptId = 'cloudflare-turnstile-script';

export function TurnstileWidget({ onToken, onExpire }: TurnstileWidgetProps) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string>();
  const [ready, setReady] = useState(Boolean(window.turnstile));
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || window.turnstile) return;
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.id = scriptId;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      document.head.appendChild(script);
    }
    const onLoad = () => setReady(true);
    script.addEventListener('load', onLoad);
    return () => script.removeEventListener('load', onLoad);
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey || !ready || !container.current || widgetId.current || !window.turnstile) return;
    widgetId.current = window.turnstile.render(container.current, {
      sitekey: siteKey,
      callback: onToken,
      'expired-callback': onExpire,
      'error-callback': onExpire,
    });
    return () => {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = undefined;
    };
  }, [onExpire, onToken, ready, siteKey]);

  if (!siteKey) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">注册验证尚未配置</p>;
  return <div ref={container} className="min-h-[65px]" />;
}
