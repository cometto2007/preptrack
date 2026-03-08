import Sidebar from './Sidebar';
import BottomNav from './BottomNav';

export default function AppShell({ children }) {
  return (
    <div className="flex h-dvh bg-bg-app text-slate-100 overflow-hidden">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto md:pb-0 pb-16">
          {children}
        </main>

        {/* Mobile bottom nav — hidden on desktop */}
        <BottomNav />
      </div>
    </div>
  );
}
