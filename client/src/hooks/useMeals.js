import { useState, useEffect, useCallback } from 'react';
import { mealsApi } from '../services/api';

export function useMeals(category, options = {}) {
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await mealsApi.list(category, options);
      setMeals(data.meals);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [category, options.includeEmpty]);

  useEffect(() => { load(); }, [load]);

  return { meals, loading, error, reload: load };
}

export function useMeal(id) {
  const [data, setData] = useState(null); // { meal, batches, activity }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await mealsApi.get(id);
      setData(result);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}
