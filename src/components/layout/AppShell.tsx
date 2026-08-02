import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpen,
  History,
  House,
  LibraryBig,
  Settings2,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: '今日阅读', icon: House, end: true },
  { to: '/library', label: '单词表', icon: LibraryBig, end: false },
  { to: '/history', label: '阅读记录', icon: History, end: false },
  { to: '/settings/api', label: 'API 设置', icon: Settings2, end: false },
] as const;

export function AppShell() {
  const location = useLocation();

  return (
    <div className="min-h-full bg-canvas text-ink-900">
      <header className="sticky top-0 z-40 border-b border-ink-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <NavLink to="/" className="group flex items-center gap-3" aria-label="词境首页">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white transition-transform duration-200 group-hover:-rotate-3">
              <BookOpen size={19} strokeWidth={2.2} />
            </span>
            <span>
              <span className="block text-lg font-bold leading-none">词境</span>
              <span className="mt-1 block text-[10px] font-semibold uppercase text-ink-400">
                LexiScene
              </span>
            </span>
          </NavLink>

          <nav className="hidden items-center gap-1 md:flex" aria-label="主导航">
            {NAV_ITEMS.map(({ to, label, end }) => (
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

          <div className="hidden items-center gap-2 text-xs text-ink-400 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            数据仅保存在本机
          </div>
        </div>
      </header>

      <main key={location.pathname} className="page-enter pb-24 md:pb-10">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden"
        aria-label="移动端导航"
      >
        <div className="grid grid-cols-4">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
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
