import { useEffect, useState } from 'react'
import { adminActualizarUsuario, adminCrearUsuario, adminEliminarUsuario, adminListarUsuarios } from '../api'
import { supabase } from '../supabaseClient'

function formatearFecha(fechaIso) {
  if (!fechaIso) return 'nunca'
  try {
    return new Date(fechaIso).toLocaleString()
  } catch {
    return fechaIso
  }
}

function generarPassword() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let resultado = ''
  for (let i = 0; i < 12; i++) {
    resultado += alfabeto[Math.floor(Math.random() * alfabeto.length)]
  }
  return resultado
}

function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [miId, setMiId] = useState(null)

  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [nuevoEmail, setNuevoEmail] = useState('')
  const [nuevoPassword, setNuevoPassword] = useState(generarPassword())
  const [nuevoEsAdmin, setNuevoEsAdmin] = useState(false)
  const [creando, setCreando] = useState(false)
  const [credencialesCreadas, setCredencialesCreadas] = useState(null)

  useEffect(() => {
    cargar()
    supabase.auth.getSession().then(({ data }) => setMiId(data.session?.user?.id))
  }, [])

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const lista = await adminListarUsuarios()
      setUsuarios(lista)
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  async function manejarCrear(evento) {
    evento.preventDefault()
    setError(null)
    setCredencialesCreadas(null)
    setCreando(true)
    try {
      await adminCrearUsuario({ email: nuevoEmail.trim(), password: nuevoPassword, esAdmin: nuevoEsAdmin })
      setCredencialesCreadas({ email: nuevoEmail.trim(), password: nuevoPassword })
      setNuevoEmail('')
      setNuevoPassword(generarPassword())
      setNuevoEsAdmin(false)
      setMostrarNuevo(false)
      await cargar()
    } catch (err) {
      setError(err.message)
    } finally {
      setCreando(false)
    }
  }

  async function manejarCambiarRol(usuario) {
    setError(null)
    try {
      await adminActualizarUsuario(usuario.id, !usuario.es_admin)
      await cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  async function manejarEliminar(usuario) {
    if (!confirm(`¿Eliminar la cuenta de ${usuario.email}? No se puede deshacer.`)) return
    setError(null)
    try {
      await adminEliminarUsuario(usuario.id)
      await cargar()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-4 text-left">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">Usuarios ({usuarios.length})</h2>
        <button
          type="button"
          onClick={() => setMostrarNuevo((v) => !v)}
          className="px-3 py-1.5 text-sm border border-slate-300 rounded-md text-slate-600 hover:bg-slate-50"
        >
          + Nuevo usuario
        </button>
      </div>

      {mostrarNuevo && (
        <form onSubmit={manejarCrear} className="border border-slate-200 rounded-md p-4 space-y-3 bg-slate-50">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input
              type="email"
              required
              className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm"
              value={nuevoEmail}
              onChange={(e) => setNuevoEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Contraseña inicial</label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                minLength={8}
                className="flex-1 border border-slate-300 rounded-md px-3 py-1.5 text-sm font-mono"
                value={nuevoPassword}
                onChange={(e) => setNuevoPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setNuevoPassword(generarPassword())}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-md text-slate-600 hover:bg-white"
              >
                Regenerar
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">Se la tienes que compartir tú a la persona por un canal seguro.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={nuevoEsAdmin} onChange={(e) => setNuevoEsAdmin(e.target.checked)} />
            Dar permisos de administrador
          </label>
          <button
            type="submit"
            disabled={creando}
            className="w-full bg-slate-800 text-white rounded-md py-2 text-sm font-medium hover:bg-slate-900 disabled:opacity-50"
          >
            {creando ? 'Creando...' : 'Crear usuario'}
          </button>
        </form>
      )}

      {credencialesCreadas && (
        <div className="border border-emerald-200 bg-emerald-50 rounded-md p-3 text-sm space-y-1">
          <p className="text-emerald-800 font-medium">Usuario creado. Comparte estas credenciales ahora — no se volverán a mostrar:</p>
          <p className="font-mono text-emerald-900">{credencialesCreadas.email} / {credencialesCreadas.password}</p>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
      )}

      {cargando ? (
        <p className="text-sm text-slate-400">Cargando...</p>
      ) : (
        <div className="border border-slate-200 rounded-md divide-y divide-slate-200">
          {usuarios.map((usuario) => (
            <div key={usuario.id} className="p-3 flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="text-slate-800 font-medium">
                  {usuario.email} {usuario.id === miId && <span className="text-xs text-slate-400">(tú)</span>}
                </p>
                <p className="text-xs text-slate-400">
                  {usuario.es_admin ? 'Administrador' : 'Usuario normal'} · último acceso: {formatearFecha(usuario.ultimo_acceso)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => manejarCambiarRol(usuario)}
                  className="px-2 py-1 text-xs border border-slate-300 rounded-md text-slate-600 hover:bg-slate-50"
                >
                  {usuario.es_admin ? 'Quitar admin' : 'Hacer admin'}
                </button>
                <button
                  type="button"
                  onClick={() => manejarEliminar(usuario)}
                  className="px-2 py-1 text-xs border border-red-200 rounded-md text-red-600 hover:bg-red-50"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default AdminUsuarios
