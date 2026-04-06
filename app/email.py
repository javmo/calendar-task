"""
Email notification helpers (SMTP).
"""
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM


async def send_email(to_email: str, subject: str, html_body: str) -> bool:
    """Send email notification via SMTP. Fails silently if not configured."""
    if not SMTP_HOST or not SMTP_USER:
        print(f"Email no configurado — no se envió: {subject}")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM or SMTP_USER
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(msg["From"], to_email, msg.as_string())
        print(f"Email enviado a {to_email}: {subject}")
        return True
    except Exception as e:
        print(f"Error enviando email: {e}")
        return False


def _approval_email_html(cliente: str, tarea: str, admin_name: str, today: str, comment: str) -> str:
    comment_row = (
        f'<p style="margin:4px 0"><strong>Comentario:</strong> {comment}</p>'
        if comment and comment != "Tarea aprobada por admin" else ""
    )
    return f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <h2 style="color:#059669">&#x2705; Tarea Aprobada</h2>
            <p>Hola,</p>
            <p>La siguiente tarea fue <strong>aprobada y finalizada</strong> por <strong>{admin_name}</strong>:</p>
            <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:16px;margin:16px 0">
                <p style="margin:4px 0"><strong>Cliente:</strong> {cliente}</p>
                <p style="margin:4px 0"><strong>Tarea:</strong> {tarea}</p>
                <p style="margin:4px 0"><strong>Fecha:</strong> {today}</p>
                {comment_row}
            </div>
            <p style="color:#6b7280;font-size:13px">— Calendario de Tareas</p>
        </div>
        """


def _return_email_html(cliente: str, tarea: str, admin_name: str, comment: str) -> str:
    return f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <h2 style="color:#d97706">&#x21a9;&#xfe0f; Tarea Devuelta</h2>
            <p>Hola,</p>
            <p>La siguiente tarea fue <strong>devuelta con observaciones</strong> por <strong>{admin_name}</strong>:</p>
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0">
                <p style="margin:4px 0"><strong>Cliente:</strong> {cliente}</p>
                <p style="margin:4px 0"><strong>Tarea:</strong> {tarea}</p>
                <p style="margin:4px 0"><strong>Observación:</strong> {comment}</p>
            </div>
            <p>Por favor revisá la tarea y volvé a enviarla para revisión.</p>
            <p style="color:#6b7280;font-size:13px">— Calendario de Tareas</p>
        </div>
        """
