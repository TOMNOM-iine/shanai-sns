'use client'

import { ReactNode } from 'react'
import SupabaseProvider from './SupabaseProvider'

interface ProvidersProps {
  children: ReactNode
}

export default function Providers({ children }: ProvidersProps) {
  return (
    <SupabaseProvider>
      {children}
    </SupabaseProvider>
  )
}
