import { useState } from 'react'
import { supabase } from '../supabaseClient'

function CambiarPassword() {
  const [mostrar, setMostrar] = useState(false)
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [error, setError] = useState(null)

  async function manejarEnviar(evento) {
    evento.preventDefault()
    setError(null)
    setMensaje(null)

    if (nueva.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (nueva !== confirmar) {
      setError('Las contraseñas no coinciden')
      return
    }

    setCargando(true)
    const { error: errorCambio } = await supabase.auth.updateUser({ password: nueva })
    setCargando(false)

    if (errorCambio) {
      setError(errorCambio.message)
      return
    }

    setMensaje('Contraseña actualizada correctamente.')
    setNueva('')
    setConfirmar('')
  }

  if (!mostrar) {
    return (
      <button type="button" onClick={() => setMostrar(true)} className="underline hover:text-slate-600">
        Cambiar contraseña
      </button>
    )
  }

  return (
    <div className="text-left bg-white border border-slate-200 rounded-md p-4 max-w-xs mx-auto space-y-2 shadow-sm">
      <form onSubmit={manejarEnviar} className="space-y-2">
        <input
          type="password"
          placeholder="Nueva contraseña (mínimo 8 caracteres)"
          minLength={8}
          required
          autoComplete="new-password"
          className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
        />
        <input
          type="password"
          placeholder="Confirmar contraseña"
          minLength={8}
          required
          autoComplete="new-password"
          className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={cargando}
            className="flex-1 bg-slate-800 text-white rounded-md py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {cargando ? 'Guardando...' : 'Guardar'}
          </button>
          <button type="button" onClick={() => setMostrar(false)} className="px-3 text-xs text-slate-400 hover:text-slate-600">
            Cerrar
          </button>
        </div>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {mensaje && <p className="text-xs text-emerald-600">{mensaje}</p>}
    </div>
  )
}

export default CambiarPassword
