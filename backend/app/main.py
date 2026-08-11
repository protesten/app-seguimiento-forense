import logging
import os

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.admin import (
    actualizar_rol_usuario,
    crear_usuario,
    eliminar_usuario,
    listar_usuarios,
    obtener_estadisticas,
    usuario_es_admin,
)
from app.supabase_client import (
    buscar_copias_por_marca,
    crear_destinatario_guardado,
    eliminar_destinatario_guardado,
    listar_archivos_originales,
    listar_destinatarios_guardados,
    registrar_archivo_original,
    registrar_copia_distribuida,
    verificar_token,
)
from app.watermark import (
    WATERMARK_LENGTH_BYTES,
    ImagenDemasiadoPequenaError,
    extraer_marca_candidatos,
    ocultar_marca,
)
from app.watermark_pdf import PdfInvalidoError, extraer_marca_pdf, ocultar_marca_pdf

logger = logging.getLogger("app")

app = FastAPI(title="App Seguimiento Forense - API")

# Permite que el frontend pueda hablar con esta API. Los origenes locales de
# desarrollo siempre estan permitidos; para produccion, anade la URL real del
# frontend desplegado en la variable de entorno FRONTEND_ORIGINS (varios
# separados por coma), sin tener que tocar este archivo ni volver a desplegar
# el backend. No usamos allow_credentials porque la sesion viaja en la
# cabecera Authorization, no en cookies.
origenes_permitidos = ["http://localhost:5173", "http://127.0.0.1:5173"]
origenes_desde_env = os.environ.get("FRONTEND_ORIGINS", "")
origenes_permitidos += [origen.strip() for origen in origenes_desde_env.split(",") if origen.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origenes_permitidos,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def usuario_autenticado(authorization: str | None = Header(None)):
    """Dependencia de FastAPI: exige un token valido de Supabase Auth en la cabecera
    Authorization ('Bearer <token>'). Se aplica a todos los endpoints que tocan datos;
    / y /health quedan publicos para poder comprobar que el servidor esta vivo."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Falta iniciar sesion (token no encontrado)")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        return verificar_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Sesion invalida o caducada, vuelve a iniciar sesion")


def admin_requerido(usuario=Depends(usuario_autenticado)):
    """Dependencia adicional para los endpoints de /admin: exige ademas que el
    usuario tenga role='admin'. Si le quitas el rol de administrador a alguien
    con sesion activa, sigue teniendo acceso admin hasta que su token caduque
    (maximo 1 hora) o vuelva a iniciar sesion -- es como funcionan los JWT."""
    if not usuario_es_admin(usuario):
        raise HTTPException(status_code=403, detail="Esta accion requiere permisos de administrador")
    return usuario


@app.get("/")
def read_root():
    return {"status": "ok", "mensaje": "API del sistema de marcado y rastreo funcionando"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/archivos")
async def endpoint_crear_archivo(nombre: str = Form(...), usuario=Depends(usuario_autenticado)):
    if not nombre.strip():
        raise HTTPException(status_code=400, detail="nombre no puede estar vacio")

    try:
        archivo_creado = registrar_archivo_original(nombre)
    except Exception as error:
        logger.error("Error al registrar archivo en Supabase: %s", error)
        raise HTTPException(status_code=500, detail="No se pudo registrar el archivo. Intenta de nuevo.")

    return archivo_creado


@app.get("/archivos")
async def endpoint_listar_archivos(usuario=Depends(usuario_autenticado)):
    try:
        return listar_archivos_originales()
    except Exception as error:
        logger.error("Error al listar archivos desde Supabase: %s", error)
        raise HTTPException(status_code=500, detail="No se pudo consultar la base de datos. Intenta de nuevo.")


@app.post("/ocultar-marca")
async def endpoint_ocultar_marca(
    imagen: UploadFile = File(...),
    ID_Usuario: str = Form(...),
    nombre_destinatario: str = Form(...),
    email_destinatario: str = Form(...),
    archivo_id: str | None = Form(None),
    usuario=Depends(usuario_autenticado),
):
    if not ID_Usuario.strip():
        raise HTTPException(status_code=400, detail="ID_Usuario no puede estar vacio")

    if not nombre_destinatario.strip():
        raise HTTPException(status_code=400, detail="nombre_destinatario no puede estar vacio")

    if not email_destinatario.strip():
        raise HTTPException(status_code=400, detail="email_destinatario no puede estar vacio")

    if len(ID_Usuario.encode("utf-8")) > WATERMARK_LENGTH_BYTES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"ID_Usuario no puede tener mas de {WATERMARK_LENGTH_BYTES} caracteres en imagenes "
                "(el algoritmo de marcado tiene esa capacidad fija; si se aceptara uno mas largo, "
                "el codigo guardado en la base de datos no coincidiria con el que queda escondido "
                "en la imagen)"
            ),
        )

    datos = await imagen.read()

    try:
        imagen_marcada_png = ocultar_marca(datos, ID_Usuario)
    except ImagenDemasiadoPequenaError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        logger.error("Error al procesar imagen en /ocultar-marca: %s", error)
        raise HTTPException(status_code=400, detail="No se pudo procesar la imagen. Revisa que sea un archivo de imagen valido.")

    try:
        registrar_copia_distribuida(
            id_unico_marca=ID_Usuario,
            nombre_destinatario=nombre_destinatario,
            email_destinatario=email_destinatario,
            archivo_id=archivo_id or None,
        )
    except Exception as error:
        # La imagen ya se genero correctamente: no bloqueamos la respuesta al usuario
        # por un fallo de la base de datos, pero lo dejamos bien visible en los logs
        # del servidor para que sepas que ESE registro no quedo guardado en Supabase.
        logger.warning("No se pudo guardar la copia distribuida en Supabase: %s", error)

    return Response(content=imagen_marcada_png, media_type="image/png")


@app.post("/extraer-marca")
async def endpoint_extraer_marca(imagen: UploadFile = File(...), usuario=Depends(usuario_autenticado)):
    datos = await imagen.read()

    try:
        candidatos = extraer_marca_candidatos(datos)
    except Exception as error:
        logger.error("Error al extraer marca en /extraer-marca: %s", error)
        raise HTTPException(status_code=400, detail="No se pudo leer la imagen. Revisa que sea un archivo de imagen valido.")

    if not candidatos:
        return {"ID_Usuario": ""}

    # El primer candidato (sin recortar) es el caso normal. Si no coincide con
    # ningun codigo real, probamos los demas candidatos (recortes automaticos
    # pensados para capturas de pantalla con margen alrededor del contenido) --
    # solo nos quedamos con uno si coincide EXACTO con algo ya emitido, para no
    # sustituir el resultado principal por una lectura peor sin motivo.
    for candidato in candidatos:
        if not candidato:
            continue
        try:
            if buscar_copias_por_marca(candidato, tolerancia=0):
                return {"ID_Usuario": candidato}
        except Exception as error:
            logger.warning("No se pudo verificar el candidato %r contra Supabase: %s", candidato, error)

    return {"ID_Usuario": candidatos[0]}


@app.post("/ocultar-marca-pdf")
async def endpoint_ocultar_marca_pdf(
    pdf: UploadFile = File(...),
    ID_Usuario: str = Form(...),
    nombre_destinatario: str = Form(...),
    email_destinatario: str = Form(...),
    archivo_id: str | None = Form(None),
    usuario=Depends(usuario_autenticado),
):
    if not ID_Usuario.strip():
        raise HTTPException(status_code=400, detail="ID_Usuario no puede estar vacio")

    if not nombre_destinatario.strip():
        raise HTTPException(status_code=400, detail="nombre_destinatario no puede estar vacio")

    if not email_destinatario.strip():
        raise HTTPException(status_code=400, detail="email_destinatario no puede estar vacio")

    datos = await pdf.read()

    try:
        pdf_marcado = ocultar_marca_pdf(datos, ID_Usuario)
    except PdfInvalidoError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        logger.error("Error al procesar PDF en /ocultar-marca-pdf: %s", error)
        raise HTTPException(status_code=400, detail="No se pudo procesar el PDF. Revisa que sea un archivo PDF valido.")

    try:
        registrar_copia_distribuida(
            id_unico_marca=ID_Usuario,
            nombre_destinatario=nombre_destinatario,
            email_destinatario=email_destinatario,
            archivo_id=archivo_id or None,
        )
    except Exception as error:
        logger.warning("No se pudo guardar la copia distribuida en Supabase: %s", error)

    return Response(content=pdf_marcado, media_type="application/pdf")


@app.post("/extraer-marca-pdf")
async def endpoint_extraer_marca_pdf(pdf: UploadFile = File(...), usuario=Depends(usuario_autenticado)):
    datos = await pdf.read()

    try:
        id_usuario_detectado = extraer_marca_pdf(datos)
    except PdfInvalidoError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        logger.error("Error al extraer marca en /extraer-marca-pdf: %s", error)
        raise HTTPException(status_code=400, detail="No se pudo leer el PDF. Revisa que sea un archivo PDF valido.")

    return {"ID_Usuario": id_usuario_detectado}


@app.get("/copias/{id_unico_marca}")
async def endpoint_buscar_copia(
    id_unico_marca: str, tolerancia: int = 2, usuario=Depends(usuario_autenticado)
):
    try:
        return buscar_copias_por_marca(id_unico_marca, tolerancia=tolerancia)
    except Exception as error:
        logger.error("Error al buscar copia en Supabase: %s", error)
        raise HTTPException(status_code=500, detail="No se pudo consultar la base de datos. Intenta de nuevo.")


@app.get("/destinatarios")
async def endpoint_listar_destinatarios(usuario=Depends(usuario_autenticado)):
    try:
        return listar_destinatarios_guardados(usuario.id)
    except Exception as error:
        logger.error("Error al listar destinatarios guardados: %s", error)
        raise HTTPException(status_code=500, detail="No se pudo consultar la base de datos. Intenta de nuevo.")


@app.post("/destinatarios")
async def endpoint_crear_destinatario(
    nombre: str = Form(...), email: str = Form(...), usuario=Depends(usuario_autenticado)
):
    if not nombre.strip():
        raise HTTPException(status_code=400, detail="nombre no puede estar vacio")

    if not email.strip():
        raise HTTPException(status_code=400, detail="email no puede estar vacio")

    try:
        return crear_destinatario_guardado(usuario.id, nombre.strip(), email.strip())
    except Exception as error:
        logger.error("Error al guardar destinatario: %s", error)
        raise HTTPException(
            status_code=400,
            detail="No se pudo guardar el destinatario. Puede que ya tengas guardado ese email.",
        )


@app.delete("/destinatarios/{destinatario_id}")
async def endpoint_eliminar_destinatario(destinatario_id: str, usuario=Depends(usuario_autenticado)):
    try:
        eliminar_destinatario_guardado(usuario.id, destinatario_id)
    except Exception as error:
        logger.error("Error al eliminar destinatario: %s", error)
        raise HTTPException(status_code=400, detail="No se pudo eliminar el destinatario.")

    return {"status": "ok"}


@app.get("/admin/usuarios")
async def endpoint_listar_usuarios(admin=Depends(admin_requerido)):
    try:
        return listar_usuarios()
    except Exception as error:
        logger.error("Error al listar usuarios: %s", error)
        raise HTTPException(status_code=500, detail="No se pudo obtener la lista de usuarios.")


@app.post("/admin/usuarios")
async def endpoint_crear_usuario(
    email: str = Form(...),
    password: str = Form(...),
    es_admin: bool = Form(False),
    admin=Depends(admin_requerido),
):
    if not email.strip():
        raise HTTPException(status_code=400, detail="email no puede estar vacio")

    if len(password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")

    try:
        return crear_usuario(email.strip(), password, es_admin)
    except Exception as error:
        logger.error("Error al crear usuario: %s", error)
        raise HTTPException(
            status_code=400,
            detail="No se pudo crear el usuario. Puede que ese email ya este registrado.",
        )


@app.delete("/admin/usuarios/{user_id}")
async def endpoint_eliminar_usuario(user_id: str, admin=Depends(admin_requerido)):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta")

    try:
        eliminar_usuario(user_id)
    except Exception as error:
        logger.error("Error al eliminar usuario: %s", error)
        raise HTTPException(status_code=400, detail="No se pudo eliminar el usuario.")

    return {"status": "ok"}


@app.patch("/admin/usuarios/{user_id}")
async def endpoint_actualizar_usuario(
    user_id: str, es_admin: bool = Form(...), admin=Depends(admin_requerido)
):
    if user_id == admin.id and not es_admin:
        raise HTTPException(
            status_code=400, detail="No puedes quitarte a ti mismo los permisos de administrador"
        )

    try:
        return actualizar_rol_usuario(user_id, es_admin)
    except Exception as error:
        logger.error("Error al actualizar usuario: %s", error)
        raise HTTPException(status_code=400, detail="No se pudo actualizar el usuario.")


@app.get("/admin/estadisticas")
async def endpoint_estadisticas(admin=Depends(admin_requerido)):
    try:
        return obtener_estadisticas()
    except Exception as error:
        logger.error("Error al calcular estadisticas: %s", error)
        raise HTTPException(status_code=500, detail="No se pudieron calcular las estadisticas.")
