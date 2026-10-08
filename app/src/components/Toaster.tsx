import { useEffect, useState } from 'react'
import { onToast } from '../toast'

export function Toaster() {
  const [items, setItems] = useState<{ id: number; message: string }[]>([])

  useEffect(
    () =>
      onToast((message) => {
        const id = Date.now() + Math.random()
        setItems((xs) => [...xs.slice(-2), { id, message }])
        setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 2200)
      }),
    [],
  )

  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">
          {t.message}
        </div>
      ))}
    </div>
  )
}
