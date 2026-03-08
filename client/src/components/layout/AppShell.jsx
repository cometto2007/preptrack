import { Download, X } from 'lucide-react';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

export default function AppShell({ children }) {
  const { canInstall, install, dismiss } = useInstallPrompt();

  return (
    <div className="flex h-dvh bg-bg-app text-slate-100 overflow-hidden">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Install banner — shown only when native install is available */}
        {canInstall && (
          <div className="md:hidden flex items-center justify-between gap-3 px-4 py-2.5 bg-primary/10 border-b border-primary/20 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Download size={15} className="text-primary shrink-0" />
              <p className="text-xs text-slate-300 truncate">
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
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto md:pb-0 pb-16">
          {children}
        </main>

        {/* Mobile bottom nav — hidden on desktop */}
        <BottomNav />
      </div>
    </div>
  );
}
