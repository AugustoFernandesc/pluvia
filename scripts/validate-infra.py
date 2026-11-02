#!/usr/bin/env python3
"""Static consistency checks for Compose, Kong, BFF and Kubernetes files."""

import json
from pathlib import Path
import sys

import yaml


ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []


def fail(message: str) -> None:
    ERRORS.append(message)


def load_yaml(path: Path):
    try:
        documents = list(yaml.safe_load_all(path.read_text(encoding="utf-8")))
        return documents[0] if len(documents) == 1 else documents
    except Exception as error:
        fail(f"{path.relative_to(ROOT)}: YAML inválido ({error}).")
        return None


def validate_syntax() -> None:
    for extension in ("*.yaml", "*.yml"):
        for path in ROOT.rglob(extension):
            if any(part in {".git", "node_modules", "dist"} for part in path.parts):
                continue
            load_yaml(path)
    for path in ROOT.rglob("*.json"):
        if any(part in {".git", "node_modules", "dist"} for part in path.parts):
            continue
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except Exception as error:
            fail(f"{path.relative_to(ROOT)}: JSON inválido ({error}).")
    load_yaml(ROOT / "gateway" / "kong.yml.template")


def _route_by_name(document: dict, name: str) -> dict:
    for service in document.get("services", []):
        for route in service.get("routes", []):
            if route.get("name") == name:
                return route
    fail(f"Rota Kong obrigatória ausente: {name}.")
    return {}


def _plugin(config: dict, name: str, scope: str) -> dict:
    for plugin in config.get("plugins", []):
        if plugin.get("name") == name:
            return plugin.get("config", {})
    fail(f"Plugin Kong {name} ausente em {scope}.")
    return {}


