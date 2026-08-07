import { useEffect, useState } from 'react'
import { adminEstadisticas } from '../api'

function formatearFecha(fechaIso) {
  try {
    return new Date(fechaIso).toLocaleString()
  } catch {
    return fechaIso
  }
}

function BarraLista({ titulo, items, etiqueta }) {
  const maximo = Math.max(1, ...items.map((item) => item.cantidad))
  return (
    <div>
      <h3 className="text-sm font-medium text-slate-700 mb-2">{titulo}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">Sin datos todavía.</p>
      ) : (
        <div className="space-y-1.5">
          {items.slice(0, 8).map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-32 truncate text-slate-600" title={etiqueta(item)}>
                {etiqueta(item)}
              </span>
              <div className="flex-1 bg-slate-100 rounded h-4 overflow-hidden">
                <div
                  className="bg-slate-500 h-full rounded"
                  style={{ width: `${(item.cantidad / maximo) * 100}%` }}
                />
              </div>
              <span className="w-6 text-right text-slate-500">{item.cantidad}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AdminEstadisticas() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    adminEstadisticas().then(setDatos).catch((err) => setError(err.message))
  }, [])

  if (error) {
    return <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
  }

  if (!datos) {
    return <p className="text-sm text-slate-400">Cargando estadísticas...</p>
  }

  return (
    <div className="space-y-6 text-left">
      <div className="grid grid-cols-2 gap-3">
        <div className="border border-slate-200 rounded-md p-4 text-center">
          <p className="text-2xl font-semibold text-slate-800">{datos.total_archivos}</p>
          <p className="text-xs text-slate-500">Documentos registrados</p>
        </div>
        <div className="border border-slate-200 rounded-md p-4 text-center">
          <p className="text-2xl font-semibold text-slate-800">{datos.total_copias}</p>
          <p className="text-xs text-slate-500">Copias marcadas y entregadas</p>
        </div>
      </div>

      <BarraLista titulo="Copias por documento" items={datos.por_documento} etiqueta={(i) => i.nombre} />
      <BarraLista titulo="Copias por destinatario" items={datos.por_destinatario} etiqueta={(i) => i.nombre} />
      <BarraLista titulo="Copias por día" items={datos.por_fecha} etiqueta={(i) => i.fecha} />

      <div>
        <h3 className="text-sm font-medium text-slate-700 mb-2">Actividad reciente</h3>
        {datos.actividad_reciente.length === 0 ? (
          <p className="text-xs text-slate-400">Sin actividad todavía.</p>
        ) : (
          <div className="border border-slate-200 rounded-md divide-y divide-slate-200">
            {datos.actividad_reciente.map((copia) => (
              <div key={copia.id} className="p-2.5 text-xs">
                <p className="text-slate-700">
                  <span className="font-medium">{copia.nombre_destinatario}</span> ({copia.email_destinatario}) — código{' '}
                  <code className="bg-slate-100 px-1 rounded">{copia.id_unico_marca}</code>
                </p>
                <p className="text-slate-400">
                  {copia.archivos_originales?.nombre ?? 'sin documento vinculado'} · {formatearFecha(copia.fecha_envio)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminEstadisticas
