#!/bin/sh
# Boot xv6 without a keyboard: type each command in $XV6_CMDS (separated by semicolons), then quit QEMU.
cd /xv6 || exit 1
{
  sleep 4
  echo "$XV6_CMDS" | tr ';' '\n' | while read -r line; do echo "$line"; sleep 2; done
  printf '\001x'
} | make qemu CPUS=1
