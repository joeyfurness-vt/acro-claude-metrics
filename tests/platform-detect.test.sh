#!/usr/bin/env bash
set -eu

fail=0

# When invoked with --os/--arch overrides the script must echo the canonical
# Prometheus release platform string and exit 0.
expect() {
  local input_os="$1" input_arch="$2" expected="$3"
  local got
  got=$(scripts/platform-detect.sh --os "$input_os" --arch "$input_arch")
  if [[ "$got" != "$expected" ]]; then
    echo "FAIL: os=$input_os arch=$input_arch expected=$expected got=$got"
    fail=1
  fi
}

expect_fail() {
  local input_os="$1" input_arch="$2"
  if scripts/platform-detect.sh --os "$input_os" --arch "$input_arch" >/dev/null 2>&1; then
    echo "FAIL: expected nonzero exit for os=$input_os arch=$input_arch"
    fail=1
  fi
}

expect Darwin   arm64    darwin-arm64
expect Darwin   x86_64   darwin-amd64
expect Linux    x86_64   linux-amd64
expect Linux    aarch64  linux-arm64
expect_fail Linux    armv7l
expect_fail Solaris  x86_64

if [[ "$fail" -eq 0 ]]; then
  echo "OK"
else
  exit 1
fi
