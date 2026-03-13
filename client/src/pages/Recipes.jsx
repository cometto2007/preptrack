import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { mealieApi } from '../services/api';
import { useSettings } from '../hooks/useSettings';
import AddToFreezerSheet from '../components/shared/AddToFreezerSheet';

function SkeletonCard() {
  return (
    <div className="flex items-center gap-4 p-4 bg-slate-900/50 border border-slate-800 rounded-xl animate-pulse">
      <div className="w-14 h-14 rounded-lg bg-slate-800 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-slate-800 rounded w-3/4" />
        <div className="h-3 bg-slate-800 rounded w-full" />
        <div className="h-3 bg-slate-800 rounded w-1/2" />
      </div>
    </div>
  );
}

function RecipeCard({ recipe, onClick }) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = recipe.id && !imgError
    ? `/api/mealie/recipe-image/${recipe.id}`
    : null;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 p-4 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-slate-700 hover:bg-slate-900/80 transition-colors text-left w-full min-h-[72px]"
    >
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={recipe.name}
          onError={() => setImgError(true)}
          className="w-14 h-14 rounded-lg object-cover shrink-0 bg-slate-800"
        />
      ) : (
        <div className="w-14 h-14 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
          <span className="text-2xl">🍽️</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{recipe.name}</p>
        {recipe.description && (
          <p className="text-sm text-slate-400 mt-0.5 line-clamp-2">{recipe.description}</p>
        )}
      </div>
    </button>
  );
}

export default function Recipes() {
  const navigate = useNavigate();
  const rawSettings = useSettings();
  const mealieUrl = rawSettings?.mealie_url?.replace(/\/$/, '') || null;

  const [query, setQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetPrefillName, setSheetPrefillName] = useState('');
  const [sheetPrefillSlug, setSheetPrefillSlug] = useState('');
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  function loadRecipes(q) {
    setLoading(true);
    setError(null);
    mealieApi.searchRecipes(q)
      .then(({ recipes: items }) => setRecipes(items || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  // Load on mount (immediately) and debounce subsequent query changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = query === '' ? 0 : 300;
    debounceRef.current = setTimeout(() => {
      loadRecipes(query);
    }, delay);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  function handleCardClick(recipe) {
    setSheetPrefillName(recipe.name);
    setSheetPrefillSlug(recipe.slug);
    setSheetOpen(true);
  }

  const isMealieNotConfigured = error && error.toLowerCase().includes('configured');

  return (
    <div className="flex flex-col min-h-full pb-24">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-bg-app/80 backdrop-blur-md px-4 py-4 border-b border-slate-800">
        <h1 className="text-xl font-bold tracking-tight mb-3">Recipes</h1>
        {/* Search input */}
        <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus-within:border-primary transition-colors">
          <Search size={16} className="text-slate-500 shrink-0" />
          <input
            aria-label="Search recipes"
            type="search"
            placeholder="Search recipes..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none focus:ring-0 outline-none text-sm placeholder:text-slate-500"
          />
        </div>
      </header>

      <main className="flex-1 p-4 space-y-3">
        {/* Error: Mealie not configured */}
        {isMealieNotConfigured && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <span className="text-3xl">📖</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-1">Mealie Not Connected</h2>
              <p className="text-slate-400 text-sm mb-3">Connect Mealie in Settings to browse recipes.</p>
              <button
                onClick={() => navigate('/settings')}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Go to Settings
              </button>
            </div>
          </div>
        )}

        {/* Other error */}
        {error && !isMealieNotConfigured && (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 text-center">
            <p className="text-slate-400 text-sm">{error}</p>
          </div>
        )}

        {/* Skeleton */}
        {loading && !error && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {/* Recipe list */}
        {!loading && !error && recipes.length > 0 && recipes.map(recipe => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            onClick={() => handleCardClick(recipe)}
          />
        ))}

        {/* Empty state */}
        {!loading && !error && recipes.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center">
              <Search size={24} className="text-slate-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-1">No recipes found</h2>
              <p className="text-slate-400 text-sm">
                {query ? `No results for "${query}"` : 'No recipes available in Mealie.'}
              </p>
            </div>
          </div>
        )}
      </main>

      <AddToFreezerSheet
        isOpen={sheetOpen}
        onClose={() => { setSheetOpen(false); setSheetPrefillName(''); setSheetPrefillSlug(''); }}
        prefillName={sheetPrefillName}
        prefillRecipeSlug={sheetPrefillSlug}
      />
    </div>
  );
}
