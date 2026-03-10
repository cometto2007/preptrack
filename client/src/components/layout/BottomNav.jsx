import { NavLink } from 'react-router-dom';
import { Home, Calendar, BookOpen, Settings } from 'lucide-react';

const navItems = [
  { to: '/',         label: 'Home',     Icon: Home },
  { to: '/plan',     label: 'Plan',     Icon: Calendar },
  { to: '/recipes',  label: 'Recipes',  Icon: BookOpen },
  { to: '/settings', label: 'Settings', Icon: Settings },
];

export default function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0c1724]/95 backdrop-blur-md border-t border-[#243b56] flex justify-around items-center px-2 safe-bottom">
      {navItems.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 py-3 px-4 min-w-[60px] transition-colors ${
              isActive ? 'text-primary' : 'text-[#8ea3bb]'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                size={22}
                strokeWidth={isActive ? 2.5 : 1.75}
                className="transition-all"
              />
              <span className="text-[10px] font-bold uppercase tracking-widest">
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
