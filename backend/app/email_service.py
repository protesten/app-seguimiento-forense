import base64
import os

import httpx

RESEND_API_URL = "https://api.resend.com/emails"


class EnvioEmailError(Exception):
    pass


def enviar_archivo_por_email(
    email_destinatario: str,
    nombre_destinatario: str,
    nombre_archivo: str,
    datos_archivo: bytes,
) -> None:
    """Envia datos_archivo como adjunto a email_destinatario usando Resend.

    Requiere RESEND_API_KEY configurada. Si el remitente (RESEND_FROM_EMAIL)
    no es de un dominio verificado en Resend, la cuenta gratuita solo deja
    enviar al email con el que te registraste en Resend -- ver "Enviar
    directamente por email" en el README para el detalle.
    """
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        raise EnvioEmailError(
            "El envio por email no esta configurado en el servidor (falta RESEND_API_KEY)"
        )
    remitente = os.environ.get("RESEND_FROM_EMAIL", "onboarding@resend.dev")

    cuerpo = {
        "from": remitente,
        "to": [email_destinatario],
        "subject": "Tienes un documento nuevo",
        "html": (
            f"<p>Hola {nombre_destinatario},</p>"
            "<p>Te adjuntamos el documento.</p>"
        ),
        "attachments": [
            {
                "filename": nombre_archivo,
                "content": base64.b64encode(datos_archivo).decode("ascii"),
            }
        ],
    }

    try:
        respuesta = httpx.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=cuerpo,
            timeout=30.0,
        )
    except httpx.HTTPError as error:
        raise EnvioEmailError(f"No se pudo contactar con el servicio de email: {error}")

    if respuesta.status_code >= 400:
        raise EnvioEmailError(
            f"El servicio de email devolvio un error ({respuesta.status_code}): {respuesta.text}"
        )
