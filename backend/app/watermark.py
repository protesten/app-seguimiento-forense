import io

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
    perturbacion = (canonica_marcada.astype(np.int16) - canonica.astype(np.int16)).astype(np.float32)
    perturbacion = cv2.GaussianBlur(perturbacion, (5, 5), sigmaX=1.0)
    perturbacion_completa = cv2.resize(
        perturbacion, (ancho_original, alto_original), interpolation=cv2.INTER_LINEAR
    )
    perturbacion_completa = cv2.GaussianBlur(perturbacion_completa, (9, 9), sigmaX=2.0)

    imagen_marcada = np.clip(imagen_bgr.astype(np.float32) + perturbacion_completa, 0, 255).astype(np.uint8)

    return _bgr_a_png_bytes(imagen_marcada)


def extraer_marca(datos_imagen: bytes) -> str:
    """Lee la marca invisible de la imagen y devuelve el ID_Usuario detectado.

    Igual que en ocultar_marca, la lectura se hace sobre una copia reducida a
    TAMANO_CANONICO -- sea cual sea el tamano real de la imagen recibida.
    """
    imagen_bgr = _leer_imagen_como_bgr(datos_imagen)

    canonica = cv2.resize(imagen_bgr, TAMANO_CANONICO, interpolation=cv2.INTER_AREA)
    embed = EmbedDwtDctSvd(wmLen=WATERMARK_LENGTH_BITS)
    bits = embed.decode(canonica)
    contenido = np.packbits(bits)[:WATERMARK_LENGTH_BYTES].tobytes()

    return contenido.rstrip(b"\x00").decode("utf-8", errors="ignore")
