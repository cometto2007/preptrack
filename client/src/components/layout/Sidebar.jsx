import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Calendar, Settings } from 'lucide-react';

const navItems = [
  { to: '/',         label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/plan',     label: 'Meal Plan', Icon: Calendar },
  { to: '/settings', label: 'Settings',  Icon: Settings },
];

export default function Sidebar({ isOpen, onClose }) {
  return (
    <>
      {/* Backdrop — tablet/laptop only, not needed on xl where sidebar is always open */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/50 z-40 xl:hidden transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Sidebar panel */}
      <aside
        className={`
          fixed left-0 top-0 h-screen w-64 bg-[#071525] border-r border-[#243b56]
          hidden md:flex flex-col z-50
          transition-transform duration-300 ease-in-out
          xl:translate-x-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="py-3 flex items-center justify-center gap-4 border-b border-[#243b56] overflow-hidden">
          <img src="/icons/icon-192x192.png" alt="PrepTrack" className="h-16 w-16 flex-shrink-0 rounded-xl" />
          <div>
            <h1 className="font-bold text-lg tracking-tight leading-none">PrepTrack</h1>
            <p className="text-xs text-[#8ea3bb] mt-0.5">Meal Prep Manager</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-0.5">
          {navItems.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border-l-2 ${
                  isActive
                    ? 'bg-[#19324a] text-[#9bc0ff] border-primary'
                    : 'text-[#8ea3bb] hover:bg-[#0f2338] hover:text-[#e6eef6] border-transparent'
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
    </>
  );
}
