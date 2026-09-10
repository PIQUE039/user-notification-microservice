
set -euo pipefail

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/nats/certs"
mkdir -p "$CERT_DIR"
cd "$CERT_DIR"

echo "Generating CA..."
openssl req -x509 -newkey rsa:4096 -days 365 -nodes \
  -keyout ca-key.pem -out ca.pem \
  -subj "/CN=local-dev-ca" 2>/dev/null

echo "Generating server key + CSR..."
openssl req -newkey rsa:4096 -nodes \
  -keyout server-key.pem -out server-csr.pem \
  -subj "/CN=nats" 2>/dev/null

echo "Signing server certificate with local CA..."
cat > server-ext.cnf <<EOF
subjectAltName=DNS:nats,DNS:localhost,IP:127.0.0.1
EOF

openssl x509 -req -in server-csr.pem -CA ca.pem -CAkey ca-key.pem \
  -CAcreateserial -out server-cert.pem -days 365 \
  -extfile server-ext.cnf 2>/dev/null

rm -f server-csr.pem server-ext.cnf ca.srl

echo "Done. Certs written to: $CERT_DIR"
echo "  ca.pem, ca-key.pem, server-cert.pem, server-key.pem"
