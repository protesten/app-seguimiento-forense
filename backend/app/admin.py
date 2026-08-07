from collections import Counter

from app.supabase_client import obtener_cliente_supabase


def usuario_es_admin(usuario) -> bool:
    """Un usuario es administrador si tiene role='admin' en su app_metadata de Supabase Auth."""
    metadata = getattr(usuario, "app_metadata", None) or {}
    return metadata.get("role") == "admin"


def listar_usuarios() -> list[dict]:
    """Devuelve todas las cuentas de Supabase Auth (no hay registro publico, se crean aqui)."""
    cliente = obtener_cliente_supabase()
    usuarios = cliente.auth.admin.list_users()
    return [
        {
            "id": usuario.id,
            "email": usuario.email,
            "es_admin": (usuario.app_metadata or {}).get("role") == "admin",
            "creado_en": usuario.created_at,
            "ultimo_acceso": usuario.last_sign_in_at,
        }
        for usuario in usuarios
    ]


def crear_usuario(email: str, password: str, es_admin: bool = False) -> dict:
    cliente = obtener_cliente_supabase()
    atributos = {
        "email": email,
        "password": password,
        "email_confirm": True,
    }
    if es_admin:
        atributos["app_metadata"] = {"role": "admin"}

    resultado = cliente.auth.admin.create_user(atributos)
    return {
        "id": resultado.user.id,
        "email": resultado.user.email,
        "es_admin": es_admin,
    }


def eliminar_usuario(user_id: str) -> None:
    obtener_cliente_supabase().auth.admin.delete_user(user_id)


def actualizar_rol_usuario(user_id: str, es_admin: bool) -> dict:
    cliente = obtener_cliente_supabase()
    nuevo_metadata = {"role": "admin"} if es_admin else {"role": None}
    resultado = cliente.auth.admin.update_user_by_id(user_id, {"app_metadata": nuevo_metadata})
    return {
        "id": resultado.user.id,
        "email": resultado.user.email,
        "es_admin": es_admin,
    }


def obtener_estadisticas() -> dict:
    cliente = obtener_cliente_supabase()

    total_archivos = (
        cliente.table("archivos_originales").select("id", count="exact").execute().count
    )
    total_copias = (
        cliente.table("copias_distribuidas").select("id", count="exact").execute().count
    )

    copias = (
        cliente.table("copias_distribuidas")
        .select("*, archivos_originales(nombre)")
        .order("fecha_envio", desc=True)
        .execute()
        .data
    )

    contador_documentos = Counter()
    contador_destinatarios = Counter()
    info_destinatarios = {}
    contador_fechas = Counter()

    for copia in copias:
        archivo = copia.get("archivos_originales")
        nombre_documento = archivo["nombre"] if archivo else "Sin vincular a un documento"
        contador_documentos[nombre_documento] += 1

        email = copia["email_destinatario"]
        contador_destinatarios[email] += 1
        info_destinatarios[email] = copia["nombre_destinatario"]

        dia = copia["fecha_envio"][:10]
        contador_fechas[dia] += 1

    por_documento = [
        {"nombre": nombre, "cantidad": cantidad}
        for nombre, cantidad in contador_documentos.most_common()
    ]
    por_destinatario = [
        {"nombre": info_destinatarios[email], "email": email, "cantidad": cantidad}
        for email, cantidad in contador_destinatarios.most_common()
    ]
    por_fecha = [
        {"fecha": fecha, "cantidad": cantidad} for fecha, cantidad in sorted(contador_fechas.items())
    ]

    return {
        "total_archivos": total_archivos,
        "total_copias": total_copias,
        "actividad_reciente": copias[:15],
        "por_documento": por_documento,
        "por_destinatario": por_destinatario,
        "por_fecha": por_fecha,
    }
