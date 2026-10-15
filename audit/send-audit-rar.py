#!/usr/bin/env python3
"""Send the DGCP evidence RAR volumes through the local YunoHost Postfix."""

from __future__ import annotations

import hashlib
import subprocess
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path


ROOT = Path("/home/jgonzalez/Projects/B2")
PARTS_DIR = ROOT / "mail_parts"
RECIPIENT = "jgonzalezfals@jgonzalezfals.dev"
SENDER = "jgonzalezfals@jgonzalezfals.dev"
SENDMAIL = "/usr/sbin/sendmail"
MESSAGE_SIZE_LIMIT = 35_914_708


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


parts = sorted(PARTS_DIR.glob("DGCP_Evidencia_Tecnica_2026-10-14_envio.part*.rar"))
if len(parts) != 3:
    raise SystemExit(f"Se esperaban 3 volúmenes RAR y se encontraron {len(parts)}")

original_hash = sha256(ROOT / "DGCP_Evidencia_Tecnica_2026-10-14.rar")

for number, part in enumerate(parts, start=1):
    message = EmailMessage()
    message["From"] = f"Auditoría técnica DGCP <{SENDER}>"
    message["To"] = RECIPIENT
    message["Date"] = formatdate(localtime=True)
    message["Message-ID"] = make_msgid(domain="jgonzalezfals.dev")
    message["Subject"] = (
        f"[{number}/{len(parts)}] Auditoría DGCP NORTIC B2 — evidencia RAR"
    )
    message.set_content(
        f"""Adjunto el volumen {number} de {len(parts)} del archivo de evidencia técnica de la auditoría DGCP / NORTIC B2:2017 Nivel A.

Descarga los tres archivos en la misma carpeta y abre el archivo terminado en .part1.rar. Al extraerlo se obtendrá DGCP_Evidencia_Tecnica_2026-10-14.rar.

SHA-256 del RAR original:
{original_hash}

SHA-256 de este volumen:
{sha256(part)}

Archivo: {part.name}
"""
    )
    message.add_attachment(
        part.read_bytes(),
        maintype="application",
        subtype="vnd.rar",
        filename=part.name,
    )
    payload = message.as_bytes()
    if len(payload) > MESSAGE_SIZE_LIMIT:
        raise SystemExit(
            f"El mensaje {number} mide {len(payload)} bytes y excede el límite de Postfix"
        )

    completed = subprocess.run(
        [SENDMAIL, "-t", "-oi", "-f", SENDER],
        input=payload,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if completed.returncode != 0:
        raise SystemExit(
            f"Falló el envío {number}: {completed.stderr.decode(errors='replace')}"
        )
    print(
        f"ACEPTADO {number}/{len(parts)}: {part.name} "
        f"({len(payload)} bytes MIME, sha256={sha256(part)})"
    )
