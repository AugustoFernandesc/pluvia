import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import threading
import unittest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "infra" / "kong" / "bootstrap-kong.py"
RENDERER = ROOT / "gateway" / "render-kong.py"
TEMPLATE = ROOT / "gateway" / "kong.yml.template"


def b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def test_jwk() -> dict[str, str]:
    return {
        "kty": "RSA",
        "alg": "RS256",
        "use": "sig",
        "kid": "temporary-ci-test",
        "n": b64url(bytes.fromhex("d3" * 128)),
        "e": b64url(bytes.fromhex("010001")),
    }


class BootstrapKongTests(unittest.TestCase):
    def test_der_conversion_creates_public_key_pem(self):
        public_pem_from_jwk = runpy.run_path(str(SCRIPT))["public_pem_from_jwk"]

        pem = public_pem_from_jwk(test_jwk())
        self.assertTrue(pem.startswith("-----BEGIN PUBLIC KEY-----\n"))
        self.assertTrue(pem.rstrip().endswith("-----END PUBLIC KEY-----"))
        content = "".join(pem.splitlines()[1:-1])
        self.assertGreater(len(base64.b64decode(content)), 128)

    def test_bootstrap_waits_for_metadata_and_key_then_renders(self):
        issuer = "http://issuer.test/auth/realms/pluvia"
        jwk = test_jwk()

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path.endswith(".well-known/openid-configuration"):
                    body = {"issuer": issuer}
                else:
                    body = {"keys": [jwk]}
                encoded = json.dumps(body).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

            def log_message(self, *_args):
                return

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f"http://127.0.0.1:{server.server_port}"
            with tempfile.TemporaryDirectory() as directory:
                output = Path(directory) / "kong.yml"
                public_key = Path(directory) / "realm-public-key.pem"
                result = subprocess.run(
                    [
                        sys.executable,
                        str(SCRIPT),
                        "--issuer",
                        issuer,
                        "--jwks-url",
                        base + "/realms/pluvia/protocol/openid-connect/certs",
                        "--discovery-url",
                        base + "/realms/pluvia/.well-known/openid-configuration",
                        "--template",
                        str(TEMPLATE),
                        "--renderer",
                        str(RENDERER),
                        "--output",
                        str(output),
                        "--key-output",
                        str(public_key),
                        "--timeout-seconds",
                        "5",
                        "--poll-seconds",
                        "0.1",
                    ],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertTrue(public_key.is_file())
                rendered = output.read_text(encoding="utf-8")
                self.assertNotIn("__KEYCLOAK_", rendered)
                self.assertIn(json.dumps(issuer), rendered)
                self.assertIn("strip_path: false", rendered)
        finally:
            server.shutdown()
            server.server_close()

    def test_bootstrap_rejects_discovery_issuer_mismatch(self):
        issuer = "http://issuer.test/auth/realms/pluvia"
        wrong_issuer = "http://wrong.test/auth/realms/pluvia"
        jwk = test_jwk()

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                body = (
                    {"issuer": wrong_issuer}
                    if self.path.endswith(".well-known/openid-configuration")
                    else {"keys": [jwk]}
                )
                encoded = json.dumps(body).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

            def log_message(self, *_args):
                return

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            base = f"http://127.0.0.1:{server.server_port}"
            with tempfile.TemporaryDirectory() as directory:
                result = subprocess.run(
                    [
                        sys.executable,
                        str(SCRIPT),
                        "--issuer",
                        issuer,
                        "--jwks-url",
                        base + "/certs",
                        "--discovery-url",
                        base + "/.well-known/openid-configuration",
                        "--template",
                        str(TEMPLATE),
                        "--renderer",
                        str(RENDERER),
                        "--output",
                        str(Path(directory) / "kong.yml"),
                        "--key-output",
                        str(Path(directory) / "key.pem"),
                        "--timeout-seconds",
                        "1",
                        "--poll-seconds",
                        "0.1",
                    ],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("issuer", result.stderr.lower())
                self.assertFalse((Path(directory) / "kong.yml").exists())
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
