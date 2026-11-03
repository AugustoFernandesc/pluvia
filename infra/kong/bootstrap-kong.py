#!/usr/bin/env python3
"""Wait for Keycloak JWKS, render the environment-specific DB-less Kong config."""

import argparse
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


class IssuerMismatchError(ValueError):
    """The configured token issuer differs from Keycloak's published issuer."""


def _length(value: int) -> bytes:
    if value < 0x80:
        return bytes([value])
    encoded = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return bytes([0x80 | len(encoded)]) + encoded


def _der(tag: int, value: bytes) -> bytes:
    return bytes([tag]) + _length(len(value)) + value


def _integer(value: bytes) -> bytes:
    value = value.lstrip(b"\x00") or b"\x00"
    if value[0] & 0x80:
        value = b"\x00" + value
    return _der(0x02, value)


def _base64url(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def public_pem_from_jwk(jwk: dict) -> str:
    """Encode an RSA JWK as SubjectPublicKeyInfo PEM using only Python stdlib."""
    if jwk.get("kty") != "RSA" or jwk.get("alg") != "RS256":
        raise ValueError("Esperada uma chave RSA marcada como RS256.")
    modulus = _base64url(jwk["n"])
    exponent = _base64url(jwk["e"])
    rsa_public_key = _der(0x30, _integer(modulus) + _integer(exponent))
    rsa_algorithm = bytes.fromhex("300d06092a864886f70d0101010500")
    subject_public_key_info = _der(
        0x30, rsa_algorithm + _der(0x03, b"\x00" + rsa_public_key)
    )
    encoded = base64.b64encode(subject_public_key_info).decode("ascii")
    lines = [encoded[index : index + 64] for index in range(0, len(encoded), 64)]
    return "-----BEGIN PUBLIC KEY-----\n" + "\n".join(lines) + "\n-----END PUBLIC KEY-----\n"


def _pem_payload(pem: str) -> bytes:
    lines = [line.strip() for line in pem.strip().splitlines()]
    if (
        len(lines) < 3
        or lines[0] != "-----BEGIN PUBLIC KEY-----"
        or lines[-1] != "-----END PUBLIC KEY-----"
    ):
        raise ValueError("A chave deve estar em formato PUBLIC KEY PEM.")
    return base64.b64decode("".join(lines[1:-1]), validate=True)


def _issuer_is_valid(issuer: str) -> bool:
    try:
        parsed = urlsplit(issuer)
        return (
            parsed.scheme in ("http", "https")
            and bool(parsed.netloc)
            and not any(character.isspace() for character in issuer)
            and not parsed.query
            and not parsed.fragment
        )
    except ValueError:
        return False


def _fetch_jwks(url: str, timeout: float) -> list[dict]:
    request = Request(url, headers={"Accept": "application/json"})
    with urlopen(request, timeout=timeout) as response:
        document = json.load(response)
    keys = document.get("keys") if isinstance(document, dict) else None
    if not isinstance(keys, list):
        raise ValueError("O endpoint JWKS não retornou uma lista de chaves.")
    return [
        key
        for key in keys
        if isinstance(key, dict)
        and key.get("kty") == "RSA"
        and key.get("alg") == "RS256"
        and key.get("use", "sig") == "sig"
    ]


def _fetch_issuer(url: str, timeout: float) -> str:
    request = Request(url, headers={"Accept": "application/json"})
    with urlopen(request, timeout=timeout) as response:
        document = json.load(response)
    if not isinstance(document, dict) or not isinstance(document.get("issuer"), str):
        raise ValueError("A descoberta OpenID Connect não contém o issuer.")
    return document["issuer"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--issuer", default=os.environ.get("KEYCLOAK_ISSUER", ""))
    parser.add_argument(
        "--jwks-url", default=os.environ.get("KEYCLOAK_JWKS_URL", "")
    )
    parser.add_argument(
        "--discovery-url", default=os.environ.get("KEYCLOAK_DISCOVERY_URL", "")
    )
    parser.add_argument("--template", type=Path, required=True)
    parser.add_argument("--renderer", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--public-key-file", type=Path)
    parser.add_argument("--key-output", type=Path)
    parser.add_argument("--timeout-seconds", type=int, default=180)
    parser.add_argument("--poll-seconds", type=float, default=2)
    args = parser.parse_args()

    if not _issuer_is_valid(args.issuer):
        parser.error("KEYCLOAK_ISSUER deve ser a URL HTTP(S) exata dos tokens.")
    if not _issuer_is_valid(args.jwks_url):
        parser.error("KEYCLOAK_JWKS_URL deve ser uma URL HTTP(S) válida.")
    if not _issuer_is_valid(args.discovery_url):
        parser.error("KEYCLOAK_DISCOVERY_URL deve ser uma URL HTTP(S) válida.")
    if args.timeout_seconds < 1 or args.poll_seconds <= 0:
        parser.error("O tempo limite e o intervalo de consulta devem ser positivos.")
    if args.public_key_file is None and args.key_output is None:
        parser.error("Informe --key-output ou --public-key-file.")
    if args.renderer.resolve() == args.output.resolve():
        parser.error("A saída não pode substituir o script renderizador.")

    deadline = time.monotonic() + args.timeout_seconds
    jwk = None
    last_error = None
    while time.monotonic() < deadline:
        try:
            discovered_issuer = _fetch_issuer(
                args.discovery_url, timeout=min(5.0, args.poll_seconds + 3)
            )
            if discovered_issuer != args.issuer:
                raise IssuerMismatchError(
                    "KEYCLOAK_ISSUER diverge do issuer anunciado pela descoberta OpenID Connect."
                )
            keys = _fetch_jwks(args.jwks_url, timeout=min(5.0, args.poll_seconds + 3))
            if keys:
                # During key rotation, a configured Secret must match one of the
                # published signing keys instead of silently using a stale key.
                jwk = keys[0]
                if args.public_key_file is not None:
                    configured = args.public_key_file.read_text(encoding="utf-8")
                    configured_der = _pem_payload(configured)
                    matching = next(
                        (
                            candidate
                            for candidate in keys
                            if _pem_payload(public_pem_from_jwk(candidate))
                            == configured_der
                        ),
                        None,
                    )
                    if matching is None:
                        raise ValueError(
                            "A chave pública do Secret não corresponde a nenhuma chave RS256 publicada pelo Keycloak."
                        )
                    jwk = matching
                break
            last_error = ValueError("O JWKS ainda não contém uma chave RSA RS256.")
        except IssuerMismatchError as error:
            print(str(error), file=sys.stderr)
            return 1
        except (
            HTTPError,
            URLError,
            OSError,
            UnicodeError,
            ValueError,
            json.JSONDecodeError,
            KeyError,
        ) as error:
            last_error = error
        time.sleep(min(args.poll_seconds, max(0, deadline - time.monotonic())))

    if jwk is None:
        print(
            f"Keycloak não publicou uma chave RS256 em {args.timeout_seconds}s: {last_error}",
            file=sys.stderr,
        )
        return 1

    key_path = args.public_key_file
    if key_path is None:
        key_path = args.key_output
        key_path.parent.mkdir(parents=True, exist_ok=True)
        key_path.write_text(public_pem_from_jwk(jwk), encoding="utf-8")

    environment = os.environ.copy()
    environment["KEYCLOAK_ISSUER"] = args.issuer
    environment["KEYCLOAK_REALM_PUBLIC_KEY_FILE"] = str(key_path)
    environment.pop("KEYCLOAK_REALM_PUBLIC_KEY", None)
    result = subprocess.run(
        [
            sys.executable,
            str(args.renderer),
            "--template",
            str(args.template),
            "--output",
            str(args.output),
        ],
        env=environment,
        check=False,
    )
    if result.returncode != 0:
        return result.returncode
    if not args.output.is_file() or args.output.stat().st_size == 0:
        print("O arquivo declarativo não foi gerado.", file=sys.stderr)
        return 1
    rendered = args.output.read_text(encoding="utf-8")
    if re.search(r"__KEYCLOAK_[A-Z_]+__|\$\{[^}]+\}", rendered):
        print("A configuração gerada contém marcadores não resolvidos.", file=sys.stderr)
        return 1
    print("Configuração DB-less do Kong pronta.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
