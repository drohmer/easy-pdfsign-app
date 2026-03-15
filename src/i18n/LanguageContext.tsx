import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import translations, { type Language, type TranslationKey } from './translations'

interface LanguageContextValue {
  language: Language
  toggleLanguage: () => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue>(null!)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(
    () => (localStorage.getItem('language') as Language) || 'fr'
  )

  const toggleLanguage = useCallback(() => {
    setLanguage(prev => {
      const next = prev === 'fr' ? 'en' : 'fr'
      localStorage.setItem('language', next)
      return next
    })
  }, [])

  const t = useCallback(
    (key: TranslationKey) => translations[language][key],
    [language]
  )

  return (
    <LanguageContext value={{ language, toggleLanguage, t }}>
      {children}
    </LanguageContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage() {
  return useContext(LanguageContext)
}
