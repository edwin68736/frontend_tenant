import { Construction } from 'lucide-react'

interface Props {
  title: string
  description?: string
  apiEndpoints?: string[]
}

export default function PagePlaceholder({ title, description, apiEndpoints }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-800">{title}</h2>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>

      <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
        <Construction size={40} className="text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Página en construcción</p>
        <p className="text-gray-400 text-sm mt-1">
          Conecta esta vista con la API REST disponible
        </p>
      </div>

      {apiEndpoints && apiEndpoints.length > 0 && (
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5">
          <h3 className="text-xs font-semibold uppercase text-slate-400 mb-3 tracking-wider">
            Endpoints API disponibles
          </h3>
          <div className="space-y-1.5">
            {apiEndpoints.map(ep => {
              const [method, ...rest] = ep.split(' ')
              const path = rest.join(' ')
              const colors: Record<string, string> = {
                GET: 'bg-blue-100 text-blue-700',
                POST: 'bg-green-100 text-green-700',
                PUT: 'bg-yellow-100 text-yellow-700',
                PATCH: 'bg-orange-100 text-orange-700',
                DELETE: 'bg-red-100 text-red-700',
              }
              return (
                <div key={ep} className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-md font-mono ${colors[method] ?? 'bg-gray-100 text-gray-600'}`}>
                    {method}
                  </span>
                  <code className="text-xs text-slate-600 font-mono">{path}</code>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
