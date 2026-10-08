import { useOutletContext } from 'react-router-dom'

export type LayoutContext = { openNew: () => void }

export const useLayout = () => useOutletContext<LayoutContext>()
