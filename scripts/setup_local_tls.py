import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = ROOT / "certs"
DEFAULT_CA_NAME = "Pony Parade Local CA"
DEFAULT_HOSTNAME = "localhost"
DEFAULT_IP = "127.0.0.1"


def _run(cmd, cwd=None):
    subprocess.run(cmd, cwd=cwd, check=True)


def _write_leaf_config(path, hostname, ip):
    content = (
        "[req]\n"
        "distinguished_name = req_distinguished_name\n"
        "req_extensions = v3_req\n"
        "prompt = no\n\n"
        "[req_distinguished_name]\n"
        f"CN = {hostname}\n\n"
        "[v3_req]\n"
        "keyUsage = critical, digitalSignature, keyEncipherment\n"
        "extendedKeyUsage = serverAuth\n"
        "subjectAltName = @alt_names\n\n"
        "[alt_names]\n"
        f"DNS.1 = {hostname}\n"
        f"IP.1 = {ip}\n"
    )
    path.write_text(content, encoding="utf-8")


def _ensure_openssl():
    if shutil.which("openssl"):
        return
    raise RuntimeError("OpenSSL not found. Install it and re-run.")


def generate_certs(output_dir, ca_name, hostname, ip, days, force):
    output_dir.mkdir(parents=True, exist_ok=True)
    ca_key = output_dir / "ponyparade-ca-key.pem"
    ca_cert = output_dir / "ponyparade-ca-cert.pem"
    leaf_key = output_dir / "localhost-key.pem"
    leaf_cert = output_dir / "localhost-cert.pem"
    leaf_csr = output_dir / "localhost.csr"
    leaf_conf = output_dir / "localhost.cnf"
    serial_path = output_dir / "ponyparade-ca-cert.srl"

    existing = [ca_key, ca_cert, leaf_key, leaf_cert, leaf_csr, leaf_conf, serial_path]
    if not force and any(path.exists() for path in existing):
        raise RuntimeError(
            f"Cert files already exist in {output_dir}. Use --force to overwrite."
        )

    for path in existing:
        if path.exists():
            path.unlink()

    _ensure_openssl()
    _write_leaf_config(leaf_conf, hostname, ip)

    _run(
        [
            "openssl",
            "req",
            "-x509",
            "-new",
            "-nodes",
            "-newkey",
            "rsa:2048",
            "-keyout",
            str(ca_key),
            "-out",
            str(ca_cert),
            "-days",
            str(days),
            "-subj",
            f"/CN={ca_name}",
            "-addext",
            "basicConstraints=critical,CA:TRUE",
            "-addext",
            "keyUsage=critical,keyCertSign,cRLSign",
        ]
    )

    _run(
        [
            "openssl",
            "req",
            "-new",
            "-nodes",
            "-newkey",
            "rsa:2048",
            "-keyout",
            str(leaf_key),
            "-out",
            str(leaf_csr),
            "-config",
            str(leaf_conf),
        ]
    )

    _run(
        [
            "openssl",
            "x509",
            "-req",
            "-in",
            str(leaf_csr),
            "-CA",
            str(ca_cert),
            "-CAkey",
            str(ca_key),
            "-CAcreateserial",
            "-out",
            str(leaf_cert),
            "-days",
            str(days),
            "-sha256",
            "-extfile",
            str(leaf_conf),
            "-extensions",
            "v3_req",
        ]
    )

    return {
        "ca_cert": ca_cert,
        "leaf_cert": leaf_cert,
        "leaf_key": leaf_key,
    }


def install_trust_store(ca_cert):
    if sys.platform.startswith("darwin"):
        _run(
            [
                "sudo",
                "security",
                "add-trusted-cert",
                "-d",
                "-r",
                "trustRoot",
                "-k",
                "/Library/Keychains/System.keychain",
                str(ca_cert),
            ]
        )
        return
    if sys.platform.startswith("win"):
        _run(["certutil", "-addstore", "-f", "Root", str(ca_cert)])
        return
    if sys.platform.startswith("linux"):
        target = "/usr/local/share/ca-certificates/ponyparade-local-ca.crt"
        _run(["sudo", "cp", str(ca_cert), target])
        _run(["sudo", "update-ca-certificates"])
        return
    raise RuntimeError("Unsupported OS for auto-install. Install manually.")


def print_trust_steps(ca_cert):
    print("\nTrust store steps:")
    print(f"- macOS: sudo security add-trusted-cert -d -r trustRoot "
          f"-k /Library/Keychains/System.keychain {ca_cert}")
    print(f"- Windows (Admin): certutil -addstore -f Root {ca_cert}")
    print(
        "- Linux: sudo cp "
        f"{ca_cert} /usr/local/share/ca-certificates/ponyparade-local-ca.crt "
        "&& sudo update-ca-certificates"
    )


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate and (optionally) install local TLS certs."
    )
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--ca-name", default=DEFAULT_CA_NAME)
    parser.add_argument("--hostname", default=DEFAULT_HOSTNAME)
    parser.add_argument("--ip", default=DEFAULT_IP)
    parser.add_argument("--days", type=int, default=365)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--install", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    output_dir = Path(args.output_dir)
    certs = generate_certs(
        output_dir,
        args.ca_name,
        args.hostname,
        args.ip,
        args.days,
        args.force,
    )

    print("Generated certs:")
    print(f"- CA cert: {certs['ca_cert']}")
    print(f"- Leaf cert: {certs['leaf_cert']}")
    print(f"- Leaf key: {certs['leaf_key']}")

    if args.install:
        install_trust_store(certs["ca_cert"])
        print("Trusted local CA in system store.")
    else:
        print_trust_steps(certs["ca_cert"])

    print("\nStart helper with:")
    print(
        ".venv/bin/python scripts/speech_helper.py "
        f"--tls-cert {certs['leaf_cert']} --tls-key {certs['leaf_key']}"
    )


if __name__ == "__main__":
    main()
