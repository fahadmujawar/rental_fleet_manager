import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// One request per user and permission, shared by every page. The database still decides each write (RLS).
const cache = new Map<string, Promise<boolean>>()

function loadPermission(userId: string, code: string): Promise<boolean> {
  const key = `${userId}|${code}`
  let request = cache.get(key)
  if (!request) {
    request = Promise.resolve(supabase.rpc('has_permission', { p: code })).then(({ data, error }) => {
      if (error) {
        cache.delete(key) // try again next time
        return false
      }
      return data === true
    })
    cache.set(key, request)
  }
  return request
}

// null while loading, then true or false.
export function usePermission(code: string): boolean | null {
  const { session } = useAuth()
  const userId = session?.user.id
  const [result, setResult] = useState<{ key: string; allowed: boolean } | null>(null)
  const key = `${userId}|${code}`

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    loadPermission(userId, code).then((allowed) => {
      if (!cancelled) setResult({ key: `${userId}|${code}`, allowed })
    })
    return () => {
      cancelled = true
    }
  }, [userId, code])

  if (!userId) return false
  return result?.key === key ? result.allowed : null
}