def validate_kong() -> None:
    path = ROOT / "gateway" / "kong.yml.template"
    document = load_yaml(path)
    if not isinstance(document, dict):
        return
    services = {service["name"]: service for service in document["services"]}
    service_urls = {name: service["url"] for name, service in services.items()}
    if service_urls != {
        "bff-web": "http://bff-web:3000",
        "bff-mobile": "http://bff-mobile:3000",
        "keycloak": "http://keycloak:8080",
    }:
        fail("Kong deve encaminhar apenas para os dois BFFs e o Keycloak.")

    expected = {
        "web": (["/web/v1"], False),
        "mobile-publico": (["/mobile/v1/publico"], False),
        "mobile": (["/mobile/v1"], False),
        "auth": (["/auth"], True),
    }
    for route_name, (paths, strip_path) in expected.items():
        route = _route_by_name(document, route_name)
        if route.get("paths") != paths or route.get("strip_path") is not strip_path:
            fail(f"Rota Kong {route_name} tem caminho ou strip_path inesperado.")

    web = _route_by_name(document, "web")
    mobile = _route_by_name(document, "mobile")
    public = _route_by_name(document, "mobile-publico")
    auth = _route_by_name(document, "auth")
    jwt_config = _plugin({"plugins": services["bff-web"].get("plugins", [])}, "jwt", "web")
    if jwt_config.get("key_claim_name") != "iss" or jwt_config.get("claims_to_verify") != ["exp"]:
        fail("Kong JWT deve localizar o consumidor pelo issuer e verificar exp.")
    subject_header = "X-Pluvia-RateLimit-Subject"
    for name, route, limit, limit_by in (
        ("web", {"plugins": services["bff-web"].get("plugins", [])}, 300, "header"),
        ("mobile", mobile, 120, "header"),
        ("mobile-publico", public, 30, "ip"),
        ("auth", {"plugins": services["keycloak"].get("plugins", [])}, 20, "ip"),
    ):
        plugin = _plugin({"plugins": route.get("plugins", [])}, "rate-limiting", name)
        if plugin.get("minute") != limit or plugin.get("limit_by") != limit_by:
            fail(f"Rate limit da rota {name} diverge da arquitetura.")
        if limit_by == "header" and plugin.get("header_name") != subject_header:
            fail(f"Rate limit autenticado de {name} não usa o header interno configurado.")

    web_plugins = services["bff-web"].get("plugins", [])
    mobile_service_plugins = services["bff-mobile"].get("plugins", [])
    if not any(plugin.get("name") == "pluvia-subject-rate-limit" for plugin in web_plugins):
        fail("O Web precisa derivar a chave do rate limit do JWT autenticado.")
    if not any(plugin.get("name") == "pluvia-subject-rate-limit" for plugin in mobile.get("plugins", [])):
        fail("A rota Mobile protegida precisa derivar a chave do rate limit do JWT autenticado.")
    for name, plugins in (("Web", web_plugins), ("Mobile", mobile_service_plugins)):
        transformer = _plugin({"plugins": plugins}, "request-transformer", name)
        removed_headers = transformer.get("remove", {}).get("headers", [])
        if subject_header not in removed_headers:
            fail(f"O {name} precisa remover o header interno antes do upstream.")

    plugin_dir = ROOT / "infra" / "kong" / "plugins" / "pluvia-subject-rate-limit"
    handler_path = plugin_dir / "handler.lua"
    schema_path = plugin_dir / "schema.lua"
    if not handler_path.is_file() or not schema_path.is_file():
        fail("O plugin Lua local do Kong precisa conter handler.lua e schema.lua.")
    elif handler_path.is_file():
        source = handler_path.read_text(encoding="utf-8")
        if not all(
            marker in source
            for marker in (
                "PRIORITY = 1000",
                "authenticated_jwt_token",
                "claims.sub",
                "sha256.sha256_hex",
                "pcall(ngx.req.set_header",
            )
        ):
            fail("O plugin deve usar o JWT validado e sobrescrever o header em prioridade compatível.")
    dockerfile = (ROOT / "infra" / "kong" / "Dockerfile").read_text(encoding="utf-8")
    if "FROM kong:3.9.3" not in dockerfile or "KONG_PLUGINS=bundled,pluvia-subject-rate-limit" not in dockerfile:
        fail("A imagem Kong deve fixar 3.9.3 e carregar o plugin local.")
    compose_kong = load_yaml(ROOT / "infra" / "kong" / "compose.yaml")
    compose_image = (
        compose_kong.get("services", {}).get("kong", {}).get("image")
        if isinstance(compose_kong, dict)
        else None
    )
    if compose_image != "pluvia/kong:local":
        fail("Compose deve executar a imagem Kong que contém o plugin local.")
    expected_proxy_buffers = {
        "KONG_NGINX_PROXY_PROXY_BUFFER_SIZE": "16k",
        "KONG_NGINX_PROXY_PROXY_BUFFERS": "8 16k",
        "KONG_NGINX_PROXY_PROXY_BUSY_BUFFERS_SIZE": "32k",
    }
    compose_buffer_config = (
        compose_kong.get("services", {}).get("kong", {}).get("environment", {})
        if isinstance(compose_kong, dict)
        else {}
    )
    if any(compose_buffer_config.get(name) != value for name, value in expected_proxy_buffers.items()):
        fail("Compose deve dimensionar juntos os buffers proxy do Kong para Nginx aceitar a configuração.")
    deployment = load_yaml(ROOT / "k8s" / "kong" / "deployment.yaml")
    k8s_container = (
        deployment.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [{}])[0]
        if isinstance(deployment, dict)
        else {}
    )
    k8s_environment = {
        item.get("name"): item.get("value")
        for item in k8s_container.get("env", [])
        if isinstance(item, dict)
    }
    if any(k8s_environment.get(name) != value for name, value in expected_proxy_buffers.items()):
        fail("Kubernetes deve usar o mesmo dimensionamento válido de buffers proxy do Kong.")

    global_names = {plugin.get("name") for plugin in document.get("plugins", [])}
    required_global = {"correlation-id", "request-size-limiting"}
    if not required_global.issubset(global_names):
        fail("Kong precisa manter correlation-id e request-size-limiting globais.")
    if "cors" not in {
        plugin.get("name") for plugin in services["bff-web"].get("plugins", [])
    }:
        fail("Kong deve manter o plugin CORS na rota Web.")
    correlation = _plugin(document, "correlation-id", "global")
    if correlation.get("header_name") != "X-Request-ID" or correlation.get("generator") != "uuid":
        fail("Kong deve gerar e devolver X-Request-ID UUID.")
    size = _plugin(document, "request-size-limiting", "global")
    if size.get("allowed_payload_size") != 1:
        fail("Kong deve manter o limite global de payload de 1 MB.")
    credential = document.get("consumers", [{}])[0].get("jwt_secrets", [{}])[0]
    if credential.get("algorithm") != "RS256":
        fail("O consumidor JWT do Keycloak precisa usar RS256.")


