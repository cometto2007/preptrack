import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  Settings,
} from 'lucide-react';

const navItems = [
  { to: '/',         label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/plan',     label: 'Meal Plan', Icon: Calendar },
  { to: '/recipes',  label: 'Recipes',   Icon: BookOpen },
  { to: '/settings', label: 'Settings',  Icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-[#243b56] bg-[#071525] flex-shrink-0">
      {/* Logo */}
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white flex-shrink-0">
          <LayoutDashboard size={20} strokeWidth={2} />
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight leading-none">PrepTrack</h1>
          <p className="text-xs text-[#8ea3bb] mt-0.5">Meal Prep Manager</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-2 space-y-0.5">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#19324a] text-[#9bc0ff]'
                  : 'text-[#8ea3bb] hover:bg-[#0f2338] hover:text-[#e6eef6]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} strokeWidth={isActive ? 2.5 : 1.75} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-[#243b56]">
        <p className="text-xs text-[#6f849b]">PrepTrack v1.0</p>
      </div>
    </aside>
  );
}
