#!/bin/sh
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8080}" node tools/server.mjs
