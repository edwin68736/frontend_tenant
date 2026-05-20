import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { companyService } from '@/services/company.service'
import { useAuth } from './AuthContext'

// Paletas de colores predefinidas por theme name
const THEMES: Record<string, Record<string, string>> = {
  blue:   { '--p50':'239 246 255','--p100':'219 234 254','--p200':'191 219 254','--p300':'147 197 253','--p400':'96 165 250','--p500':'59 130 246','--p600':'37 99 235','--p700':'29 78 216','--p800':'30 64 175','--p900':'30 58 138','--sidebar-bg':'#0f172a' },
  violet: { '--p50':'245 243 255','--p100':'237 233 254','--p200':'221 214 254','--p300':'196 181 253','--p400':'167 139 250','--p500':'139 92 246','--p600':'124 58 237','--p700':'109 40 217','--p800':'91 33 182','--p900':'76 29 149','--sidebar-bg':'#1e1b4b' },
  emerald:{ '--p50':'236 253 245','--p100':'209 250 229','--p200':'167 243 208','--p300':'110 231 183','--p400':'52 211 153','--p500':'16 185 129','--p600':'5 150 105','--p700':'4 120 87','--p800':'6 95 70','--p900':'6 78 59','--sidebar-bg':'#022c22' },
  rose:   { '--p50':'255 241 242','--p100':'255 228 230','--p200':'254 205 211','--p300':'253 164 175','--p400':'251 113 133','--p500':'244 63 94','--p600':'225 29 72','--p700':'190 18 60','--p800':'159 18 57','--p900':'136 19 55','--sidebar-bg':'#1c0a14' },
  amber:  { '--p50':'255 251 235','--p100':'254 243 199','--p200':'253 230 138','--p300':'252 211 77','--p400':'251 191 36','--p500':'245 158 11','--p600':'217 119 6','--p700':'180 83 9','--p800':'146 64 14','--p900':'120 53 15','--sidebar-bg':'#1c0f00' },
  slate:  { '--p50':'248 250 252','--p100':'241 245 249','--p200':'226 232 240','--p300':'203 213 225','--p400':'148 163 184','--p500':'100 116 139','--p600':'71 85 105','--p700':'51 65 85','--p800':'30 41 59','--p900':'15 23 42','--sidebar-bg':'#020617' },
}

interface ThemeContextType {
  colorTheme: string
  setTheme: (name: string) => void
}

const ThemeContext = createContext<ThemeContextType>({ colorTheme: 'blue', setTheme: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [colorTheme, setColorTheme] = useState('blue')

  const applyTheme = (name: string) => {
    const palette = THEMES[name] ?? THEMES.blue
    const root = document.documentElement
    Object.entries(palette).forEach(([key, val]) => {
      root.style.setProperty(key, val)
    })
    setColorTheme(name)
  }

  useEffect(() => {
    if (!isAuthenticated) return
    companyService.getConfig()
      .then(cfg => applyTheme(cfg.color_theme || 'blue'))
      .catch(() => applyTheme('blue'))
  }, [isAuthenticated])

  return (
    <ThemeContext.Provider value={{ colorTheme, setTheme: applyTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() { return useContext(ThemeContext) }
