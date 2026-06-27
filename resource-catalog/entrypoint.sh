#!/bin/bash

echo "Entrypoint"

if [ -z "$HOST_CERTS" ]; then
  echo "Warning: No HOST_CERTS variable set"
fi

for host in $HOST_CERTS; do
  host=${host//http*:\/\//}
  host=${host//\/*/}
  host=${host//:[0-9]*/}
  count=1

  if [ ! -z ${host+x} ] && [ ! -f "/usr/local/share/ca-certificates/${host}_1.crt" ]; then
    echo -e "\nHost: $host"

    certificate=$(openssl s_client -showcerts -connect "$host":443 </dev/null | \
      sed -ne '/-BEGIN CERTIFICATE-/,/-END CERTIFICATE-/p')

    while IFS= read -r line; do
      [ -z "$line" ] || echo "$line" >> "/usr/local/share/ca-certificates/${host}_${count}.crt";
      if [ -n "$line" ] && [[ "$line" =~ 'END CERTIFICATE' ]]; then
        count=$((count+1))
      fi
    done <<< "$certificate"

    [ -z "$certificate" ] || cat /usr/local/share/ca-certificates/"${host}"_* >> /etc/ssl/certs/ca-certificates.crt

    count=1
  fi
done

update-ca-certificates

if [ -z "$MAIN" ]; then
  MAIN=main
fi

NODE_OPTIONS="--enable-source-maps --use-openssl-ca"

# if [ "$DD_ENABLED" = "true" ]; then
#   NODE_OPTIONS+=" --require dd-trace/init"
# fi

export NODE_OPTIONS
exec node dist/src/"$MAIN"
