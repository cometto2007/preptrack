import { useState } from 'react';
import { Download, X, Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

export default function AppShell({ children }) {
  const { canInstall, install, dismiss } = useInstallPrompt();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-dvh bg-[#22364f] text-[#e6eef6] overflow-hidden">
      {/* Sidebar — fixed overlay on md–xl, always visible on xl+ */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Hamburger toggle — tablet/laptop only (md to xl) */}
      <button
        onClick={() => setSidebarOpen(v => !v)}
        aria-label="Open navigation"
        className="hidden md:flex xl:hidden fixed top-[18px] left-4 z-40 w-9 h-9 items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
      >
        <Menu size={20} />
      </button>

      {/* Main content area — offset on xl+ for the permanent sidebar */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-[#22364f] xl:ml-64">
        {/* Install banner — mobile only */}
        {canInstall && (
          <div className="md:hidden flex items-center justify-between gap-3 px-4 py-2.5 bg-primary/10 border-b border-primary/20 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Download size={15} className="text-primary shrink-0" />
              <p className="text-xs text-[#c6d4e2] truncate">
                Add PrepTrack to your home screen for the best experience
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={install}
                className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
              >
                Install
              </button>
              <button
                onClick={dismiss}
                aria-label="Dismiss install banner"
                className="text-[#8ea3bb] hover:text-[#dce7f3] transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto pb-16 md:pb-0 md:px-6 lg:px-8 xl:px-10">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <BottomNav />
      </div>
    </div>
  );
}
