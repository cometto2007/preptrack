import { useState, useEffect, useCallback } from 'react';
import { mealieApi } from '../services/api';
import { localDateStr } from '../utils/dates';

export function useMealiePlan(days = 7) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const start = localDateStr();
      const result = await mealieApi.getMealPlan(start, days);
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}
