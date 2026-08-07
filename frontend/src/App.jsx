import { useEffect, useState } from 'react'
import Admin from './components/Admin'
import EstadoBackend from './components/EstadoBackend'
import ExtraerMarca from './components/ExtraerMarca'
import Login from './components/Login'
import MarcarImagen from './components/MarcarImagen'
import { supabase } from './supabaseClient'

function App() {
  const [pestana, setPestana] = useState('marcar')
  const [sesion, setSesion] = useState(undefined) // undefined = comprobando, null = sin sesion

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))

    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSesion(nuevaSesion)
    })

    return () => suscripcion.subscription.unsubscribe()
  }, [])

  if (sesion === undefined) {
    return <div className="min-h-screen bg-slate-50" />
  }

  if (!sesion) {
    return <Login />
  }

  const esAdmin = sesion.user.app_metadata?.role === 'admin'

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold text-slate-800">App de Seguimiento Forense</h1>
          <EstadoBackend />
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
            <span>{sesion.user.email}</span>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="underline hover:text-slate-600"
            >
              Cerrar sesión
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex border-b border-slate-200">
            <button
              type="button"
              onClick={() => setPestana('marcar')}
              className={`flex-1 py-3 text-sm font-medium ${
                pestana === 'marcar'
                  ? 'text-slate-800 border-b-2 border-slate-800'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Marcar imagen
            </button>
            <button
              type="button"
              onClick={() => setPestana('extraer')}
              className={`flex-1 py-3 text-sm font-medium ${
                pestana === 'extraer'
                  ? 'text-slate-800 border-b-2 border-slate-800'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Verificar imagen filtrada
            </button>
            {esAdmin && (
              <button
                type="button"
                onClick={() => setPestana('admin')}
                className={`flex-1 py-3 text-sm font-medium ${
                  pestana === 'admin'
                    ? 'text-slate-800 border-b-2 border-slate-800'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Administración
              </button>
            )}
          </div>

          <div className="p-6">
            {pestana === 'marcar' && <MarcarImagen />}
            {pestana === 'extraer' && <ExtraerMarca />}
            {pestana === 'admin' && esAdmin && <Admin />}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
