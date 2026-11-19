import { useCallback, useEffect, useState } from 'react';
import { listTags, sortTagsForTree, type TagRecord } from '@/lib/tags';

export function useTags() {
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTags(sortTagsForTree(await listTags()));
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { tags, loading, error, reload };
}
