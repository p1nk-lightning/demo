import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { getActiveApiProfile, removeApiProfile, saveApiProfile } from '@/lib/db';
import { testApiConnection } from '@/lib/apiProfiles';
import { useAppStore } from '@/store/useAppStore';
import type { ApiProvider } from '@/types/domain';

const PRESETS: Record<ApiProvider, { name: string; baseUrl: string; model: string }> = {
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  moonshot: { name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  'openai-compatible': { name: 'OpenAI 兼容接口', baseUrl: '', model: '' },
};

export function ApiSettingsPage() {
  const toast = useAppStore((state) => state.toast);
  const [provider, setProvider] = useState<ApiProvider>('deepseek');
  const [name, setName] = useState(PRESETS.deepseek.name);
  const [baseUrl, setBaseUrl] = useState(PRESETS.deepseek.baseUrl);
  const [model, setModel] = useState(PRESETS.deepseek.model);
  const [apiKey, setApiKey] = useState('');
  const [profileId, setProfileId] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getActiveApiProfile().then((profile) => {
      if (!profile) return;
      setProfileId(profile.id);
      setProvider(profile.provider);
      setName(profile.name);
      setBaseUrl(profile.baseUrl);
      setModel(profile.model);
      setApiKey(profile.apiKey);
    });
  }, []);

  function chooseProvider(next: ApiProvider) {
    const preset = PRESETS[next];
    setProvider(next);
    setName(preset.name);
    setBaseUrl(preset.baseUrl);
    setModel(preset.model);
  }

  function valuesValid() {
    if (!baseUrl.trim() || !model.trim() || !apiKey.trim()) {
      toast('请完整填写 API 地址、模型和密钥', 'error');
      return false;
    }
    return true;
  }

  async function test() {
    if (!valuesValid()) return;
    setTesting(true);
    try {
      await testApiConnection({ baseUrl, model, apiKey });
      toast('连接成功，可以开始生成文章', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '连接失败', 'error');
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    if (!valuesValid()) return;
    setSaving(true);
    const profile = await saveApiProfile({ provider, name, baseUrl: baseUrl.replace(/\/$/, ''), model, apiKey });
    setProfileId(profile.id);
    setSaving(false);
    toast('API 配置已保存在当前浏览器', 'success');
  }

  async function remove() {
    if (!profileId || !window.confirm('确定删除当前 API 配置吗？')) return;
    await removeApiProfile(profileId);
    setProfileId('');
    setApiKey('');
    toast('API 配置已删除', 'info');
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 lg:px-8 lg:py-10">
      <div className="mb-8">
        <p className="mb-2 text-sm font-semibold text-brand-700">Bring your own key</p>
        <h1 className="font-display text-4xl font-medium text-ink-950">连接你的 AI</h1>
        <p className="mt-3 max-w-2xl leading-7 text-ink-500">词境使用你的 API 生成专属文章。密钥只保存在这个浏览器中，不会写入云端数据库。</p>
      </div>

      <div className="grid gap-7 lg:grid-cols-[1fr_300px]">
        <section className="rounded-lg border border-ink-200 bg-white p-5 sm:p-7">
          <div className="mb-7">
            <span className="field-label">服务商</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(PRESETS) as ApiProvider[]).map((value) => (
                <button key={value} onClick={() => chooseProvider(value)} className={`min-h-12 rounded-lg border px-3 text-sm font-semibold transition-colors ${provider === value ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500 hover:border-brand-200'}`}>
                  {PRESETS[value].name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <label className="block"><span className="field-label">配置名称</span><input value={name} onChange={(event) => setName(event.target.value)} className="field-control" /></label>
            <label className="block"><span className="field-label">API 地址</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" className="field-control font-mono text-sm" /></label>
            <label className="block"><span className="field-label">模型名称</span><input value={model} onChange={(event) => setModel(event.target.value)} placeholder="model-name" className="field-control font-mono text-sm" /></label>
            <label className="block">
              <span className="field-label">API Key</span>
              <span className="relative block">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" size={17} />
                <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." autoComplete="off" className="field-control px-10 font-mono text-sm" />
                <button type="button" onClick={() => setShowKey((value) => !value)} title={showKey ? '隐藏密钥' : '显示密钥'} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-900">{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </span>
            </label>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <button onClick={test} disabled={testing} className="inline-flex h-11 items-center gap-2 rounded-full border border-ink-300 px-5 text-sm font-semibold hover:border-brand-400 hover:text-brand-700 disabled:opacity-50">
              <CheckCircle2 size={17} /> {testing ? '正在测试…' : '测试连接'}
            </button>
            <button onClick={save} disabled={saving} className="h-11 rounded-full bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{saving ? '保存中…' : '保存配置'}</button>
            {profileId && <button onClick={remove} title="删除配置" className="icon-button ml-auto text-red-500 hover:border-red-200 hover:bg-red-50"><Trash2 size={17} /></button>}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg bg-brand-50 p-5">
            <ShieldCheck className="text-brand-600" size={24} />
            <h2 className="mt-4 font-bold">密钥如何使用</h2>
            <ul className="mt-3 space-y-3 text-sm leading-6 text-ink-500">
              <li>仅保存在当前浏览器的本地数据库</li>
              <li>生成时临时发送给词境 Worker</li>
              <li>不会进入每日推荐数据库</li>
              <li>请勿在公共电脑上保存</li>
            </ul>
          </div>
          <div className="rounded-lg border border-ink-200 bg-white p-5 text-sm leading-6 text-ink-500">
            <strong className="block text-ink-900">第一次配置？</strong>
            DeepSeek 的默认模型是 <code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs">deepseek-chat</code>，填入密钥后先点击“测试连接”。
          </div>
        </aside>
      </div>
    </div>
  );
}
