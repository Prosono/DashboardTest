#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
status_dir="/var/lib/smarti-network-runtime"

install -d -m 0755 "$status_dir"
install -m 0755 "$script_dir/smarti-network-sync" /usr/local/sbin/smarti-network-sync
install -m 0644 "$script_dir/smarti-wireguard-sync.service" /etc/systemd/system/smarti-wireguard-sync.service
install -m 0644 "$script_dir/smarti-wireguard-sync.path" /etc/systemd/system/smarti-wireguard-sync.path
install -m 0644 "$script_dir/smarti-caddy-sync.service" /etc/systemd/system/smarti-caddy-sync.service
install -m 0644 "$script_dir/smarti-caddy-sync.path" /etc/systemd/system/smarti-caddy-sync.path

systemctl daemon-reload
systemctl enable --now smarti-wireguard-sync.path smarti-caddy-sync.path
systemctl start smarti-wireguard-sync.service smarti-caddy-sync.service

echo "SmartSauna network synchronization is installed."
