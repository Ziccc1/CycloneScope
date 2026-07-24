// Owner: B — shared presentation helpers for B-owned analytical components.
import type { ReactNode } from 'react'

export const BASIN_COLORS: Record<string, string> = {
  WP: '#62c3c9',
  NA: '#f0a54a',
  EP: '#aa7df5',
  NI: '#ff8b82',
  SI: '#58a6ff',
  AU: '#8fe6d4',
  SP: '#e9b55f',
  SA: '#d27bb5',
}

export const EVENT_COLORS = ['#62c3c9', '#f0a54a', '#aa7df5']

export function formatNumber(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(value)
}

export function formatCompact(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('zh-CN', {
    notation: Math.abs(value) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value)
}

export function median(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value)).sort((a, b) => a - b)
  if (!valid.length) return null
  const middle = Math.floor(valid.length / 2)
  return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2
}

export function extent(values: Array<number | null | undefined>, fallback: [number, number] = [0, 1]): [number, number] {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value))
  if (!valid.length) return fallback
  const minimum = Math.min(...valid)
  const maximum = Math.max(...valid)
  return minimum === maximum ? [Math.min(0, minimum), maximum || 1] : [minimum, maximum]
}

export function scaleLinear(value: number, domain: [number, number], range: [number, number]) {
  const ratio = (value - domain[0]) / Math.max(Number.EPSILON, domain[1] - domain[0])
  return range[0] + Math.max(0, Math.min(1, ratio)) * (range[1] - range[0])
}

export function ComponentState({
  status,
  error,
  empty,
  children,
}: {
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'stale'
  error?: string
  empty?: string
  children: ReactNode
}) {
  if (status === 'loading' || status === 'idle') {
    return <div className="b-state skeleton-state" role="status">正在加载分析数据…</div>
  }
  if (status === 'error' && !children) {
    return <div className="b-state error-state" role="alert">{error || '数据加载失败'}</div>
  }
  if (status === 'empty') {
    return <div className="b-state empty-state">{empty || '当前筛选无数据'}</div>
  }
  return (
    <>
      {status === 'stale' && <div className="b-inline-status" role="status">正在更新…</div>}
      {status === 'error' && error && <div className="b-inline-status error-state" role="alert">{error}</div>}
      {children}
    </>
  )
}

export function ChartHeader({
  eyebrow,
  title,
  meta,
}: {
  eyebrow: string
  title: string
  meta?: ReactNode
}) {
  return (
    <div className="b-chart-header">
      <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>
      {meta && <div className="b-chart-meta">{meta}</div>}
    </div>
  )
}
