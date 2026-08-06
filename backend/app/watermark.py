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

# El algoritmo dwtDctSvd exige imagenes de al menos 256x256.
MIN_IMAGE_SIDE = 256

# dwtDctSvd es mas lento que dwtDct pero bastante mas robusto ante recompresion
# JPEG y otros retoques leves (por eso se eligio para sobrevivir a capturas de pantalla).
# Implementado en app/dwt_dct_svd.py (ver ese archivo para saber por que).


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
    """Incrusta id_usuario de forma invisible en la imagen y devuelve un PNG."""
    imagen_bgr = _leer_imagen_como_bgr(datos_imagen)

    alto, ancho = imagen_bgr.shape[:2]
    if alto < MIN_IMAGE_SIDE or ancho < MIN_IMAGE_SIDE:
        raise ImagenDemasiadoPequenaError(
            f"La imagen debe medir al menos {MIN_IMAGE_SIDE}x{MIN_IMAGE_SIDE} pixeles "
            f"(recibida: {ancho}x{alto})"
        )

    contenido = id_usuario.encode("utf-8")[:WATERMARK_LENGTH_BYTES]
    contenido = contenido.ljust(WATERMARK_LENGTH_BYTES, b"\x00")

    bits = list(np.unpackbits(np.frombuffer(contenido, dtype=np.uint8)))
    embed = EmbedDwtDctSvd(bits, wmLen=len(bits))
    imagen_marcada = embed.encode(imagen_bgr)

    return _bgr_a_png_bytes(imagen_marcada)


def extraer_marca(datos_imagen: bytes) -> str:
    """Lee la marca invisible de la imagen y devuelve el ID_Usuario detectado."""
    imagen_bgr = _leer_imagen_como_bgr(datos_imagen)

    embed = EmbedDwtDctSvd(wmLen=WATERMARK_LENGTH_BITS)
    bits = embed.decode(imagen_bgr)
    contenido = np.packbits(bits)[:WATERMARK_LENGTH_BYTES].tobytes()

    return contenido.rstrip(b"\x00").decode("utf-8", errors="ignore")
