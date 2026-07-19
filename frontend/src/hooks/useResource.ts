import { useEffect, useState } from 'react'
import type { ResourceState } from '../api'

export function useResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  dependencies: readonly unknown[],
  isEmpty: (value: T) => boolean = () => false,
) {
  const [state, setState] = useState<ResourceState<T>>({
    status: 'idle',
    data: null,
    error: '',
  })

  useEffect(() => {
    const controller = new AbortController()
    setState((current) => ({
      ...current,
      status: current.data ? 'stale' : 'loading',
      error: '',
    }))
    loader(controller.signal)
      .then((data) => {
        setState({
          status: isEmpty(data) ? 'empty' : 'ready',
          data,
          error: '',
        })
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setState((current) => ({
          status: 'error',
          data: current.data,
          error: cause instanceof Error ? cause.message : String(cause),
        }))
      })
    return () => controller.abort()
    // The caller intentionally controls request identity through dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)

  return state
}
