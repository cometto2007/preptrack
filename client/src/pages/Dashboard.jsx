export default function Dashboard() {
  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PrepTrack</h1>
          <p className="text-sm text-slate-400">Meal Prep Manager</p>
        </div>
      </header>

      {/* Placeholder content */}
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <span className="text-3xl">🍱</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-1">Dashboard</h2>
          <p className="text-slate-400 text-sm">Coming in Phase 2 — freezer inventory & pending actions</p>
        </div>
      </div>
    </div>
  );
}
