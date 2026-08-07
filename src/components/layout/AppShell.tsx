import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpen,
  History,
  House,
  LibraryBig,
  LogIn,
  LogOut,
  ShieldCheck,
  Star,
  UserRound,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useSyncStore } from '@/lib/sync';

const NAV_ITEMS = [
  { to: '/', label: '今日阅读', icon: House, end: true },
  { to: '/library', label: '单词表', icon: LibraryBig, end: false },
  { to: '/history', label: '阅读记录', icon: History, end: false },
  { to: '/favorites', label: '我的收藏', icon: Star, end: false },
] as const;

const ADMIN_NAV_ITEM = { to: '/admin/content', label: '内容审核', icon: ShieldCheck, end: false } as const;

export function AppShell() {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const authStatus = useAuthStore((state) => state.status);
  const logout = useAuthStore((state) => state.logout);
  const syncStatus = useSyncStore((state) => state.status);
  const needsMerge = useSyncStore((state) => state.needsMerge);
  const legacyCount = useSyncStore((state) => state.legacyCount);
  const mergeLegacyData = useSyncStore((state) => state.mergeLegacyData);
  const dismissMerge = useSyncStore((state) => state.dismissMerge);
  const dataRevision = useSyncStore((state) => state.dataRevision);
  const navItems = user?.isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;
  const isAdminPage = location.pathname.startsWith('/admin/');
  const syncDotClass = syncStatus === 'syncing'
    ? 'bg-amber-400'
    : syncStatus === 'error'
      ? 'bg-red-400'
      : syncStatus === 'offline'
        ? 'bg-ink-300'
        : 'bg-emerald-400';
  const syncLabel = !user
    ? '本机模式'
    : syncStatus === 'syncing'
    ? '正在同步'
    : syncStatus === 'offline'
      ? '离线模式'
      : syncStatus === 'error'
        ? '同步待重试'
        : '已同步';

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // The local state is cleared by the auth store even when the request cannot finish.
    }
  }

  return (
    <div className="min-h-full bg-canvas text-ink-900">
      <header className="sticky top-0 z-40 border-b border-ink-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <NavLink to="/" className="group flex items-center gap-3" aria-label="词境首页">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white transition-transform duration-200 group-hover:-rotate-3">
              <BookOpen size={19} strokeWidth={2.2} />
            </span>
            <span>
              <span className="flex items-center gap-2 text-lg font-bold leading-none">
                词境
                {isAdminPage && <span className="rounded-full bg-ink-900 px-2 py-1 text-[10px] font-semibold text-white">审核后台</span>}
              </span>
              <span className="mt-1 block text-[10px] font-semibold uppercase text-ink-400">
                LexiScene
              </span>
            </span>
          </NavLink>

          <nav className="hidden items-center gap-1 md:flex" aria-label="主导航">
            {navItems.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-ink-500 hover:bg-ink-50 hover:text-ink-900'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {authStatus === 'authenticated' && user ? (
              <>
                <span className="hidden max-w-[180px] items-center gap-2 text-sm text-ink-600 sm:flex" title={user.email}>
                  <UserRound size={16} className="shrink-0 text-brand-600" />
                  <span className="truncate">{user.email}</span>
                  {user.isAdmin && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">审核员</span>}
                </span>
                <button type="button" className="icon-button h-9 w-9" onClick={() => void handleLogout()} title="退出登录" aria-label="退出登录">
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <NavLink to="/login" className="icon-button h-9 w-9" title="登录" aria-label="登录">
                <LogIn size={17} />
              </NavLink>
            )}
          </div>

          <div className="hidden items-center gap-2 text-xs text-ink-400 sm:flex" title="云端同步状态">
            <span className={'h-2 w-2 rounded-full ' + syncDotClass} />
            {syncLabel}
          </div>
        </div>
      </header>

      {needsMerge && user && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm lg:px-8">
            <span className="text-amber-900">检测到本机有 {legacyCount} 条未绑定账号的数据。</span>
            <span className="flex items-center gap-3">
              <button type="button" onClick={() => void mergeLegacyData()} className="font-semibold text-amber-900 underline underline-offset-4">合并本机数据</button>
              <button type="button" onClick={dismissMerge} className="text-amber-700">稍后处理</button>
            </span>
          </div>
        </div>
      )}
      <main key={location.pathname + ':' + (user?.id ?? 'anonymous') + ':' + dataRevision} className="page-enter pb-24 md:pb-10">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden"
        aria-label="移动端导航"
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium ${
                  isActive ? 'text-brand-700' : 'text-ink-400'
                }`
              }
            >
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
