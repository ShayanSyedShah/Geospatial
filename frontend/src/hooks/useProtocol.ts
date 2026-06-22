import { useEffect, useState } from 'react';
import type { ProtocolResult } from '../types';
import { api } from '../services/api';

export function useProtocol(id: string): {
  data: ProtocolResult | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<ProtocolResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .protocol(id)
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setData(null);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { data, loading, error };
}
