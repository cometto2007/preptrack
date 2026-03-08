import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  Package,
  PlusCircle,
  Settings,
} from 'lucide-react';

const navItems = [
  { to: '/',         label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/plan',     label: 'Meal Plan', Icon: Calendar },
  { to: '/recipes',  label: 'Inventory', Icon: Package },
  { to: '/add',      label: 'Add Item',  Icon: PlusCircle },
  { to: '/settings', label: 'Settings',  Icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-slate-800 bg-bg-app flex-shrink-0">
      {/* Logo */}
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white flex-shrink-0">
          <Package size={20} strokeWidth={2} />
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight leading-none">PrepTrack</h1>
          <p className="text-xs text-slate-400 mt-0.5">Meal Prep Manager</p>
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
                  ? 'bg-primary/10 text-primary'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
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
      <div className="px-6 py-4 border-t border-slate-800">
        <p className="text-xs text-slate-500">PrepTrack v1.0</p>
      </div>
    </aside>
  );
}