def validate_bffs() -> None:
    forbidden = ("POSTGRES_", "typeorm", "@nestjs/typeorm", '"pg"', "testcontainers")
    for name in ("bff-web", "bff-mobile"):
        service = ROOT / "services" / name
        package = json.loads((service / "package.json").read_text(encoding="utf-8"))
        lock = json.loads((service / "package-lock.json").read_text(encoding="utf-8"))
        combined = json.dumps(package) + json.dumps(lock)
        if package["name"] != name or lock["name"] != name:
            fail(f"{name}: package.json e package-lock.json precisam usar o nome do BFF.")
        if any(term.lower() in combined.lower() for term in forbidden):
            fail(f"{name}: dependência ou referência de banco herdada do template.")
        for file_name in ("compose.yaml", "Dockerfile", ".dockerignore", ".env.example"):
            if not (service / file_name).is_file():
                fail(f"{name}: falta {file_name}.")
        compose = load_yaml(service / "compose.yaml")
        if compose and name in compose.get("services", {}):
            definition = compose["services"][name]
            if "ports" in definition:
                fail(f"{name}: Compose não deve publicar a porta interna.")
            if "volumes" in compose:
                fail(f"{name}: Compose não deve criar volumes de banco.")
        source = "\n".join(
            path.read_text(encoding="utf-8")
            for path in (service / "src").rglob("*.ts")
        ).lower()
        if any(term.lower() in source for term in forbidden):
            fail(f"{name}: fonte ainda contém referências a banco.")
        if "web/v1" not in (service / "src" / "ioc" / "configurar-app.ts").read_text(encoding="utf-8") and name == "bff-web":
            fail("BFF Web não configura /web/v1.")
        if "mobile/v1" not in (service / "src" / "ioc" / "configurar-app.ts").read_text(encoding="utf-8") and name == "bff-mobile":
            fail("BFF Mobile não configura /mobile/v1.")


def validate_kubernetes() -> None:
    root = load_yaml(ROOT / "k8s" / "kustomization.yaml")
    expected = {
        "bff-web",
        "bff-mobile",
        "keycloak",
        "kong",
        "ingress",
        "analise",
        "risco",
    }
    resources = set(root.get("resources", [])) if isinstance(root, dict) else set()
    if not expected.issubset(resources):
        fail("A Kustomization raiz não inclui BFFs, Keycloak, Kong e Ingress.")

    kong_deployment = load_yaml(ROOT / "k8s" / "kong" / "deployment.yaml")
    if kong_deployment:
        kong_image = kong_deployment["spec"]["template"]["spec"]["containers"][0].get("image")
        if kong_image != "pluvia/kong:local":
            fail("Kubernetes deve executar a imagem Kong que contém o plugin local.")

    for component in ("bff-web", "bff-mobile"):
        folder = ROOT / "k8s" / component
        kustomization = load_yaml(folder / "kustomization.yaml")
        names = set(kustomization.get("resources", [])) if isinstance(kustomization, dict) else set()
        if not {"configmap.yaml", "deployment.yaml", "service.yaml"}.issubset(names):
            fail(f"k8s/{component}: faltam ConfigMap, Deployment ou Service.")
        if (folder / "db.yaml").exists():
            fail(f"k8s/{component}: não pode declarar banco.")
        deployment = load_yaml(folder / "deployment.yaml")
        if deployment:
            container = deployment["spec"]["template"]["spec"]["containers"][0]
            if container.get("ports", [{}])[0].get("containerPort") != 3000:
                fail(f"k8s/{component}: porta do Deployment deve ser 3000.")
            if not container.get("readinessProbe") or not container.get("livenessProbe"):
                fail(f"k8s/{component}: probes não configuradas.")

    ingress = load_yaml(ROOT / "k8s" / "ingress" / "ingress.yaml")
    if ingress:
        paths = ingress["spec"]["rules"][0]["http"]["paths"]
        if any(path["backend"]["service"]["name"] != "kong" for path in paths):
            fail("O Ingress deve encaminhar somente ao Service do Kong.")
        if ingress["spec"].get("ingressClassName") != "traefik":
            fail("O Ingress deve declarar a classe Traefik.")

    realm = ROOT / "infra" / "keycloak" / "realm" / "pluvia-realm.json"
    copied_realm = ROOT / "k8s" / "keycloak" / "pluvia-realm.json"
    if realm.exists() and copied_realm.exists():
        if realm.read_bytes() != copied_realm.read_bytes():
            fail("A cópia de importação Kubernetes do realm divergiu da configuração canônica.")
    if realm.exists():
        realm_config = json.loads(realm.read_text(encoding="utf-8"))
        client_scopes = {
            scope.get("name"): scope for scope in realm_config.get("clientScopes", [])
        }
        for client in realm_config.get("clients", []):
            missing_scopes = set(client.get("defaultClientScopes", [])) - set(client_scopes)
            if missing_scopes:
                fail(
                    f"Keycloak client {client.get('clientId')} referencia scopes não declarados: "
                    f"{', '.join(sorted(missing_scopes))}."
                )
        roles_scope = client_scopes.get("roles", {})
        realm_roles_mapper = any(
            mapper.get("protocolMapper") == "oidc-usermodel-realm-role-mapper"
            and mapper.get("config", {}).get("claim.name") == "realm_access.roles"
            and mapper.get("config", {}).get("access.token.claim") == "true"
            for mapper in roles_scope.get("protocolMappers", [])
        )
        if not realm_roles_mapper:
            fail("Keycloak precisa declarar o scope roles com mapper de papéis do realm no access token.")
        expected_audiences = {
            "pluvia-bff-web-audience": "pluvia-bff-web",
            "pluvia-bff-mobile-audience": "pluvia-bff-mobile",
        }
        for scope_name, audience in expected_audiences.items():
            audience_scope = client_scopes.get(scope_name, {})
            audience_mapper = any(
                mapper.get("protocolMapper") == "oidc-audience-mapper"
                and mapper.get("config", {}).get("included.custom.audience") == audience
                and mapper.get("config", {}).get("access.token.claim") == "true"
                for mapper in audience_scope.get("protocolMappers", [])
            )
            if not audience_mapper:
                fail(
                    f"Keycloak scope {scope_name} precisa adicionar a audience customizada {audience} ao access token."
                )


