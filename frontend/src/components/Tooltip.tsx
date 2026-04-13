import { useState, useRef, useEffect } from 'react'

interface Props {
  text: string
  children: React.ReactElement
  side?: 'top' | 'bottom'
}

export default function Tooltip({ text, children, side = 'bottom' }: Props) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    timerRef.current = setTimeout(() => setVisible(true), 400)
  }
  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <div className="relative flex items-center" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <div className={`
          absolute z-50 whitespace-nowrap px-2 py-1 rounded
          bg-navy-800 border border-navy-700 text-white text-xs shadow-lg
          pointer-events-none
          ${side === 'bottom'
            ? 'top-full mt-1.5 left-1/2 -translate-x-1/2'
            : 'bottom-full mb-1.5 left-1/2 -translate-x-1/2'}
        `}>
          {text}
        </div>
      )}
    </div>
  )
}
