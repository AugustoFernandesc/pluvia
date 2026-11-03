#!/usr/bin/env python3
"""Create ignored, disposable credentials/config files for hosted CI only."""

from pathlib import Path
import secrets


ROOT = Path(__file__).resolve().parents[1]


def read_env_example(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        name, separator, value = stripped.partition("=")
        if separator:
            values[name] = value
    return values


def write_env(path: Path, values: dict[str, str]) -> None:
    path.write_text(
        "".join(f"{name}={value}\n" for name, value in values.items()),
        encoding="utf-8",
    )


def random_secret() -> str:
    return secrets.token_urlsafe(32)


def prepare_compose_envs() -> None:
    for example in ROOT.rglob(".env.example"):
        if any(part in {"node_modules", ".git"} for part in example.parts):
            continue
        values = read_env_example(example)
        directory = example.parent
        for name, value in list(values.items()):
            if "PASSWORD" in name or "SECRET" in name:
                if name in {"KC_DB_PASSWORD", "POSTGRES_PASSWORD"} and directory.name == "keycloak":
                    continue
                if name == "KC_BOOTSTRAP_ADMIN_PASSWORD":
                    values[name] = random_secret()
                elif value.startswith("LAV-CENTRO-01:"):
                    values[name] = f"LAV-CENTRO-01:{random_secret()}"
                else:
                    values[name] = random_secret()

        if directory == ROOT / "infra" / "keycloak":
            db_password = random_secret()
            values["KC_DB_PASSWORD"] = db_password
            values["POSTGRES_PASSWORD"] = db_password
        write_env(directory / ".env", values)


def prepare_kubernetes_secret_envs() -> None:
    for example in ROOT.glob("k8s/*/secret.env.example"):
        values = read_env_example(example)
        for name, value in list(values.items()):
            if "PASSWORD" in name or "SECRET" in name:
                values[name] = random_secret()
        if example.parent.name == "keycloak":
            db_password = random_secret()
            values["KC_DB_PASSWORD"] = db_password
            values["POSTGRES_PASSWORD"] = db_password
        write_env(example.parent / "secret.env", values)


def main() -> None:
    prepare_compose_envs()
    prepare_kubernetes_secret_envs()
    print("Created disposable, ignored environment files for hosted CI.")


if __name__ == "__main__":
    main()
