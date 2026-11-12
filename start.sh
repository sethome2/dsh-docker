#!/bin/sh
set -eu

# DSH requires a concrete address; Docker forwards the published port here.
address=$(hostname -i)
address=${address%% *}
if [ -z "$address" ]; then
    echo 'No concrete container IP address found' >&2
    exit 1
fi

exec dsh web --host "$address" --port 3080 --no-open \
    --public-url http://localhost:3080/ "$@"
