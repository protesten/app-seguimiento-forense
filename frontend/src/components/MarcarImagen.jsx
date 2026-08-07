import { useEffect, useState } from 'react'
import {
  crearArchivo,
  crearDestinatario,
  eliminarDestinatario,
  esPdf,
  listarArchivos,
  listarDestinatarios,
  ocultarMarca,
} from '../api'

function MarcarImagen() {
  const [archivos, setArchivos] = useState([])
  const [archivoId, setArchivoId] = useState('')
  const [mostrarNuevoArchivo, setMostrarNuevoArchivo] = useState(false)
  const [nuevoNombreArchivo, setNuevoNombreArchivo] = useState('')
  const [creandoArchivo, setCreandoArchivo] = useState(false)

  const [destinatarios, setDestinatarios] = useState([])
  const [destinatarioGuardadoId, setDestinatarioGuardadoId] = useState('')
  const [guardarDestinatario, setGuardarDestinatario] = useState(false)
  const [mostrarGestionDestinatarios, setMostrarGestionDestinatarios] = useState(false)

  const [archivo, setArchivo] = useState(null)
  const [idUsuario, setIdUsuario] = useState('')
  const [nombreDestinatario, setNombreDestinatario] = useState('')
  const [emailDestinatario, setEmailDestinatario] = useState('')

  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [resultado, setResultado] = useState(null)

  const esArchivoPdf = archivo ? esPdf(archivo) : false

  useEffect(() => {
    cargarArchivos()
    cargarDestinatarios()
  }, [])

  async function cargarArchivos() {
    try {
      const lista = await listarArchivos()
      setArchivos(lista)
    } catch {
      // Si Supabase no esta configurado todavia, simplemente dejamos la lista vacia.
      setArchivos([])
    }
  }

  async function cargarDestinatarios() {
    try {
      const lista = await listarDestinatarios()
      setDestinatarios(lista)
    } catch {
      setDestinatarios([])
    }
  }

  async function manejarCrearArchivo() {
    if (!nuevoNombreArchivo.trim()) return
    setCreandoArchivo(true)
    setError(null)
    try {
      const nuevo = await crearArchivo(nuevoNombreArchivo.trim())
      setArchivos((previos) => [nuevo, ...previos])
      setArchivoId(nuevo.id)
      setNuevoNombreArchivo('')
      setMostrarNuevoArchivo(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreandoArchivo(false)
    }
  }

  function manejarSeleccionarDestinatario(id) {
    setDestinatarioGuardadoId(id)
    const encontrado = destinatarios.find((d) => d.id === id)
    if (encontrado) {
      setNombreDestinatario(encontrado.nombre)
      setEmailDestinatario(encontrado.email)
      setGuardarDestinatario(false)
    }
  }

  async function manejarEliminarDestinatario(id) {
    try {
      await eliminarDestinatario(id)
      setDestinatarios((previos) => previos.filter((d) => d.id !== id))
      if (destinatarioGuardadoId === id) setDestinatarioGuardadoId('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function manejarEnviar(evento) {
    evento.preventDefault()
    setError(null)
    setResultado(null)

    if (!archivo) {
      setError('Elige un archivo primero')
      return
    }

    setCargando(true)
    try {
      const { blob, esPdf: fuePdf } = await ocultarMarca({
        archivo,
        idUsuario,
        nombreDestinatario,
        emailDestinatario,
        archivoId,
      })
      setResultado({ url: URL.createObjectURL(blob), esPdf: fuePdf })

      if (guardarDestinatario && !destinatarioGuardadoId) {
        try {
          const nuevo = await crearDestinatario(nombreDestinatario, emailDestinatario)
          setDestinatarios((previos) => [...previos, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)))
        } catch {
          // Si ya estaba guardado (mismo email) o falla, no bloqueamos el resultado principal.
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
            Documento original (opcional)
          </label>
          <div className="flex gap-2">
            <select
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm"
              value={archivoId}
              onChange={(evento) => setArchivoId(evento.target.value)}
            >
              <option value="">Sin vincular a un documento</option>
              {archivos.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setMostrarNuevoArchivo((valor) => !valor)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-md text-slate-600 hover:bg-slate-50"
            >
              + Nuevo
            </button>
          </div>

          {mostrarNuevoArchivo && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                placeholder="Nombre del documento (ej. contrato_2026.pdf)"
                className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm"
                value={nuevoNombreArchivo}
                onChange={(evento) => setNuevoNombreArchivo(evento.target.value)}
              />
              <button
                type="button"
                onClick={manejarCrearArchivo}
                disabled={creandoArchivo}
                className="px-3 py-2 text-sm bg-slate-700 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
              >
                {creandoArchivo ? 'Creando...' : 'Crear'}
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Archivo a marcar (imagen o PDF)</label>
          <input
            type="file"
            accept="image/*,.pdf,application/pdf"
            onChange={(evento) => setArchivo(evento.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
          />
          {esArchivoPdf ? (
            <p className="text-xs text-slate-400 mt-1">
              PDF: la marca sobrevive a reenvios, guardado con otras herramientas y a que alguien borre los metadatos.
              No sobrevive si el PDF se convierte en imagenes (escaneo/impresion).
            </p>
          ) : (
            <p className="text-xs text-slate-400 mt-1">Minimo 256x256 pixeles. Cuanto mas grande, mejor resiste el marcado.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Codigo a esconder (ID_Usuario)
          </label>
          <input
            type="text"
            required
            maxLength={esArchivoPdf ? undefined : 8}
            placeholder="ej. a3f9k2"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            value={idUsuario}
            onChange={(evento) => setIdUsuario(evento.target.value)}
          />
          <p className="text-xs text-slate-400 mt-1">
            {esArchivoPdf
              ? 'En PDF no hay limite de longitud, pero un codigo corto es igual de suficiente.'
              : 'Maximo 8 caracteres. Usa un codigo corto, no el nombre real.'}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-slate-700">Destinatario</label>
            {destinatarios.length > 0 && (
              <button
                type="button"
                onClick={() => setMostrarGestionDestinatarios((v) => !v)}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                Gestionar guardados
              </button>
            )}
          </div>

          {destinatarios.length > 0 && (
            <select
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-2"
              value={destinatarioGuardadoId}
              onChange={(evento) => manejarSeleccionarDestinatario(evento.target.value)}
            >
              <option value="">Escribir uno nuevo...</option>
              {destinatarios.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre} ({d.email})
                </option>
              ))}
            </select>
          )}

          {mostrarGestionDestinatarios && (
            <div className="border border-slate-200 rounded-md divide-y divide-slate-100 mb-2">
              {destinatarios.map((d) => (
                <div key={d.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                  <span className="text-slate-600">{d.nombre} ({d.email})</span>
                  <button
                    type="button"
                    onClick={() => manejarEliminarDestinatario(d.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            type="text"
            required
            placeholder="Nombre del destinatario"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-2"
            value={nombreDestinatario}
            onChange={(evento) => {
              setNombreDestinatario(evento.target.value)
              setDestinatarioGuardadoId('')
            }}
          />
          <input
            type="email"
            required
            placeholder="Email del destinatario"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            value={emailDestinatario}
            onChange={(evento) => {
              setEmailDestinatario(evento.target.value)
              setDestinatarioGuardadoId('')
            }}
          />

          {!destinatarioGuardadoId && (
            <label className="flex items-center gap-2 text-xs text-slate-500 mt-2">
              <input
                type="checkbox"
                checked={guardarDestinatario}
                onChange={(evento) => setGuardarDestinatario(evento.target.checked)}
              />
              Guardar este destinatario para la próxima vez
            </label>
          )}
        </div>

        <button
          type="submit"
          disabled={cargando}
          className="w-full bg-slate-800 text-white rounded-md py-2.5 font-medium hover:bg-slate-900 disabled:opacity-50"
        >
          {cargando ? 'Marcando archivo...' : 'Marcar archivo y guardar registro'}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
      )}

      {resultado && (
        <div className="border border-emerald-200 bg-emerald-50 rounded-md p-4 space-y-3 text-left">
          <p className="text-sm text-emerald-700 font-medium">
            Archivo marcado correctamente. El registro se guardo en la base de datos.
          </p>
          {!resultado.esPdf && (
            <img src={resultado.url} alt="Imagen marcada" className="max-h-64 rounded-md border border-emerald-100" />
          )}
          <a
            href={resultado.url}
            download={resultado.esPdf ? 'documento_marcado.pdf' : 'imagen_marcada.png'}
            className="inline-block text-sm bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700"
          >
            {resultado.esPdf ? 'Descargar PDF marcado' : 'Descargar imagen marcada'}
          </a>
        </div>
      )}
    </div>
  )
}

export default MarcarImagen
