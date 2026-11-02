#!/usr/bin/env python3
"""Exercise real Keycloak tokens through Kong and both BFFs in ephemeral CI."""

import argparse
import base64
import json
import os
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        name, separator, value = line.strip().partition("=")
        if separator and name and not name.startswith("#"):
            values[name] = value
    return values


def http_json(url: str, method: str = "GET", data=None, headers=None):
    body = None
    request_headers = dict(headers or {})
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    request = Request(url, data=body, method=method, headers=request_headers)
    try:
        with urlopen(request, timeout=15) as response:
            content = response.read()
            parsed = json.loads(content) if content else None
            return response.status, parsed, response.headers
    except HTTPError as error:
        content = error.read()
        try:
            parsed = json.loads(content) if content else None
        except json.JSONDecodeError:
            parsed = None
        return error.code, parsed, error.headers


def form_post(url: str, data: dict[str, str], headers=None):
    request_headers = {"Content-Type": "application/x-www-form-urlencoded"}
    request_headers.update(headers or {})
    request = Request(url, data=urlencode(data).encode("utf-8"), headers=request_headers)
    try:
        with urlopen(request, timeout=15) as response:
            return response.status, json.load(response), response.headers
    except HTTPError as error:
        return error.code, json.loads(error.read() or b"{}"), error.headers


def jwt_payload(token: str) -> dict:
    segment = token.split(".")[1]
    decoded = base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))
    return json.loads(decoded)


def assert_status(actual: int, expected: int, label: str) -> None:
    if actual != expected:
        raise AssertionError(f"{label}: esperado HTTP {expected}, recebido {actual}.")


