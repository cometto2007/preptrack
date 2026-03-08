import { useParams } from 'react-router-dom';

export default function ItemDetail() {
  const { id } = useParams();

  return (
    <div className="p-4 md:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Item Detail</h1>
        <p className="text-sm text-slate-400">Meal #{id}</p>
      </header>

      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <span className="text-3xl">🔍</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-1">Item Detail</h2>
          <p className="text-slate-400 text-sm">Coming in Phase 2 — batch info & activity log</p>
        </div>
      </div>
    </div>
  );
}
