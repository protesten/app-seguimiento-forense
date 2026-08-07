import { useState } from 'react'
import AdminEstadisticas from './AdminEstadisticas'
import AdminUsuarios from './AdminUsuarios'

function Admin() {
  const [vista, setVista] = useState('usuarios')

  return (
    <div className="space-y-4">
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setVista('usuarios')}
          className={`px-3 py-1 rounded-md ${vista === 'usuarios' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          Usuarios
        </button>
        <button
          type="button"
          onClick={() => setVista('estadisticas')}
          className={`px-3 py-1 rounded-md ${vista === 'estadisticas' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          Estadísticas
        </button>
      </div>

      {vista === 'usuarios' ? <AdminUsuarios /> : <AdminEstadisticas />}
    </div>
  )
}

export default Admin