def run(args) -> None:
    secret_values = read_env(args.secret_env_file)
    admin_user = secret_values["KC_BOOTSTRAP_ADMIN_USERNAME"]
    admin_password = secret_values["KC_BOOTSTRAP_ADMIN_PASSWORD"]
    expected_issuer = args.issuer
    direct_root = args.keycloak_url.rstrip("/")
    gateway_root = args.gateway_url.rstrip("/")
    realm = "pluvia"

    # Check the externally visible issuer through the actual gateway/Ingress.
    status, metadata, _ = http_json(
        f"{gateway_root}/auth/realms/{realm}/.well-known/openid-configuration",
        headers={"Host": args.host_header} if args.host_header else None,
    )
    assert_status(status, 200, "descoberta OIDC pelo gateway")
    if metadata.get("issuer") != expected_issuer:
        raise AssertionError("O issuer anunciado pelo Keycloak difere do configurado.")

    status, token_response, _ = form_post(
        f"{direct_root}/realms/master/protocol/openid-connect/token",
        {
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": admin_user,
            "password": admin_password,
        },
    )
    assert_status(status, 200, "token administrativo temporário")
    admin_token = token_response["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    admin_api = f"{direct_root}/admin/realms/{realm}"

    status, realm_roles, _ = http_json(f"{admin_api}/roles", headers=admin_headers)
    assert_status(status, 200, "consulta de papéis")
    roles_by_name = {role["name"]: role for role in realm_roles}
    expected_roles = {"GESTOR", "TECNICO", "AGENTE"}
    if not expected_roles.issubset(roles_by_name):
        raise AssertionError("O realm não publicou todos os papéis exigidos.")

    status, scopes, _ = http_json(
        f"{direct_root}/admin/realms/{realm}/client-scopes",
        headers=admin_headers,
    )
    assert_status(status, 200, "consulta de client scopes")
    scopes_by_name = {scope["name"]: scope["id"] for scope in scopes}
    required_scopes = [
        "roles",
        "pluvia-bff-web-audience",
        "pluvia-bff-mobile-audience",
    ]
    if not set(required_scopes).issubset(scopes_by_name):
        raise AssertionError("Os scopes de roles e audience não estão configurados.")
    scope_ids = [scopes_by_name[name] for name in required_scopes]

    identities = (
        ("GESTOR", "GESTOR"),
        ("TECNICO", "TECNICO"),
        ("AGENTE_1", "AGENTE"),
        ("AGENTE_2", "AGENTE"),
    )
    tokens: dict[str, str] = {}
    subjects: set[str] = set()
    for identity, role in identities:
        client_id = f"ci-pluvia-{identity.lower()}"
        status, _, response_headers = http_json(
            f"{direct_root}/admin/realms/{realm}/clients",
            method="POST",
            data={
                "clientId": client_id,
                "name": f"Ephemeral CI client for {role}",
                "enabled": True,
                "protocol": "openid-connect",
                "publicClient": False,
                "clientAuthenticatorType": "client-secret",
                "standardFlowEnabled": False,
                "implicitFlowEnabled": False,
                "directAccessGrantsEnabled": False,
                "serviceAccountsEnabled": True,
            },
            headers=admin_headers,
        )
        assert_status(status, 201, f"criação do cliente temporário {role}")
        location = response_headers.get("Location", "")
        if not location:
            raise AssertionError(f"Keycloak não retornou o id do cliente {role}.")
        client_uuid = location.rstrip("/").rsplit("/", 1)[-1]
        for scope_id in scope_ids:
            status, _, _ = http_json(
                f"{direct_root}/admin/realms/{realm}/clients/{client_uuid}/default-client-scopes/{scope_id}",
                method="PUT",
                headers=admin_headers,
            )
            assert_status(status, 204, f"scope padrão {role}")

        status, client_secret, _ = http_json(
            f"{direct_root}/admin/realms/{realm}/clients/{client_uuid}/client-secret",
            headers=admin_headers,
        )
        assert_status(status, 200, f"leitura do segredo efêmero {role}")
        status, service_account, _ = http_json(
            f"{direct_root}/admin/realms/{realm}/clients/{client_uuid}/service-account-user",
            headers=admin_headers,
        )
        assert_status(status, 200, f"conta de serviço {role}")

        status, _, _ = http_json(
            f"{direct_root}/admin/realms/{realm}/users/{service_account['id']}/role-mappings/realm",
            method="POST",
            data=[roles_by_name[role]],
            headers=admin_headers,
        )
        assert_status(status, 204, f"atribuição temporária do papel {role}")

        status, access, _ = form_post(
            f"{direct_root}/realms/{realm}/protocol/openid-connect/token",
            {
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret["value"],
            },
        )
        assert_status(status, 200, f"emissão de JWT real para {role}")
        token = access["access_token"]
        claims = jwt_payload(token)
        if claims.get("iss") != expected_issuer:
            raise AssertionError(f"O JWT {role} tem issuer inesperado.")
        if not isinstance(claims.get("exp"), int) or claims["exp"] <= int(time.time()):
            raise AssertionError(f"O JWT {role} não tem expiração futura.")
        token_roles = claims.get("realm_access", {}).get("roles", [])
        if role not in token_roles:
            raise AssertionError(f"O JWT {role} não contém o papel do realm.")
        audience = claims.get("aud", [])
        audience = [audience] if isinstance(audience, str) else audience
        if not {"pluvia-bff-web", "pluvia-bff-mobile"}.issubset(set(audience)):
            raise AssertionError(f"O JWT {role} não contém as audiências dos BFFs.")
        if claims.get("sub") in subjects:
            raise AssertionError("As contas de serviço de teste precisam ter subjects distintos.")
        subjects.add(claims["sub"])
        tokens[identity] = token

    def gateway_request(
        path: str,
        token: str | None = None,
        forged_rate_subject: str | None = None,
    ):
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if forged_rate_subject is not None:
            headers["X-Pluvia-RateLimit-Subject"] = forged_rate_subject
        if args.host_header:
            headers["Host"] = args.host_header
        return http_json(f"{gateway_root}{path}", headers=headers)

    def assert_quota(response_headers, limit: int, remaining: int, label: str) -> None:
        actual_limit = response_headers.get("X-RateLimit-Limit-Minute")
        actual_remaining = response_headers.get("X-RateLimit-Remaining-Minute")
        if actual_limit is None or int(actual_limit) != limit:
            raise AssertionError(
                f"{label}: X-RateLimit-Limit-Minute esperado {limit}, recebido {actual_limit}."
            )
        if actual_remaining is None or int(actual_remaining) != remaining:
            raise AssertionError(
                f"{label}: X-RateLimit-Remaining-Minute esperado {remaining}, recebido {actual_remaining}."
            )

    def assert_internal_header_removed(response: dict, label: str) -> None:
        if response.get("gatewayRateLimitSubjectHeaderPresent") is not False:
            raise AssertionError(f"{label}: o header interno de rate limit chegou ao BFF.")

    assert_status(gateway_request("/web/v1/_system/authorization-check")[0], 401, "Web sem JWT")
    assert_status(
        gateway_request("/web/v1/_system/authorization-check", "invalid.token.value")[0],
        401,
        "Web com JWT inválido",
    )

    status, web_gestor, response_headers = gateway_request(
        "/web/v1/_system/authorization-check",
        tokens["GESTOR"],
        forged_rate_subject="client-controlled-a",
    )
    assert_status(status, 200, "Web com GESTOR")
    if (
        not isinstance(web_gestor.get("roles"), list)
        or "GESTOR" not in web_gestor["roles"]
    ):
        raise AssertionError("O BFF Web não recebeu os papéis verificados do JWT.")
    assert_quota(response_headers, 300, 299, "primeira Web do GESTOR")
    assert_internal_header_removed(web_gestor, "BFF Web")
    if not response_headers.get("X-Request-ID"):
        raise AssertionError("O gateway não devolveu X-Request-ID.")

    time.sleep(0.05)
    status, web_gestor_second, response_headers = gateway_request(
        "/web/v1/_system/authorization-check",
        tokens["GESTOR"],
        forged_rate_subject="client-controlled-b",
    )
    assert_status(status, 200, "segunda Web do GESTOR")
    assert_quota(response_headers, 300, 298, "segunda Web do GESTOR")
    assert_internal_header_removed(web_gestor_second, "BFF Web")

    status, web_tecnico, response_headers = gateway_request(
        "/web/v1/_system/tecnico",
        tokens["TECNICO"],
        forged_rate_subject="client-controlled-a",
    )
    assert_status(status, 200, "Web com TECNICO")
    assert_quota(response_headers, 300, 299, "primeira Web do TECNICO")
    assert_status(
        gateway_request("/web/v1/_system/authorization-check", tokens["AGENTE_1"])[0],
        403,
        "Web com AGENTE",
    )
    assert_status(
        gateway_request("/web/v1/_system/tecnico", tokens["GESTOR"])[0],
        403,
        "Web com GESTOR em rota exclusiva de TECNICO",
    )

    status, public_response, _ = gateway_request(
        "/mobile/v1/publico/_system/status"
    )
    assert_status(status, 200, "rota pública Mobile")
    if public_response.get("access") != "public":
        raise AssertionError("A rota pública Mobile não respondeu pelo BFF esperado.")
    assert_status(
        gateway_request("/mobile/v1/_system/authorization-check")[0],
        401,
        "Mobile sem JWT",
    )
    assert_status(
        gateway_request(
            "/mobile/v1/_system/authorization-check", tokens["GESTOR"]
        )[0],
        403,
        "Mobile com GESTOR",
    )
    status, mobile_agent, response_headers = gateway_request(
        "/mobile/v1/_system/authorization-check",
        tokens["AGENTE_1"],
        forged_rate_subject="client-controlled-a",
    )
    assert_status(status, 200, "Mobile com AGENTE")
    if (
        not isinstance(mobile_agent.get("roles"), list)
        or "AGENTE" not in mobile_agent["roles"]
    ):
        raise AssertionError("O BFF Mobile não recebeu o papel AGENTE do JWT.")

    assert_quota(response_headers, 120, 119, "primeira Mobile do AGENTE_1")
    assert_internal_header_removed(mobile_agent, "BFF Mobile")
    time.sleep(0.05)
    status, _, response_headers = gateway_request(
        "/mobile/v1/_system/authorization-check",
        tokens["AGENTE_1"],
        forged_rate_subject="client-controlled-b",
    )
    assert_status(status, 200, "segunda requisiÃ§Ã£o Mobile com AGENTE_1")
    assert_quota(response_headers, 120, 118, "segunda Mobile do AGENTE_1")
    status, mobile_agent_2, response_headers = gateway_request(
        "/mobile/v1/_system/authorization-check",
        tokens["AGENTE_2"],
        forged_rate_subject="client-controlled-a",
    )
    assert_status(status, 200, "Mobile com segundo AGENTE")
    assert_quota(response_headers, 120, 119, "primeira Mobile do AGENTE_2")
    assert_internal_header_removed(mobile_agent_2, "BFF Mobile")

    consumers = {
        web_gestor.get("gatewayConsumerDiagnostic"),
        mobile_agent.get("gatewayConsumerDiagnostic"),
        mobile_agent_2.get("gatewayConsumerDiagnostic"),
    }
    if consumers != {"pluvia-keycloak"}:
        raise AssertionError(
            "Tokens de subjects diferentes não foram associados ao mesmo consumidor issuer."
        )
    print(
        "Keycloak e Kong emitiram e validaram JWT RS256; "
        "as regras Web/Mobile, o prefixo /auth e os papéis responderam como esperado."
    )
    print(
        "Rate limits por subject (Web 300/min, Mobile 120/min) comprovados com o "
        "Consumer JWT pluvia-keycloak compartilhado; headers forjados foram ignorados "
        "e o header interno foi removido antes dos BFFs."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--secret-env-file", type=Path, required=True)
    parser.add_argument("--keycloak-url", required=True)
    parser.add_argument("--gateway-url", required=True)
    parser.add_argument("--issuer", required=True)
    parser.add_argument("--host-header", default="")
    args = parser.parse_args()
    try:
        run(args)
    except (AssertionError, KeyError, OSError, URLError, ValueError) as error:
        # No token, password, response body, or environment value is included.
        print(f"Autenticação integrada falhou: {error}")
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
