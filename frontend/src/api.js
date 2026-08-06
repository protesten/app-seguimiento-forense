import { supabase } from './supabaseClient'

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function leerError(respuesta, mensajePorDefecto) {
  try {
    const cuerpo = await respuesta.json()
    if (Array.isArray(cuerpo.detail)) {
      return cuerpo.detail.map((item) => item.msg).join(', ')
    }
    return cuerpo.detail || mensajePorDefecto
  } catch {
    return mensajePorDefecto
  }
}

async function cabecerasAuth() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function listarArchivos() {
  const respuesta = await fetch(`${API_BASE_URL}/archivos`, { headers: await cabecerasAuth() })
  if (!respuesta.ok) {
    throw new Error(await leerError(respuesta, 'No se pudo obtener la lista de archivos'))
  }
  return respuesta.json()
}

export async function crearArchivo(nombre) {
  const datos = new FormData()
  datos.append('nombre', nombre)

  const respuesta = await fetch(`${API_BASE_URL}/archivos`, {
    method: 'POST',
    body: datos,
    headers: await cabecerasAuth(),
  })
  if (!respuesta.ok) {
    throw new Error(await leerError(respuesta, 'No se pudo registrar el archivo'))
  }
  return respuesta.json()
}

export function esPdf(archivo) {
  return archivo.type === 'application/pdf' || archivo.name?.toLowerCase().endsWith('.pdf')
}

export async function ocultarMarca({ archivo, idUsuario, nombreDestinatario, emailDestinatario, archivoId }) {
  const pdf = esPdf(archivo)
  const datos = new FormData()
  datos.append(pdf ? 'pdf' : 'imagen', archivo)
  datos.append('ID_Usuario', idUsuario)
  datos.append('nombre_destinatario', nombreDestinatario)
  datos.append('email_destinatario', emailDestinatario)
  if (archivoId) {
    datos.append('archivo_id', archivoId)
  }

  const endpoint = pdf ? '/ocultar-marca-pdf' : '/ocultar-marca'
  const respuesta = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    body: datos,
    headers: await cabecerasAuth(),
  })
  if (!respuesta.ok) {
    throw new Error(await leerError(respuesta, 'No se pudo marcar el archivo'))
  }
  return { blob: await respuesta.blob(), esPdf: pdf }
}

export async function extraerMarca(archivo) {
  const pdf = esPdf(archivo)
  const datos = new FormData()
  datos.append(pdf ? 'pdf' : 'imagen', archivo)

  const endpoint = pdf ? '/extraer-marca-pdf' : '/extraer-marca'
  const respuesta = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    body: datos,
    headers: await cabecerasAuth(),
  })
  if (!respuesta.ok) {
    throw new Error(await leerError(respuesta, 'No se pudo leer la marca del archivo'))
  }
  return respuesta.json()
}

export async function buscarCopiaPorMarca(idUsuario) {
  const respuesta = await fetch(`${API_BASE_URL}/copias/${encodeURIComponent(idUsuario)}`, {
    headers: await cabecerasAuth(),
  })
  if (!respuesta.ok) {
    throw new Error(await leerError(respuesta, 'No se pudo buscar el registro de esta marca'))
  }
  return respuesta.json()
}
