#!/usr/bin/env python3
"""Gera o YAML declarativo do Kong com issuer e chave pública do ambiente."""

import argparse
import base64
import binascii
import json
import os
from pathlib import Path
import re
from urllib.parse import urlsplit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--template", type=Path,
        default=Path(__file__).resolve().with_name("kong.yml.template"),
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    issuer = os.environ.get("KEYCLOAK_ISSUER", "")
    try:
        url = urlsplit(issuer)
    except ValueError:
        parser.error("KEYCLOAK_ISSUER deve ser uma URL HTTP(S) válida.")
    if (url.scheme not in ("http", "https") or not url.netloc
            or any(c.isspace() for c in issuer) or url.query or url.fragment):
        parser.error("KEYCLOAK_ISSUER deve ser a URL exata do emissor dos tokens.")

    pem_value = os.environ.get("KEYCLOAK_REALM_PUBLIC_KEY")
    pem_file = os.environ.get("KEYCLOAK_REALM_PUBLIC_KEY_FILE")
    if (pem_value is None) == (pem_file is None):
        parser.error("Defina exatamente uma entrada: KEYCLOAK_REALM_PUBLIC_KEY "
                     "ou KEYCLOAK_REALM_PUBLIC_KEY_FILE.")
    try:
        pem = Path(pem_file).read_text(encoding="utf-8") if pem_file is not None else pem_value
    except (OSError, UnicodeError, ValueError):
        parser.error("Não foi possível ler o arquivo da chave pública PEM.")
    pem = pem.replace("\r\n", "\n").strip() + "\n"
    lines = pem.splitlines()
    endings = {
        "-----BEGIN PUBLIC KEY-----": "-----END PUBLIC KEY-----",
        "-----BEGIN RSA PUBLIC KEY-----": "-----END RSA PUBLIC KEY-----",
    }
    if len(lines) < 3 or lines[0] not in endings or lines[-1] != endings[lines[0]]:
        parser.error("A chave pública deve estar em formato PEM completo.")
    try:
        if not base64.b64decode("".join(lines[1:-1]), validate=True):
            raise ValueError
    except (binascii.Error, ValueError):
        parser.error("O conteúdo Base64 da chave pública PEM é inválido.")

    try:
        template = args.template.read_text(encoding="utf-8")
        values = {
            "__KEYCLOAK_ISSUER_JSON__": issuer,
            "__KEYCLOAK_REALM_PUBLIC_KEY_JSON__": pem,
        }
        for marker, value in values.items():
            if template.count(marker) != 1:
                parser.error("O modelo deve conter uma ocorrência de cada marcador esperado.")
            template = template.replace(marker, json.dumps(value))
        if re.search(r"__KEYCLOAK_[A-Z_]+__|\$\{[^}]+\}", template):
            parser.error("Há marcadores não resolvidos no modelo.")
        if args.output.resolve() == args.template.resolve():
            parser.error("O arquivo de saída deve ser diferente do modelo.")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(template, encoding="utf-8")
    except (OSError, UnicodeError):
        parser.error("Não foi possível ler o modelo ou gravar a configuração final.")
    print("Configuração gerada. Valide com kong config parse antes de iniciar o Kong.")


if __name__ == "__main__":
    main()
