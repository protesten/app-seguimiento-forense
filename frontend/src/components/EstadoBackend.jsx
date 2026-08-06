import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../api'

function EstadoBackend() {
  const [estado, setEstado] = useState('comprobando')

  useEffect(() => {
    fetch(`${API_BASE_URL}/health`)
      .then((res) => res.json())
      .then((datos) => setEstado(datos.status === 'ok' ? 'conectado' : 'error'))
      .catch(() => setEstado('desconectado'))
  }, [])

  const estilos = {
    comprobando: 'bg-slate-100 text-slate-500',
    conectado: 'bg-emerald-100 text-emerald-700',
    error: 'bg-amber-100 text-amber-700',
    desconectado: 'bg-red-100 text-red-700',
  }

  const texto = {
    comprobando: 'Comprobando conexion con el backend...',
    conectado: 'Backend conectado',
    error: 'El backend respondio con un error',
    desconectado: 'Sin conexion con el backend (¿arrancaste uvicorn en el puerto 8000?)',
  }

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${estilos[estado]}`}>
      {texto[estado]}
    </span>
  )
}

export default EstadoBackend
