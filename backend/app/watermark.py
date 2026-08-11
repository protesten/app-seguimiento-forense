import io
import secrets
import string

import cv2
import numpy as np
from PIL import Image

from app.dwt_dct_svd import EmbedDwtDctSvd

# Longitud fija (en bytes) que ocupa el ID_Usuario dentro de la marca.
# Tiene que ser fija porque el decodificador necesita saber de antemano
# cuantos bits tiene que leer. Si el ID_Usuario real es mas largo se recorta,
# si es mas corto se rellena con bytes nulos.
WATERMARK_LENGTH_BYTES = 8
WATERMARK_LENGTH_BITS = WATERMARK_LENGTH_BYTES * 8

MIN_IMAGE_SIDE = 256

# Tamano de trabajo fijo para el algoritmo de marcado (ver "Por que se marca a
# un tamano fijo" en el README). No tiene que ver con el tamano de la imagen
# final, que conserva su resolucion original.
TAMANO_CANONICO = (512, 512)

# Margen de seguridad para evitar que un pixel puro blanco (255) o puro negro
# (0) rompa la marca (ver "Por que se evita el blanco y negro puros" en el
# README). Cambia el brillo como mucho en esta cantidad, imperceptible a
# simple vista pero suficiente para que la conversion de color tenga margen
# donde representar el cambio del marcado.
MARGEN_SEGURIDAD_BRILLO = 3

# Sin caracteres ambiguos (0/O, 1/l/I) para que, si alguna vez alguien tiene
# que leerlo o escribirlo a mano, no haya confusion.
_ALFABETO_CODIGO = "abcdefghjkmnpqrstuvwxyz23456789"


def generar_codigo_aleatorio() -> str:
    """Genera un codigo corto al azar para usar como ID_Usuario (marcado por lotes)."""
    return "".join(secrets.choice(_ALFABETO_CODIGO) for _ in range(WATERMARK_LENGTH_BYTES))


class ImagenDemasiadoPequenaError(Exception):
    pass


def _leer_imagen_como_bgr(datos: bytes) -> np.ndarray:
    imagen_pil = Image.open(io.BytesIO(datos)).convert("RGB")
    imagen_rgb = np.array(imagen_pil)
    return cv2.cvtColor(imagen_rgb, cv2.COLOR_RGB2BGR)


def _bgr_a_png_bytes(imagen_bgr: np.ndarray) -> bytes:
    ok, buffer = cv2.imencode(".png", imagen_bgr)
    if not ok:
        raise RuntimeError("No se pudo codificar la imagen resultante como PNG")
    return buffer.tobytes()


def ocultar_marca(datos_imagen: bytes, id_usuario: str) -> bytes:
    """Incrusta id_usuario de forma invisible en la imagen y devuelve un PNG.

    La marca se calcula sobre una copia de la imagen reducida a un tamano fijo
    (TAMANO_CANONICO), no sobre la resolucion original. Esto es lo que hace que
    la marca sobreviva a que WhatsApp (o cualquier otro canal) cambie el tamano
    de la imagen al reenviarla: en vez de intentar adivinar que tamano tendra
    la copia que reciba el destinatario, el propio proceso de extraccion vuelve
    a reducir SIEMPRE al mismo tamano fijo antes de leer la marca, sea cual sea
    el tamano con el que le llegue la imagen. El cambio visual resultante (la
    "perturbacion") se calcula a tamano canonico y se reescala a la resolucion
    original antes de aplicarlo, para que la imagen entregada no pierda calidad.
    """
    imagen_bgr = _leer_imagen_como_bgr(datos_imagen)

    alto_original, ancho_original = imagen_bgr.shape[:2]
    if alto_original < MIN_IMAGE_SIDE or ancho_original < MIN_IMAGE_SIDE:
        raise ImagenDemasiadoPequenaError(
            f"La imagen debe medir al menos {MIN_IMAGE_SIDE}x{MIN_IMAGE_SIDE} pixeles "
            f"(recibida: {ancho_original}x{alto_original})"
        )

    # Ver "Por que se evita el blanco y negro puros" en el README: un pixel a
    # 255 o a 0 no deja margen para que la conversion de color represente el
    # cambio del marcado, y OpenCV lo recorta en silencio. Se aplica aqui, a
    # la imagen COMPLETA (no solo a la copia de trabajo reducida), porque la
    # perturbacion final se suma sobre esta imagen -- si se dejara en 255 el
    # recorte volveria a ocurrir en ese ultimo paso.
    imagen_bgr = np.clip(imagen_bgr, MARGEN_SEGURIDAD_BRILLO, 255 - MARGEN_SEGURIDAD_BRILLO).astype(np.uint8)

    contenido = id_usuario.encode("utf-8")[:WATERMARK_LENGTH_BYTES]
    contenido = contenido.ljust(WATERMARK_LENGTH_BYTES, b"\x00")
    bits = list(np.unpackbits(np.frombuffer(contenido, dtype=np.uint8)))

    canonica = cv2.resize(imagen_bgr, TAMANO_CANONICO, interpolation=cv2.INTER_AREA)
    embed = EmbedDwtDctSvd(bits, wmLen=len(bits))
    canonica_marcada = embed.encode(canonica)

    # La "perturbacion" es el cambio que hizo el marcado, aislado del contenido
    # de la imagen. Se suaviza dos veces (antes y despues de reescalar a tamano
    # completo) para que, al ampliarla, no se vea como una cuadricula de
    # bloques -- sin este suavizado la marca es tecnicamente invisible en el
    # sentido de "no cambia el resultado a simple vista" pero SI se aprecia un
    # patron sutil en zonas de color muy uniforme (degradados, cielos, fondos
    # lisos). Se detecto probando con una imagen de gradiente real, el peor
    # caso posible para este tipo de artefacto.
    #
    # El segundo suavizado se dejo deliberadamente mas suave que al principio
    # (era 9x9/sigma 2.0): en imagenes con muy poco contraste util para la
    # marca -- un documento escaneado en blanco y negro es el caso mas claro
    # -- ese suavizado adicional, aplicado ya a tamano completo, era
    # suficiente para borrar el poco margen que quedaba y perder la marca por
    # completo. Se comprobo visualmente (incluida una imagen de gradiente
    # real) que con este valor mas bajo sigue sin apreciarse ninguna
    # cuadricula.
    perturbacion = (canonica_marcada.astype(np.int16) - canonica.astype(np.int16)).astype(np.float32)
    perturbacion = cv2.GaussianBlur(perturbacion, (5, 5), sigmaX=1.0)
    perturbacion_completa = cv2.resize(
        perturbacion, (ancho_original, alto_original), interpolation=cv2.INTER_LINEAR
    )
    perturbacion_completa = cv2.GaussianBlur(perturbacion_completa, (3, 3), sigmaX=0.7)

    imagen_marcada = np.clip(imagen_bgr.astype(np.float32) + perturbacion_completa, 0, 255).astype(np.uint8)

    return _bgr_a_png_bytes(imagen_marcada)


