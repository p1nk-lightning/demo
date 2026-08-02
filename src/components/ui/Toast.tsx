import { useAppStore } from '@/store/useAppStore';

export function ToastHost() {
  const m = useAppStore((s) => s.toastMessage);
  if (!m) return null;
  const colorMap = {
    success: 'bg-emerald-600',
    error: 'bg-red-600',
    info: 'bg-slate-700',
  } as const;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-6 z-[100] flex justify-center">
      <div
        className={`pointer-events-auto rounded-lg ${colorMap[m.kind]} px-4 py-2 text-sm text-white shadow-lg`}
      >
        {m.msg}
      </div>
    </div>
  );
}
