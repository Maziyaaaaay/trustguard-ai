#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tools_dir="$repo_root/.tools"
micromamba="$tools_dir/bin/micromamba"
tesseract_prefix="$tools_dir/tesseract"

mkdir -p "$tools_dir"
if [[ ! -x "$micromamba" ]]; then
  mkdir -p "$tools_dir/bin"
  curl -fsSL https://micro.mamba.pm/api/micromamba/osx-arm64/latest \
    | tar -xj -C "$tools_dir" bin/micromamba
fi

"$micromamba" create --yes --prefix "$tesseract_prefix" \
  --channel conda-forge tesseract=5.5.3

"$tesseract_prefix/bin/tesseract" --version
"$tesseract_prefix/bin/tesseract" --list-langs