def _decodificar_bgr(imagen_bgr: np.ndarray) -> str:
    # Sin clamp aqui a proposito: el margen de seguridad solo hace falta al
    # ESCONDER la marca (para que el algoritmo tenga donde moverse). Si se
    # repitiera aqui, recortaria el propio cambio que el marcado ya hizo por
    # encima de ese margen y rompería la lectura.
    canonica = cv2.resize(imagen_bgr, TAMANO_CANONICO, interpolation=cv2.INTER_AREA)
    embed = EmbedDwtDctSvd(wmLen=WATERMARK_LENGTH_BITS)
    bits = embed.decode(canonica)
    contenido = np.packbits(bits)[:WATERMARK_LENGTH_BYTES].tobytes()
    return contenido.rstrip(b"\x00").decode("utf-8", errors="ignore")


def extraer_marca(datos_imagen: bytes) -> str:
    """Lee la marca invisible de la imagen y devuelve el ID_Usuario detectado.

    Igual que en ocultar_marca, la lectura se hace sobre una copia reducida a
    TAMANO_CANONICO -- sea cual sea el tamano real de la imagen recibida.
    """
    imagen_bgr = _leer_imagen_como_bgr(datos_imagen)
    return _decodificar_bgr(imagen_bgr)


def _detectar_borde_por_varianza(imagen_bgr: np.ndarray, umbral: float = 20.0) -> np.ndarray | None:
    """Encuentra donde empieza el contenido 'real' de la imagen, asumiendo que
    cualquier margen anadido (barra de herramientas, fondo de un visor, etc.)
    es de color practicamente uniforme mientras que el contenido real no lo es.
    Mira cada fila/columna por separado (no asume un margen simetrico) y
    devuelve la imagen recortada a esa zona, o None si no encuentra un recorte
    razonable (ya sea porque no hay margen o porque quedaria demasiado pequena).

    A diferencia de la deteccion de bordes que probamos para fotos de camara a
    una pantalla, esto SI funciona de forma fiable: una captura de pantalla
    digital tiene bordes nitidos (sin el desenfoque de una foto real), que es
    justo lo que hacia que aquella deteccion fallara.
    """
    gris = cv2.cvtColor(imagen_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    alto, ancho = gris.shape

    varianza_filas = gris.var(axis=1)
    varianza_columnas = gris.var(axis=0)

    filas_con_contenido = np.flatnonzero(varianza_filas > umbral)
    columnas_con_contenido = np.flatnonzero(varianza_columnas > umbral)
    if filas_con_contenido.size == 0 or columnas_con_contenido.size == 0:
        return None

    arriba, abajo = filas_con_contenido[0], filas_con_contenido[-1]
    izquierda, derecha = columnas_con_contenido[0], columnas_con_contenido[-1]

    if abajo - arriba < MIN_IMAGE_SIDE or derecha - izquierda < MIN_IMAGE_SIDE:
        return None
    if arriba == 0 and izquierda == 0 and abajo == alto - 1 and derecha == ancho - 1:
        return None  # no habia margen que quitar

    return imagen_bgr[arriba : abajo + 1, izquierda : derecha + 1]


def extraer_marca_candidatos(datos_imagen: bytes) -> list[str]:
    """Como extraer_marca, pero devuelve varias hipotesis en vez de una sola.

    Sirve para el caso de una CAPTURA DE PANTALLA (de una imagen o de una
    pagina de PDF escaneada mostrada en un visor): si la captura incluye un
    margen alrededor del contenido real (barra de herramientas, fondo, etc.),
    la lectura directa falla por completo -- el algoritmo necesita que el
    encuadre coincida casi al pixel. En vez de adivinar, se generan varias
    lecturas candidatas (sin recortar, y con distintos recortes automaticos) y
    quien llama a esta funcion (que sí tiene acceso a la base de datos) se
    queda con la primera que coincida con un codigo real ya emitido.

    El primer elemento de la lista es siempre la lectura sin recortar (el caso
    normal, sin margen) -- para no cambiar el comportamiento en el 99% de los
    casos donde no hace falta ningun recorte.
    """
    imagen_bgr = _leer_imagen_como_bgr(datos_imagen)
    candidatos = [_decodificar_bgr(imagen_bgr)]

    recorte_por_varianza = _detectar_borde_por_varianza(imagen_bgr)
    if recorte_por_varianza is not None:
        candidatos.append(_decodificar_bgr(recorte_por_varianza))

    return candidatos