def validate_compose_root() -> None:
    root = load_yaml(ROOT / "docker-compose.yml")
    included = set(root.get("include", [])) if isinstance(root, dict) else set()
    expected = {
        "services/bff-web/compose.yaml",
        "services/bff-mobile/compose.yaml",
        "infra/keycloak/compose.yaml",
        "infra/kong/compose.yaml",
        "services/analise/compose.yaml",
        "services/risco/compose.yaml",
    }
    if not expected.issubset(included):
        fail("Compose raiz não inclui todos os componentes implementados.")

    keycloak_compose = load_yaml(ROOT / "infra" / "keycloak" / "compose.yaml")
    healthcheck = (
        keycloak_compose.get("services", {}).get("keycloak", {}).get("healthcheck", {})
        if isinstance(keycloak_compose, dict)
        else {}
    )
    healthcheck_command = healthcheck.get("test", [])
    shell_check = healthcheck_command[-1] if healthcheck_command else ""
    if "$$status" not in shell_check or " 200 " not in shell_check:
        fail("Healthcheck Compose do Keycloak deve preservar $status para o shell e exigir HTTP 200.")

    keycloak_dockerfile = (ROOT / "infra" / "keycloak" / "Dockerfile").read_text(encoding="utf-8")
    if "KC_HTTP_MANAGEMENT_HEALTH_ENABLED=true" not in keycloak_dockerfile:
        fail("A imagem otimizada do Keycloak deve persistir o healthcheck de management usado no runtime.")


