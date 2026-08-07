import os

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

_cliente: Client | None = None


def obtener_cliente_supabase() -> Client:
    """Crea (una sola vez) y devuelve el cliente de Supabase, leyendo las claves del .env."""
    global _cliente

    if _cliente is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError(
                "Faltan SUPABASE_URL o SUPABASE_KEY. Rellena el archivo backend/.env "
                "con las claves de tu proyecto de Supabase."
            )
        _cliente = create_client(SUPABASE_URL, SUPABASE_KEY)

    return _cliente


def verificar_token(token: str) -> dict:
    """Valida un token de sesion de Supabase Auth (el que envia el frontend tras iniciar sesion).
    Lanza una excepcion si el token no es valido o esta caducado."""
    cliente = obtener_cliente_supabase()
    respuesta = cliente.auth.get_user(token)
    return respuesta.user


def registrar_archivo_original(nombre: str) -> dict:
    """Crea una fila en archivos_originales y devuelve el registro creado (incluye su id)."""
    cliente = obtener_cliente_supabase()
    resultado = cliente.table("archivos_originales").insert({"nombre": nombre}).execute()
    return resultado.data[0]


def listar_archivos_originales() -> list[dict]:
    """Devuelve todas las filas de archivos_originales, la mas reciente primero."""
    cliente = obtener_cliente_supabase()
    resultado = (
        cliente.table("archivos_originales")
        .select("*")
        .order("fecha", desc=True)
        .execute()
    )
    return resultado.data


def registrar_copia_distribuida(
    id_unico_marca: str,
    nombre_destinatario: str,
    email_destinatario: str,
    archivo_id: str | None = None,
) -> None:
    """Guarda en Supabase la relacion entre una marca invisible y a quien se le entrego."""
    cliente = obtener_cliente_supabase()
    cliente.table("copias_distribuidas").insert(
        {
            "archivo_id": archivo_id,
            "nombre_destinatario": nombre_destinatario,
            "email_destinatario": email_destinatario,
            "id_unico_marca": id_unico_marca,
        }
    ).execute()


def listar_destinatarios_guardados(usuario_id: str) -> list[dict]:
    """Devuelve los destinatarios que este usuario guardo, por nombre."""
    cliente = obtener_cliente_supabase()
    resultado = (
        cliente.table("destinatarios_guardados")
        .select("*")
        .eq("usuario_id", usuario_id)
        .order("nombre")
        .execute()
    )
    return resultado.data


def crear_destinatario_guardado(usuario_id: str, nombre: str, email: str) -> dict:
    cliente = obtener_cliente_supabase()
    resultado = (
        cliente.table("destinatarios_guardados")
        .insert({"usuario_id": usuario_id, "nombre": nombre, "email": email})
        .execute()
    )
    return resultado.data[0]


def eliminar_destinatario_guardado(usuario_id: str, destinatario_id: str) -> None:
    """Solo elimina si el destinatario pertenece a este usuario (comprobado en la
    propia consulta, ya que no hay politicas RLS que lo impidan por si solas)."""
    cliente = obtener_cliente_supabase()
    cliente.table("destinatarios_guardados").delete().eq("id", destinatario_id).eq(
        "usuario_id", usuario_id
    ).execute()


def _distancia_edicion(a: str, b: str) -> int:
    """Distancia de edicion (Levenshtein): cuantos caracteres hay que cambiar,
    anadir o quitar para convertir 'a' en 'b'. Se usa para encontrar codigos
    parecidos cuando una imagen muy comprimida altera 1 o 2 caracteres."""
    if a == b:
        return 0

    filas, columnas = len(a) + 1, len(b) + 1
    matriz = [[0] * columnas for _ in range(filas)]
    for i in range(filas):
        matriz[i][0] = i
    for j in range(columnas):
        matriz[0][j] = j

    for i in range(1, filas):
        for j in range(1, columnas):
            costo = 0 if a[i - 1] == b[j - 1] else 1
            matriz[i][j] = min(
                matriz[i - 1][j] + 1,  # eliminar un caracter de a
                matriz[i][j - 1] + 1,  # insertar un caracter en a
                matriz[i - 1][j - 1] + costo,  # sustituir un caracter
            )

    return matriz[filas - 1][columnas - 1]


def buscar_copias_por_marca(id_unico_marca: str, tolerancia: int = 2) -> list[dict]:
    """Busca en copias_distribuidas quien recibio una copia marcada con este codigo.

    Primero intenta una coincidencia exacta. Si no hay ninguna, busca codigos
    parecidos entre TODOS los ya emitidos (tolera hasta `tolerancia` caracteres
    de diferencia) -- cubre el caso de que la imagen se haya comprimido de forma
    agresiva y la marca extraida tenga algun caracter mal leido. Cada fila
    devuelta incluye "distancia_edicion" (0 = coincidencia exacta).
    """
    cliente = obtener_cliente_supabase()

    exactas = (
        cliente.table("copias_distribuidas")
        .select("*, archivos_originales(nombre)")
        .eq("id_unico_marca", id_unico_marca)
        .order("fecha_envio", desc=True)
        .execute()
    ).data

    if exactas:
        for fila in exactas:
            fila["distancia_edicion"] = 0
        return exactas

    if tolerancia <= 0:
        return []

    todas = (
        cliente.table("copias_distribuidas")
        .select("*, archivos_originales(nombre)")
        .order("fecha_envio", desc=True)
        .execute()
    ).data

    candidatas = []
    for fila in todas:
        distancia = _distancia_edicion(id_unico_marca, fila["id_unico_marca"])
        if distancia <= tolerancia:
            fila["distancia_edicion"] = distancia
            candidatas.append(fila)

    candidatas.sort(key=lambda fila: fila["distancia_edicion"])
    return candidatas
