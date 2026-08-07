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

export async function listarDestinatarios() {
  const respuesta = await fetch(`${API_BASE_URL}/destinatarios`, { headers: await cabecerasAuth() })
  if (!respuesta.ok) {
    throw new Error(await leerError(respuesta, 'No se pudo obtener la lista de destinatarios'))
  }
  return respuesta.json()
}

export async function crearDestinatario(nombre, email) {
  const datos = new FormData()
  datos.append('nombre', nombre)
  datos.append('email', email)

  const respuesta = await fetch(`${API_BASE_URL}/destinatarios`, {
    method: 'POST',
    body: datos,
    headers: await cabecerasAuth(),
  })
  if (!respuesta.ok) {
    throw new Error(await leerError(respuesta, 'No se pudo guardar el destinatario'))
  }
  return respuesta.json()
}

export async function eliminarDestinatario(destinatarioId) {
  const respuesta = await fetch(`${API_BASE_URL}/destinatarios/${destinatarioId}`, {
    method: 'DELETE',
    headers: await cabecerasAuth(),
  })
  if (!respuesta.ok) {
    throw new Error(await leerError(respuesta, 'No se pudo eliminar el destinatario'))
  }
  return respuesta.json()
}

export async function adminListarUsuarios() {
  const respuesta = await fetch(`${API_BASE_URL}/admin/usuarios`, { headers: await cabecerasAuth() })
  if (!respuesta.ok) {
    throw new Error(await leerError(respuesta, 'No se pudo obtener la lista de usuarios'))
  }
  return respuesta.json()
}

export async function adminCrearUsuario({ email, password, esAdmin }) {
  const datos = new FormData()
  datos.append('email', email)
  datos.append('password', password)
  datos.append('es_admin', esAdmin ? 'true' : 'false')

  const respuesta = await fetch(`${API_BASE_URL}/admin/usuarios`, {
    method: 'POST',
    body: datos,
    headers: await cabecerasAuth(),
  })
  if (!respuesta.ok) {
    throw new Error(await leerError(respuesta, 'No se pudo crear el usuario'))
  }
  return respuesta.json()
}

export async function adminEliminarUsuario(userId) {
  const respuesta = await fetch(`${API_BASE_URL}/admin/usuarios/${userId}`, {
    method: 'DELETE',
    headers: await cabecerasAuth(),
  })
  if (!respuesta.ok) {
    throw new Error(await leerError(respuesta, 'No se pudo eliminar el usuario'))
  }
  return respuesta.json()
}

export async function adminActualizarUsuario(userId, esAdmin) {
  const datos = new FormData()
  datos.append('es_admin', esAdmin ? 'true' : 'false')

  const respuesta = await fetch(`${API_BASE_URL}/admin/usuarios/${userId}`, {
    method: 'PATCH',
    body: datos,
    headers: await cabecerasAuth(),
  })
  if (!respuesta.ok) {
    throw new Error(await leerError(respuesta, 'No se pudo actualizar el usuario'))
  }
  return respuesta.json()
}

export async function adminEstadisticas() {
  const respuesta = await fetch(`${API_BASE_URL}/admin/estadisticas`, { headers: await cabecerasAuth() })
  if (!respuesta.ok) {
    throw new Error(await leerError(respuesta, 'No se pudo obtener las estadisticas'))
  }
  return respuesta.json()
}
