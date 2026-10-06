import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from './ErrorText'

/** Load something once (and again when `reload()` is called). */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setData(await load())
      setError(null)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
    // (re-created only when the caller's deps change)
  }, deps)

  useEffect(() => {
    reload()
  }, [reload])

  return { data, error, loading, reload, setData }
}
