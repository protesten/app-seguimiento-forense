import { useEffect, useRef, useState } from 'react'
import {
  crearArchivo,
  crearDestinatario,
  eliminarDestinatario,
  esPdf,
  listarArchivos,
  listarDestinatarios,
  ocultarMarca,
  ocultarMarcaLote,
} from '../api'

function filaVacia() {
  return { nombre: '', email: '', destinatarioGuardadoId: '', guardarDestinatario: false }
}

function MarcarImagen() {
  const [archivos, setArchivos] = useState([])
  const [archivoId, setArchivoId] = useState('')
  const [mostrarNuevoArchivo, setMostrarNuevoArchivo] = useState(false)
  const [nuevoNombreArchivo, setNuevoNombreArchivo] = useState('')
  const [creandoArchivo, setCreandoArchivo] = useState(false)

  const [destinatariosGuardados, setDestinatariosGuardados] = useState([])
  const [mostrarGestionDestinatarios, setMostrarGestionDestinatarios] = useState(false)

  const idContador = useRef(0)
  const [filas, setFilas] = useState([{ id: 0, ...filaVacia() }])

  const [archivo, setArchivo] = useState(null)
  const [idUsuario, setIdUsuario] = useState('')
  const [formaEntrega, setFormaEntrega] = useState('descargar')

  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [resultado, setResultado] = useState(null)

  const esArchivoPdf = archivo ? esPdf(archivo) : false
  const esLote = filas.length > 1

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
      setDestinatariosGuardados(lista)
    } catch {
      setDestinatariosGuardados([])
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

  function actualizarFila(id, cambios) {
    setFilas((previas) => previas.map((fila) => (fila.id === id ? { ...fila, ...cambios } : fila)))
  }

  function manejarSeleccionarDestinatarioGuardado(id, destinatarioGuardadoId) {
    const encontrado = destinatariosGuardados.find((d) => d.id === destinatarioGuardadoId)
    actualizarFila(id, {
      destinatarioGuardadoId,
      nombre: encontrado ? encontrado.nombre : '',
      email: encontrado ? encontrado.email : '',
      guardarDestinatario: false,
    })
  }

  function anadirFila() {
    idContador.current += 1
    setFilas((previas) => [...previas, { id: idContador.current, ...filaVacia() }])
  }

  function quitarFila(id) {
    setFilas((previas) => (previas.length > 1 ? previas.filter((fila) => fila.id !== id) : previas))
  }

  async function manejarEliminarDestinatarioGuardado(id) {
    try {
      await eliminarDestinatario(id)
      setDestinatariosGuardados((previos) => previos.filter((d) => d.id !== id))
      setFilas((previas) =>
        previas.map((fila) => (fila.destinatarioGuardadoId === id ? { ...fila, destinatarioGuardadoId: '' } : fila))
      )
    } catch (err) {
      setError(err.message)
    }
  }

  async function guardarNuevosDestinatarios() {
    for (const fila of filas) {
      if (fila.guardarDestinatario && !fila.destinatarioGuardadoId && fila.nombre && fila.email) {
        try {
          const nuevo = await crearDestinatario(fila.nombre, fila.email)
          setDestinatariosGuardados((previos) => [...previos, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)))
        } catch {
          // Si ya estaba guardado (mismo email) o falla, no bloqueamos el resultado principal.
        }
      }
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
      const enviarPorEmail = formaEntrega === 'email'

      if (esLote) {
        const destinatarios = filas.map((fila) => ({ nombre: fila.nombre, email: fila.email }))
        const resultadoLote = await ocultarMarcaLote({ archivo, destinatarios, archivoId, enviarPorEmail })
        if (enviarPorEmail) {
          setResultado({
            enviado: true,
            lote: true,
            enviados: resultadoLote.enviados ?? [],
            fallidos: resultadoLote.fallidos ?? [],
          })
        } else {
          setResultado({ lote: true, url: URL.createObjectURL(resultadoLote.blob) })
        }
      } else {
        const fila = filas[0]
        const resultadoMarcado = await ocultarMarca({
          archivo,
          idUsuario,
          nombreDestinatario: fila.nombre,
          emailDestinatario: fila.email,
          archivoId,
          enviarPorEmail,
        })
        if (enviarPorEmail) {
          setResultado({ enviado: true, esPdf: resultadoMarcado.esPdf, email: fila.email })
        } else {
          setResultado({ url: URL.createObjectURL(resultadoMarcado.blob), esPdf: resultadoMarcado.esPdf })
        }
      }

      await guardarNuevosDestinatarios()
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

        {!esLote && (
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
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-slate-700">
              {esLote ? `Destinatarios (${filas.length})` : 'Destinatario'}
            </label>
            {destinatariosGuardados.length > 0 && (
              <button
                type="button"
                onClick={() => setMostrarGestionDestinatarios((v) => !v)}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                Gestionar guardados
              </button>
            )}
          </div>

          {mostrarGestionDestinatarios && (
            <div className="border border-slate-200 rounded-md divide-y divide-slate-100 mb-3">
              {destinatariosGuardados.map((d) => (
                <div key={d.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                  <span className="text-slate-600">{d.nombre} ({d.email})</span>
                  <button
                    type="button"
                    onClick={() => manejarEliminarDestinatarioGuardado(d.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {filas.map((fila, indice) => (
              <div key={fila.id} className={esLote ? 'border border-slate-200 rounded-md p-3' : ''}>
                {esLote && (
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-500">Destinatario {indice + 1}</span>
                    <button
                      type="button"
                      onClick={() => quitarFila(fila.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Quitar
                    </button>
                  </div>
                )}

                {destinatariosGuardados.length > 0 && (
                  <select
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-2"
                    value={fila.destinatarioGuardadoId}
                    onChange={(evento) => manejarSeleccionarDestinatarioGuardado(fila.id, evento.target.value)}
                  >
                    <option value="">Escribir uno nuevo...</option>
                    {destinatariosGuardados.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre} ({d.email})
                      </option>
                    ))}
                  </select>
                )}

                <input
                  type="text"
                  required
                  placeholder="Nombre del destinatario"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-2"
                  value={fila.nombre}
                  onChange={(evento) => actualizarFila(fila.id, { nombre: evento.target.value, destinatarioGuardadoId: '' })}
                />
                <input
                  type="email"
                  required
                  placeholder="Email del destinatario"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  value={fila.email}
                  onChange={(evento) => actualizarFila(fila.id, { email: evento.target.value, destinatarioGuardadoId: '' })}
                />

                {!fila.destinatarioGuardadoId && (
                  <label className="flex items-center gap-2 text-xs text-slate-500 mt-2">
                    <input
                      type="checkbox"
                      checked={fila.guardarDestinatario}
                      onChange={(evento) => actualizarFila(fila.id, { guardarDestinatario: evento.target.checked })}
                    />
                    Guardar este destinatario para la próxima vez
                  </label>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={anadirFila}
            className="mt-3 text-sm text-slate-600 border border-slate-300 rounded-md px-3 py-1.5 hover:bg-slate-50"
          >
            + Añadir otro destinatario
          </button>
          {esLote && (
            <p className="text-xs text-slate-400 mt-2">
              Se generará automáticamente un código único para cada destinatario — no hace falta que escribas ninguno.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Al terminar de marcar</label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="radio"
                name="forma_entrega"
                value="descargar"
                checked={formaEntrega === 'descargar'}
                onChange={() => setFormaEntrega('descargar')}
              />
              {esLote ? 'Descargar todos los archivos marcados (.zip)' : 'Descargar el archivo marcado (yo lo envío a mano)'}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="radio"
                name="forma_entrega"
                value="email"
                checked={formaEntrega === 'email'}
                onChange={() => setFormaEntrega('email')}
              />
              {esLote ? 'Enviar cada copia por email a su destinatario' : 'Enviarlo directamente por email al destinatario'}
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={cargando}
          className="w-full bg-slate-800 text-white rounded-md py-2.5 font-medium hover:bg-slate-900 disabled:opacity-50"
        >
          {cargando
            ? formaEntrega === 'email'
              ? 'Marcando y enviando...'
              : 'Marcando archivo...'
            : formaEntrega === 'email'
              ? esLote
                ? `Marcar y enviar a ${filas.length} destinatarios`
                : 'Marcar y enviar por email'
              : esLote
                ? `Marcar ${filas.length} copias`
                : 'Marcar archivo y guardar registro'}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
      )}

      {resultado && resultado.lote && resultado.enviado && (
        <div className="border border-emerald-200 bg-emerald-50 rounded-md p-4 space-y-2 text-left">
          <p className="text-sm text-emerald-700 font-medium">
            {resultado.enviados.length} de {resultado.enviados.length + resultado.fallidos.length} copias enviadas correctamente.
          </p>
          {resultado.fallidos.length > 0 && (
            <div className="text-xs text-red-600 space-y-1">
              {resultado.fallidos.map((f) => (
                <p key={f.email}>⚠️ No se pudo enviar a {f.email}: {f.error}</p>
              ))}
            </div>
          )}
          <p className="text-xs text-emerald-600">Los registros se guardaron en la base de datos.</p>
        </div>
      )}

      {resultado && resultado.lote && !resultado.enviado && (
        <div className="border border-emerald-200 bg-emerald-50 rounded-md p-4 space-y-3 text-left">
          <p className="text-sm text-emerald-700 font-medium">
            Todas las copias se marcaron correctamente. Los registros se guardaron en la base de datos.
          </p>
          <a
            href={resultado.url}
            download="documentos_marcados.zip"
            className="inline-block text-sm bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700"
          >
            Descargar todas (.zip)
          </a>
        </div>
      )}

      {resultado && !resultado.lote && resultado.enviado && (
        <div className="border border-emerald-200 bg-emerald-50 rounded-md p-4 space-y-1 text-left">
          <p className="text-sm text-emerald-700 font-medium">
            Archivo marcado y enviado por email a {resultado.email}.
          </p>
          <p className="text-xs text-emerald-600">El registro se guardó en la base de datos.</p>
        </div>
      )}

      {resultado && !resultado.lote && !resultado.enviado && (
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
