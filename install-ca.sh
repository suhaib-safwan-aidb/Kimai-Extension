#!/usr/bin/env bash
# One-time script: installs the private.aidb Root CA certificate into
# Chrome and Brave on this machine so extension service worker TLS works
# with https://kimai.k8s.private.aidb without browser flags.
#
# HOW TO GET THE CA CERT (ask your DevOps / k8s admin for one of these):
#
#   Option A — from kubectl (run on any machine with cluster access):
#     kubectl get secret -n cert-manager \
#       $(kubectl get clusterissuer -o jsonpath='{.items[0].spec.ca.secretName}' 2>/dev/null || echo "root-ca-secret") \
#       -o jsonpath='{.data.tls\.crt}' | base64 -d > private-aidb-ca.pem
#
#   Option B — ask admin to run on the cluster node:
#     cat /etc/ssl/certs/private-aidb-ca.pem   (or wherever they stored it)
#
#   Option C — extract from the cert-manager CA Secret directly:
#     kubectl get secret private-aidb-root-ca -n cert-manager \
#       -o jsonpath='{.data.ca\.crt}' | base64 -d > private-aidb-ca.pem
#
# Then run this script:
#   bash install-ca.sh private-aidb-ca.pem
#
# After running, restart Chrome/Brave — no flags needed, all connections work.

set -e

CA_FILE="${1}"

if [ -z "$CA_FILE" ]; then
  echo "Usage: bash install-ca.sh <path-to-ca.pem>"
  echo ""
  echo "The CA cert file should contain the 'private.aidb Root CA' certificate."
  echo "See comments at the top of this file for how to obtain it."
  exit 1
fi

if [ ! -f "$CA_FILE" ]; then
  echo "ERROR: File not found: $CA_FILE"
  exit 1
fi

# Verify it is a valid certificate
if ! openssl x509 -in "$CA_FILE" -noout 2>/dev/null; then
  echo "ERROR: $CA_FILE does not look like a valid PEM certificate."
  exit 1
fi

SUBJECT=$(openssl x509 -in "$CA_FILE" -noout -subject 2>/dev/null)
echo "Installing CA: $SUBJECT"

CA_NAME="private-aidb-root-ca"

# ── 1. System trust store (used by curl, Node.js, etc.) ──────────────────────
sudo cp "$CA_FILE" "/usr/local/share/ca-certificates/${CA_NAME}.crt"
sudo update-ca-certificates
echo "✓ Installed in system trust store"

# ── 2. NSS databases (used by Chrome, Brave, Chromium) ───────────────────────
if ! command -v certutil &>/dev/null; then
  echo "Installing libnss3-tools for certutil..."
  sudo apt-get install -y libnss3-tools 2>/dev/null || \
  sudo dnf install -y nss-tools 2>/dev/null || \
  sudo pacman -Sy --noconfirm nss 2>/dev/null || true
fi

if ! command -v certutil &>/dev/null; then
  echo "ERROR: certutil not found. Install libnss3-tools manually and re-run."
  exit 1
fi

TRUST_FLAGS="CT,,"

# Find all Chrome / Brave NSS profile databases
NSSDB_DIRS=()
while IFS= read -r -d '' dir; do
  NSSDB_DIRS+=("$dir")
done < <(find "$HOME" \
  \( -path "*/.pki/nssdb" \
     -o -path "*/BraveSoftware/Brave-Browser/*/cert9.db" \
     -o -path "*/.config/google-chrome/*/cert9.db" \
     -o -path "*/.config/chromium/*/cert9.db" \
  \) -print0 2>/dev/null)

# Add top-level NSS db (common on Linux for Chrome)
[ -d "$HOME/.pki/nssdb" ] && NSSDB_DIRS+=("$HOME/.pki/nssdb")

if [ ${#NSSDB_DIRS[@]} -eq 0 ]; then
  # Create the shared NSS db if none exist
  mkdir -p "$HOME/.pki/nssdb"
  certutil -d "sql:$HOME/.pki/nssdb" -N --empty-password
  NSSDB_DIRS=("$HOME/.pki/nssdb")
fi

declare -A SEEN
for db in "${NSSDB_DIRS[@]}"; do
  # Normalise: certutil -d takes the directory, not the cert9.db file
  [[ "$db" == *cert9.db ]] && db=$(dirname "$db")
  [ -n "${SEEN[$db]}" ] && continue
  SEEN[$db]=1

  # Remove old entry if present, then add fresh
  certutil -d "sql:$db" -D -n "$CA_NAME" 2>/dev/null || true
  if certutil -d "sql:$db" -A -n "$CA_NAME" -t "$TRUST_FLAGS" -i "$CA_FILE"; then
    echo "✓ Installed in NSS db: $db"
  else
    echo "  Skipped (could not write): $db"
  fi
done

echo ""
echo "Done. Fully restart Chrome/Brave (close all windows, then reopen)."
echo "The extension will connect to https://kimai.k8s.private.aidb without any flags."
