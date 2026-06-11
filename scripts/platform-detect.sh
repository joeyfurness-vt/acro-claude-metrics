#!/usr/bin/env bash
# Detect the Prometheus release platform string for the current host.
# --os and --arch override `uname -s` and `uname -m` (used for tests).
set -eu

OS="$(uname -s)"
ARCH="$(uname -m)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --os) OS="$2"; shift 2 ;;
    --arch) ARCH="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

case "$OS-$ARCH" in
  Darwin-arm64)   echo "darwin-arm64" ;;
  Darwin-x86_64)  echo "darwin-amd64" ;;
  Linux-x86_64)   echo "linux-amd64" ;;
  Linux-aarch64)  echo "linux-arm64" ;;
  *)
    echo "unsupported platform: $OS-$ARCH" >&2
    echo "supported: Darwin-arm64, Darwin-x86_64, Linux-x86_64, Linux-aarch64" >&2
    exit 1
    ;;
esac
