import { useState } from 'react'
import { supabase } from '../supabaseClient'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  async function manejarEnviar(evento) {
    evento.preventDefault()
    setError(null)
    setCargando(true)
    const { error: errorLogin } = await supabase.auth.signInWithPassword({ email, password })
    if (errorLogin) {
      setError(errorLogin.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : errorLogin.message)
    }
    setCargando(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold text-slate-800">App de Seguimiento Forense</h1>
          <p className="text-sm text-slate-500">Inicia sesión para continuar</p>
        </div>

        <form onSubmit={manejarEnviar} className="space-y-4 text-left">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              required
              autoComplete="username"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              value={password}
              onChange={(evento) => setPassword(evento.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-slate-800 text-white rounded-md py-2.5 font-medium hover:bg-slate-900 disabled:opacity-50"
          >
            {cargando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
        )}

        <p className="text-xs text-slate-400 text-center">
          Las cuentas se crean desde el panel de Supabase (Authentication → Users → Add user), no hay registro público.
        </p>
      </div>
    </div>
  )
}

export default Login
