import logging
import re

import fitz

from app.watermark import MIN_IMAGE_SIDE, ImagenDemasiadoPequenaError, extraer_marca, ocultar_marca

logger = logging.getLogger("app")

# Caracteres de control ASCII (STX/ETX) que nunca aparecen en texto normal; se usan
# como "sobres" para poder encontrar el codigo sin ambiguedad al extraerlo.
# (Se probaron caracteres de la zona de uso privado de Unicode primero, pero la
# fuente por defecto de PyMuPDF no los conserva al extraer texto: los convierte en
# el caracter de reemplazo U+FFFD y el marcador de inicio y de fin se vuelven
# indistinguibles entre si.)
MARCADOR_INICIO = chr(0x02)
MARCADOR_FIN = chr(0x03)

PATRON_BUSQUEDA = re.compile(re.escape(MARCADOR_INICIO) + "(.*?)" + re.escape(MARCADOR_FIN))


class PdfInvalidoError(Exception):
    pass


def _abrir_pdf(datos_pdf: bytes) -> fitz.Document:
    try:
        return fitz.open(stream=datos_pdf, filetype="pdf")
    except Exception as error:
        raise PdfInvalidoError(f"El archivo no es un PDF valido: {error}")


def _pagina_es_escaneo(pagina: fitz.Page) -> bool:
    """Una pagina 'escaneada' no tiene texto real, solo una o mas imagenes (como
    saldria de un scanner o una foto de un documento pegada en el PDF)."""
    return not pagina.get_text().strip() and len(pagina.get_images()) > 0


def _marcar_imagenes_de_pagina(doc: fitz.Document, pagina: fitz.Page, id_usuario: str) -> None:
    for imagen_info in pagina.get_images(full=True):
        xref = imagen_info[0]
        ancho, alto = imagen_info[2], imagen_info[3]
        if ancho < MIN_IMAGE_SIDE or alto < MIN_IMAGE_SIDE:
            logger.warning(
                "Imagen xref=%s de %sx%s pixeles omitida por ser menor a %sx%s",
                xref, ancho, alto, MIN_IMAGE_SIDE, MIN_IMAGE_SIDE,
            )
            continue

        try:
            datos_imagen = doc.extract_image(xref)["image"]
            imagen_marcada = ocultar_marca(datos_imagen, id_usuario)
            pagina.replace_image(xref, stream=imagen_marcada)
        except ImagenDemasiadoPequenaError:
            logger.warning("Imagen xref=%s omitida: demasiado pequena para marcar", xref)
        except Exception as error:
            logger.warning("No se pudo marcar la imagen xref=%s de la pagina escaneada: %s", xref, error)


def ocultar_marca_pdf(datos_pdf: bytes, id_usuario: str) -> bytes:
    """Esconde id_usuario en cada pagina del PDF.

    Si la pagina tiene texto real, se usa texto en modo invisible (render_mode=3):
    el texto queda en el contenido del PDF (se puede extraer/buscar) pero ningun
    lector lo dibuja en pantalla ni al imprimir. A diferencia de los metadatos,
    sobrevive a que alguien limpie metadatos, re-guarde el archivo con otra
    herramienta, o reenvie solo una pagina suelta.

    Si la pagina NO tiene texto (es un escaneo: solo contiene una o mas imagenes),
    se aplica en su lugar el mismo marcado invisible en frecuencia que se usa para
    imagenes sueltas (ver watermark.py), directamente sobre cada imagen embebida.
    """
    doc = _abrir_pdf(datos_pdf)
    texto_oculto = MARCADOR_INICIO + id_usuario + MARCADOR_FIN

    for pagina in doc:
        if _pagina_es_escaneo(pagina):
            _marcar_imagenes_de_pagina(doc, pagina, id_usuario)
        else:
            pagina.insert_text((5, 10), texto_oculto, fontsize=1, render_mode=3)

    # garbage=4 elimina objetos huerfanos: sin esto, la imagen ORIGINAL sin marcar
    # se queda tambien guardada dentro del archivo (aunque ya no se dibuje),
    # extraible por cualquiera que abra el PDF con una herramienta de bajo nivel.
    resultado = doc.tobytes(garbage=4, deflate=True)
    doc.close()
    return resultado


def extraer_marca_pdf(datos_pdf: bytes) -> str:
    """Lee el codigo escondido en un PDF marcado. Devuelve '' si no encuentra ninguno.

    Primero busca el marcador de texto invisible en el contenido de las paginas.
    Si no aparece en ninguna pagina (por ejemplo, porque todo el documento es un
    escaneo), prueba a decodificar la marca de frecuencia en cada imagen embebida.
    """
    doc = _abrir_pdf(datos_pdf)

    texto_completo = ""
    for pagina in doc:
        texto_completo += pagina.get_text()

    coincidencia = PATRON_BUSQUEDA.search(texto_completo)
    if coincidencia:
        doc.close()
        return coincidencia.group(1)

    for pagina in doc:
        for imagen_info in pagina.get_images(full=True):
            xref = imagen_info[0]
            ancho, alto = imagen_info[2], imagen_info[3]
            if ancho < MIN_IMAGE_SIDE or alto < MIN_IMAGE_SIDE:
                continue
            try:
                datos_imagen = doc.extract_image(xref)["image"]
                detectado = extraer_marca(datos_imagen)
            except Exception as error:
                logger.warning("No se pudo leer la imagen xref=%s: %s", xref, error)
                continue
            if detectado:
                doc.close()
                return detectado

    doc.close()
    return ""
