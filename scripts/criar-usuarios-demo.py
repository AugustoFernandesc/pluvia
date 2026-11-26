#!/usr/bin/env python3
"""Cria os usuários de demonstração no Keycloak, um por papel.

Uso, com o sistema no ar: python scripts/criar-usuarios-demo.py

| Usuário | Papéis |
|---|---|
| gestor | GESTOR |
| tecnico | TECNICO |
| agente | AGENTE |

A senha dos três vem de PLUVIA_DEMO_SENHA em infra/keycloak/.env, e o acesso
administrativo de KC_BOOTSTRAP_ADMIN_*, do mesmo arquivo. Nenhuma senha fica no
código. Rodar de novo não duplica nada: a senha e os papéis são reaplicados.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
KEYCLOAK = os.environ.get("PLUVIA_KEYCLOAK_URL", "http://localhost:8000/auth")
REALM = "pluvia"
USUARIOS = {"gestor": ["GESTOR"], "tecnico": ["TECNICO"], "agente": ["AGENTE"]}


def ler_env(arquivo: Path) -> dict[str, str]:
    valores = {}
    for linha in arquivo.read_text(encoding="utf-8").splitlines():
        if "=" in linha and not linha.lstrip().startswith("#"):
            chave, valor = linha.split("=", 1)
            valores[chave.strip()] = valor.strip()
    return valores


def chamar(metodo: str, caminho: str, token: str | None = None, corpo=None, formulario=None):
    cabecalhos = {}
    dados = None
    if formulario is not None:
        dados = urllib.parse.urlencode(formulario).encode()
    elif corpo is not None:
        dados = json.dumps(corpo).encode()
        cabecalhos["Content-Type"] = "application/json"
    if token:
        cabecalhos["Authorization"] = f"Bearer {token}"
    requisicao = urllib.request.Request(KEYCLOAK + caminho, dados, cabecalhos, method=metodo)
    for _ in range(3):
        try:
            with urllib.request.urlopen(requisicao, timeout=30) as resposta:
                texto = resposta.read()
                return json.loads(texto) if texto else None
        except urllib.error.HTTPError as erro:
            # O Kong limita /auth a 20 requisições por minuto por IP.
            if erro.code != 429:
                raise
            espera = int(erro.headers.get("Retry-After") or 60)
            print(f"limite do gateway atingido, aguardando {espera} s", file=sys.stderr)
            time.sleep(espera)
    raise RuntimeError("o gateway continuou recusando por limite de requisições")


def main() -> int:
    env = ler_env(RAIZ / "infra" / "keycloak" / ".env")
    senha = env.get("PLUVIA_DEMO_SENHA", "")
    if not senha:
        print("Defina PLUVIA_DEMO_SENHA em infra/keycloak/.env.", file=sys.stderr)
        return 1

    admin = chamar("POST", "/realms/master/protocol/openid-connect/token", formulario={
        "grant_type": "password",
        "client_id": "admin-cli",
        "username": env["KC_BOOTSTRAP_ADMIN_USERNAME"],
        "password": env["KC_BOOTSTRAP_ADMIN_PASSWORD"],
    })["access_token"]
    base = f"/admin/realms/{REALM}"
    papeis_do_realm = {p["name"]: p for p in chamar("GET", f"{base}/roles", admin)}

    for usuario, papeis in USUARIOS.items():
        try:
            chamar("POST", f"{base}/users", admin, {
                "username": usuario,
                "enabled": True,
                "emailVerified": True,
                "firstName": usuario.capitalize(),
                "lastName": "Pluvia",
                "email": f"{usuario}@pluvia.test",
            })
        except urllib.error.HTTPError as erro:
            if erro.code != 409:
                raise
        uid = chamar("GET", f"{base}/users?exact=true&username={usuario}", admin)[0]["id"]
        chamar("PUT", f"{base}/users/{uid}/reset-password", admin,
               {"type": "password", "value": senha, "temporary": False})
        chamar("POST", f"{base}/users/{uid}/role-mappings/realm", admin,
               [papeis_do_realm[papel] for papel in papeis])
        print(f"{usuario}: {', '.join(papeis)}")
    print("Senha: PLUVIA_DEMO_SENHA de infra/keycloak/.env")
    return 0


if __name__ == "__main__":
    sys.exit(main())
