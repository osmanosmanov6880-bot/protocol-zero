#!/bin/sh
cd "$(dirname "$0")" || exit 1
printf 'PROTOCOL ZERO / Open http://127.0.0.1:8787 after launch.\n'
exec npm start
