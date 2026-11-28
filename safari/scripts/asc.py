"""Small App Store Connect API client (Bhasha · Karya 에서 가져옴).

    uv run --no-project --with 'pyjwt[crypto]' python3 safari/scripts/asc.py GET /v1/bundleIds
    uv run --no-project --with 'pyjwt[crypto]' python3 safari/scripts/asc.py POST /v1/bundleIds body.json

Reads ISSUER_ID · KEY_ID · KEY_FILE from $ASC_ENV (default ~/AppStoreConnectSigning/asc.env). Never prints them.
Prints the JSON response; exits 1 on an HTTP error.
"""
import json, os, sys, time, urllib.request, urllib.error
import jwt

def env():
    path = os.environ.get("ASC_ENV", os.path.expanduser("~/AppStoreConnectSigning/asc.env"))
    values = {}
    for line in open(path):
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            values[k.strip()] = v.strip().strip('"').strip("'")
    key_file = os.path.expanduser(values["KEY_FILE"])
    if not os.path.isabs(key_file):
        key_file = os.path.join(os.path.dirname(path), key_file)
    return values["ISSUER_ID"], values["KEY_ID"], key_file

def token():
    issuer, key_id, key_file = env()
    now = int(time.time())
    return jwt.encode({"iss": issuer, "iat": now, "exp": now + 15 * 60, "aud": "appstoreconnect-v1"},
                      open(key_file).read(), algorithm="ES256", headers={"kid": key_id, "typ": "JWT"})

def call(method, path, body=None):
    url = path if path.startswith("http") else "https://api.appstoreconnect.apple.com" + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw.decode(errors="replace")}

if __name__ == "__main__":
    method, path = sys.argv[1], sys.argv[2]
    body = None
    if len(sys.argv) > 3:
        body = json.load(sys.stdin) if sys.argv[3] == "-" else json.load(open(sys.argv[3]))
    status, result = call(method, path, body)
    print(json.dumps(result, ensure_ascii=False, indent=1))
    if status >= 400:
        print(f"HTTP {status}", file=sys.stderr)
        sys.exit(1)
