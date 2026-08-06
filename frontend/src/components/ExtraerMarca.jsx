import { useState } from 'react'
import { buscarCopiaPorMarca, extraerMarca } from '../api'

function formatearFecha(fechaIso) {
  try {
    return new Date(fechaIso).toLocaleString()
  } catch {
    return fechaIso
  }
}

function ExtraerMarca() {
  const [archivo, setArchivo] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [idDetectado, setIdDetectado] = useState(null)

  const [buscandoCopia, setBuscandoCopia] = useState(false)
  const [errorCopia, setErrorCopia] = useState(null)
  const [copiasEncontradas, setCopiasEncontradas] = useState(null)

  async function manejarEnviar(evento) {
    evento.preventDefault()
    setError(null)
    setIdDetectado(null)
    setCopiasEncontradas(null)
    setErrorCopia(null)

    if (!archivo) {
      setError('Elige un archivo primero')
      return
    }

    setCargando(true)
    try {
      const resultado = await extraerMarca(archivo)
      setIdDetectado(resultado.ID_Usuario)

      if (resultado.ID_Usuario) {
        setBuscandoCopia(true)
        try {
          const copias = await buscarCopiaPorMarca(resultado.ID_Usuario)
          setCopiasEncontradas(copias)
        } catch (err) {
          setErrorCopia(err.message)
        } finally {
          setBuscandoCopia(false)
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={manejarEnviar} className="space-y-5 text-left">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Archivo sospechoso (imagen o PDF que encontraste filtrado)
          </label>
          <input
            type="file"
            accept="image/*,.pdf,application/pdf"
            onChange={(evento) => setArchivo(evento.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
          />
        </div>

        <button
          type="submit"
          disabled={cargando}
          className="w-full bg-slate-800 text-white rounded-md py-2.5 font-medium hover:bg-slate-900 disabled:opacity-50"
        >
          {cargando ? 'Analizando archivo...' : 'Buscar marca invisible'}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
      )}

      {idDetectado !== null && (
        <div className="border border-slate-200 bg-slate-50 rounded-md p-4 text-left space-y-1">
          <p className="text-sm text-slate-500">Codigo detectado:</p>
          <p className="text-lg font-mono font-semibold text-slate-800">
            {idDetectado || '(vacio - no se encontro ninguna marca legible)'}
          </p>
        </div>
      )}

      {buscandoCopia && (
        <p className="text-sm text-slate-500">Buscando el destinatario en la base de datos...</p>
      )}

      {errorCopia && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{errorCopia}</p>
      )}

      {copiasEncontradas !== null && copiasEncontradas.length === 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          No se encontro ningun registro en Supabase con este codigo, ni siquiera uno parecido.
        </p>
      )}

      {copiasEncontradas !== null && copiasEncontradas.length > 0 && (
        <div className="space-y-3">
          {copiasEncontradas.length > 1 && (
            <p className="text-xs text-amber-600">
              Se encontraron {copiasEncontradas.length} registros (mostrados del mas parecido/reciente al menos).
            </p>
          )}
          {copiasEncontradas.map((copia) => (
            <div
              key={copia.id}
              className={`border rounded-md p-4 text-left space-y-1 ${
                copia.distancia_edicion > 0
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-emerald-200 bg-emerald-50'
              }`}
            >
              {copia.distancia_edicion > 0 && (
                <p className="text-xs font-medium text-amber-700">
                  ⚠ Coincidencia aproximada: el código guardado (<code>{copia.id_unico_marca}</code>) difiere en{' '}
                  {copia.distancia_edicion} caracter{copia.distancia_edicion > 1 ? 'es' : ''} del detectado. Puede deberse
                  a que la imagen se recomprimió mucho. Verifica antes de actuar sobre esta información.
                </p>
              )}
              <p className={`text-sm ${copia.distancia_edicion > 0 ? 'text-amber-900' : 'text-emerald-800'}`}>
                Entregado a: <span className="font-semibold">{copia.nombre_destinatario}</span>
              </p>
              <p className={`text-sm ${copia.distancia_edicion > 0 ? 'text-amber-900' : 'text-emerald-800'}`}>
                {copia.email_destinatario}
              </p>
              <p className={`text-xs ${copia.distancia_edicion > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                Documento: {copia.archivos_originales?.nombre ?? 'sin vincular a un documento'}
              </p>
              <p className={`text-xs ${copia.distancia_edicion > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                Fecha de entrega: {formatearFecha(copia.fecha_envio)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ExtraerMarca