def validate_ci_workflow() -> None:
    workflow = load_yaml(ROOT / ".github" / "workflows" / "ci.yml")
    if not isinstance(workflow, dict):
        return
    jobs = workflow.get("jobs", {})
    kubectl_versions = []
    for job in jobs.values():
        for step in job.get("steps", []):
            if step.get("uses", "").startswith("azure/setup-kubectl@"):
                kubectl_versions.append(step.get("with", {}).get("version"))
    if kubectl_versions != ["v1.32.2", "v1.32.2"]:
        fail("Os jobs de CI devem instalar kubectl 1.32.2 compatível com o Kind configurado.")

    kind_steps = [
        step
        for step in jobs.get("kubernetes-kind", {}).get("steps", [])
        if step.get("uses", "").startswith("helm/kind-action@")
    ]
    if kind_steps:
        fail("O job Kind não deve usar a instalação legada de kubectl da helm/kind-action.")
    kind_install_step = next(
        (
            step
            for step in jobs.get("kubernetes-kind", {}).get("steps", [])
            if step.get("name") == "Instalar Kind v0.27.0 com checksum oficial"
        ),
        {},
    )
    kind_install = kind_install_step.get("run", "")
    if not all(
        marker in kind_install
        for marker in (
            "https://github.com/kubernetes-sigs/kind/releases/download/",
            "kind-linux-amd64.sha256sum",
            "sha256sum --check",
        )
    ) or kind_install_step.get("env", {}).get("KIND_VERSION") != "v0.27.0":
        fail("O workflow deve instalar Kind v0.27.0 do release oficial e validar o checksum.")
    kind_create_step = next(
        (
            step
            for step in jobs.get("kubernetes-kind", {}).get("steps", [])
            if step.get("name") == "Conferir kubectl e criar cluster Kind"
        ),
        {},
    )
    kind_create = kind_create_step.get("run", "")
    if not all(
        marker in kind_create
        for marker in (
            "kubectl version --client",
            "kind create cluster --name pluvia",
        )
    ) or not str(kind_create_step.get("env", {}).get("KIND_NODE_IMAGE", "")).startswith(
        "kindest/node:v1.32.2@sha256:"
    ):
        fail("O job Kind deve validar kubectl e criar o nó com versão fixada antes dos deploys.")

    docker_job_steps = jobs.get("docker-integration", {}).get("steps", [])
    compose_run = next(
        (step.get("run", "") for step in docker_job_steps if step.get("name") == "Construir e iniciar apenas a infraestrutura deste escopo"),
        "",
    )
    if "kong-config" in compose_run.split("up -d --wait", 1)[-1].splitlines()[0]:
        fail("A CI não deve aguardar com --wait o serviço one-shot kong-config.")
    if 'build bff-web bff-mobile keycloak kong' not in compose_run:
        fail("A CI Docker deve construir o serviço Kong usando a imagem com o plugin local.")
    if not any(
        step.get("name") == "Diagnosticar falha Docker, Keycloak ou Kong"
        and step.get("if") == "failure()"
        and "logs --no-color --timestamps --tail=200" in step.get("run", "")
        for step in docker_job_steps
    ):
        fail("O job Docker deve exibir estado e logs de Keycloak, PostgreSQL e Kong quando falhar.")

    kind_run = "\n".join(step.get("run", "") for step in jobs.get("kubernetes-kind", {}).get("steps", []))
    for marker in (
        "export KEYCLOAK_ISSUER=",
        "export KEYCLOAK_JWKS_URL=",
        "export KEYCLOAK_DISCOVERY_URL=",
        "bootstrap-kong.py",
        "kubectl get ingressclass traefik",
        "pluvia/kong:local",
    ):
        if marker not in kind_run:
            fail(f"O job Kind não inclui a etapa necessária: {marker}.")
    if not any(
        step.get("name") == "Diagnosticar falha Kubernetes, Kind ou Traefik"
        and step.get("if") == "failure()"
        and all(
            marker in step.get("run", "")
            for marker in (
                "kubectl get services -A",
                "kubectl describe services -A",
                "kubectl get events -A",
                "kubectl describe ingress -A",
                "kubectl logs",
                "--all-containers",
                "--previous",
            )
        )
        for step in jobs.get("kubernetes-kind", {}).get("steps", [])
    ):
        fail("O job Kubernetes deve diagnosticar eventos, Ingress, pods e logs dos containers anteriores.")
    traefik_install = next(
        (
            step.get("run", "")
            for step in jobs.get("kubernetes-kind", {}).get("steps", [])
            if step.get("name") == "Instalar Traefik no cluster temporário"
        ),
        "",
    )
    if "--set service.spec.type=ClusterIP" not in traefik_install:
        fail("Traefik em Kind deve usar Service ClusterIP, compatível com o port-forward e sem LoadBalancer externo.")

    integration = (ROOT / "scripts" / "ci_integration.py").read_text(encoding="utf-8")
    if not all(
        marker in integration
        for marker in (
            "AGENTE_2",
            "client-controlled-a",
            "X-Pluvia-RateLimit-Subject",
            "gatewayRateLimitSubjectHeaderPresent",
            "assert_quota(response_headers, 300",
            "assert_quota(response_headers, 120",
            '"GESTOR" not in web_gestor["roles"]',
            '"AGENTE" not in mobile_agent["roles"]',
        )
    ):
        fail("O teste integrado precisa cobrir quotas por subject, spoofing e remoção do header.")


def main() -> int:
    validate_syntax()
    validate_kong()
    validate_bffs()
    validate_kubernetes()
    validate_compose_root()
    validate_ci_workflow()
    if ERRORS:
        for error in ERRORS:
            print(f"ERRO: {error}", file=sys.stderr)
        return 1
    print("Validações estáticas de YAML, JSON, Kong, Compose, Kubernetes e CI aprovadas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
