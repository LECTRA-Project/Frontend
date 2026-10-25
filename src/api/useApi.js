import { useCallback, useEffect, useRef, useState } from "react";

/*
  useApi — run a service function from a component and track its state.

    // Load on mount (GET):
    const { data, error, loading, refetch } = useApi(getPosts, { immediate: true });

    // Run on demand (POST):
    const { execute, loading } = useApi(createPost);
    await execute({ title, body });

  `request` receives the arguments you pass to execute(); for immediate calls it gets
  { signal } so the request is cancelled if the component unmounts.
*/
export function useApi(request, { immediate = false } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(immediate);

  // Always call the latest `request` without making execute() change identity.
  const requestRef = useRef(request);
  useEffect(() => {
    requestRef.current = request;
  });

  const execute = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const result = await requestRef.current(...args);
      setData(result);
      return result;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load: `loading` already starts as true, so state is only set once the request settles.
  useEffect(() => {
    if (!immediate) return undefined;
    const controller = new AbortController();
    requestRef.current({ signal: controller.signal }).then(
      (result) => {
        setData(result);
        setLoading(false);
      },
      (err) => {
        if (controller.signal.aborted) return;
        setError(err);
        setLoading(false);
      }
    );
    return () => controller.abort();
  }, [immediate]);

  const refetch = useCallback(() => execute(), [execute]);

  return { data, error, loading, execute, refetch };
}
