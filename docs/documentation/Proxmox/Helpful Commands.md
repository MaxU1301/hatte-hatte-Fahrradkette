---
title: Helpful Proxmox Commands
hide:
---

# 🧰 Helpful Proxmox Commands

Battle‑tested CLI commands for administering Proxmox VE: VMs (QEMU), LXC
containers, storage, networking, cluster, HA, services, backups, GPU
passthrough/reset, and troubleshooting.

!!! tip
    Replace placeholders like `<VMID>`, `<CTID>`, `<storage>`, `<node>`, `<pool>`, `<iface>`.

!!! warning
    Commands that modify hardware, storage, networking, or cluster state can
    disrupt running workloads. Prefer maintenance windows, backups, and
    snapshots where appropriate. Many operations require root; use sudo or run
    as root on the PVE node.

---

## 🧭 Basics — system and services {#basics}

Check versions and node health

```bash linenums="1"
pveversion -v                        # Proxmox + package versions
pvesh get /version                   # API version
hostnamectl; uptime
free -h
df -h -x tmpfs -x devtmpfs
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT
```

Key services and quick restarts

```bash linenums="1"
systemctl status pveproxy pvedaemon pvestatd pve-cluster corosync pve-firewall
journalctl -u pveproxy -b -n 200 -f
journalctl -u pve-cluster -b -n 200
systemctl restart pveproxy pvedaemon   # Restarts Web UI/daemon
```

Stale locks

```bash linenums="1"
qm unlock <VMID>
pct unlock <CTID>
```

Task stream and per-guest logs

```bash linenums="1"
tail -f /var/log/pve/tasks/active
tail -f /var/log/pve/tasks/index
tail -f /var/log/pve/qemu-server/<VMID>.log
tail -f /var/log/pve/lxc/<CTID>.log
```

---

## 🖥️ QEMU VMs (qm) {#qemu-vms}

List, inspect, start/stop

```bash linenums="1"
qm list
qm status <VMID>
qm config <VMID>
qm start <VMID>
qm shutdown <VMID>
qm stop <VMID>            # Hard stop
qm reset <VMID>
```

Console, monitor, send keys

```bash linenums="1"
qm terminal <VMID>        # Serial console (if configured)
qm monitor <VMID>         # QEMU monitor
qm sendkey <VMID> ctrl-alt-delete
```

Resources and devices

```bash linenums="1"
qm set <VMID> -memory 16384 -cores 8
qm set <VMID> -agent enabled=1
qm set <VMID> -net0 virtio,bridge=vmbr0
qm set <VMID> -scsi0 <storage>:vm-<VMID>-disk-0
qm resize <VMID> scsi0 +20G
```

Snapshots and rollback

```bash linenums="1"
qm snapshot <VMID> pre-upgrade --description "Before upgrade"
qm listsnapshot <VMID>
qm rollback <VMID> pre-upgrade
qm delsnapshot <VMID> pre-upgrade
```

Import disks and images

```bash linenums="1"
# Import disk image into storage, then attach it
qm importdisk <VMID> /path/to/image.qcow2 <storage>
qm set <VMID> -scsi1 <storage>:vm-<VMID>-disk-1

# Optional: convert formats
qemu-img convert -p -O qcow2 source.vmdk dest.qcow2
```

Live/online migration

```bash linenums="1"
qm migrate <VMID> <targetnode> --online
# If local disks exist:
qm migrate <VMID> <targetnode> --online --with-local-disks
```

---

## 📦 LXC Containers (pct) {#lxc-containers}

Basics

```bash linenums="1"
pct list
pct config <CTID>
pct start <CTID>
pct stop <CTID>
pct reboot <CTID>
pct console <CTID>          # Attach console
pct enter <CTID>            # Enter shell
pct exec <CTID> -- bash -lc "apt update && apt -y upgrade"
pct set <CTID> -memory 4096 -cores 2
```

Snapshots and restore

```bash linenums="1"
pct snapshot <CTID> safe-point
pct listsnapshot <CTID>
pct rollback <CTID> safe-point
pct restore <CTID> /mnt/pve/<storage>/dump/vzdump-lxc-<CTID>-*.tar.zst \
  --storage <storage>
```

Migrate

```bash linenums="1"
pct migrate <CTID> <targetnode> --online
```

Mount/unmount rootfs (offline maintenance)

```bash linenums="1"
pct mount <CTID>
# ... operate on /var/lib/lxc/<CTID>/rootfs ...
pct unmount <CTID>
```

---

## 💾 Backups and Restore (vzdump, qmrestore, pct restore) {#backups-restore}

Create backups

```bash linenums="1"
# VM backup
vzdump <VMID> --storage <storage> --mode snapshot --compress zstd \
  --notes-template "{{node}}/{{vmid}} {{guestname}} {{date}}-{{time}}"

# Container backup
vzdump <CTID> --storage <storage> --mode snapshot --compress zstd
```

List backup files

```bash linenums="1"
pvesm list <storage>
ls -lh /mnt/pve/<storage>/dump
```

Restore VM and CT

```bash linenums="1"
# Restore VM to new VMID
qmrestore /mnt/pve/<storage>/dump/vzdump-qemu-<OLD>-*.vma.zst <NEW_VMID> \
  --storage <storage>

# Restore Container
pct restore <NEW_CTID> \
  /mnt/pve/<storage>/dump/vzdump-lxc-<OLD>-*.tar.zst --storage <storage>
```

---

## 🗄️ Storage (pvesm, ZFS, LVM) {#storage}

Proxmox storage CLI

```bash linenums="1"
pvesm status
pvesm list <storage>
pvesm nfsscan <server>
pvesm iscsiscan <server>
```

ZFS basics

```bash linenums="1"
zpool status
zpool list
zfs list -o name,used,avail,mountpoint
zpool scrub <pool>
zpool clear <pool>
# Import/export (maintenance)
zpool export <pool>
zpool import -f <pool>
```

LVM/LVM-thin

```bash linenums="1"
pvs
vgs
lvs -a -o +devices,lv_size,data_percent,metadata_percent
# Example: check thin pool usage
lvs -a -o name,vg_name,lv_size,metadata_percent,data_percent
```

Replication (built-in)

```bash linenums="1"
pvesr status
pvesr list
# Run a job immediately
pvesr run --id <jobid>
```

---

## 🌐 Networking and Firewall {#networking-firewall}

Interfaces and bridges

```bash linenums="1"
ip -c a
ip -c r
bridge link show
grep -R "vmbr" /etc/network/interfaces /etc/network/interfaces.d || true
```

Apply interface changes (ifupdown2)

```bash linenums="1"
ifreload -a
# Fallback:
systemctl restart networking
```

Connectivity and ports

```bash linenums="1"
ss -tulpn | grep -E "8006|22"      # Web UI and SSH
ping -c 3 <host-or-ip>
traceroute <host-or-ip>            # apt install traceroute if missing
```

Firewall (PVE 8 uses nftables backend)

```bash linenums="1"
pve-firewall status
pve-firewall compile
pve-firewall reload
nft list ruleset | less
```

Packet capture (example on vmbr0)

```bash linenums="1"
tcpdump -ni vmbr0 port 8006
```

---

## 🧩 Cluster and Quorum (pvecm, corosync) {#cluster-quorum}

Status and nodes

```bash linenums="1"
pvecm status
pvecm nodes
corosync-quorumtool -s
systemctl status corosync pve-cluster
journalctl -u corosync -b -n 200
```

Quorum override for maintenance (use with care)

```bash linenums="1"
# Temporarily set expected votes (e.g., in a 1-node surviving scenario)
pvecm expected 1
```

Add/remove nodes

```bash linenums="1"
# From the new node:
pvecm add <IP-of-cluster-node>

# From a healthy cluster node:
pvecm delnode <nodename>
```

PMXCFS check

```bash linenums="1"
ls -l /etc/pve            # FUSE filesystem
getfacl /etc/pve 2>/dev/null || true
```

---

## 🛟 High Availability (ha-manager) {#ha}

Status and configuration

```bash linenums="1"
ha-manager status
ha-manager config
```

Add/remove a VM to HA

```bash linenums="1"
ha-manager add vm:<VMID> --group default --state started
ha-manager remove vm:<VMID>
ha-manager set vm:<VMID> --state stopped
```

---

## 🔐 Certificates and Web UI {#certs-web}

Renew/recreate local certs and restart UI

```bash linenums="1"
pvecm updatecerts -f
systemctl restart pveproxy
```

Inspect current cert

```bash linenums="1"
openssl x509 -in /etc/pve/local/pve-ssl.pem -noout -subject -dates
ss -tnlp | grep 8006
```

---

## 🧠 GPU Passthrough and Reset {#gpu}

Identify GPU and driver bindings

```bash linenums="1"
lspci -nnk | grep -iEA3 "vga|3d|display|nvidia|amd|intel"
dmesg | grep -iE "IOMMU|DMAR|VFIO|AMD-Vi"
```

List IOMMU groups (useful for isolation)

```bash linenums="1"
for g in /sys/kernel/iommu_groups/*; do
  echo "Group ${g##*/}"
  for d in "$g"/devices/*; do
    lspci -nns "${d##*/}"
  done
  echo
done
```

??? note "Note about escaping colons"
    In normal Linux shells, you do not need to escape colons in sysfs PCI paths (e.g., 0000:c1:00.0). If you prefer, escaping them with backslashes also works, but it is not required.

Quick GPU device reset and PCI rescan

```bash linenums="1"
# Example device path: /sys/bus/pci/devices/0000:c1:00.0
echo 1 > /sys/bus/pci/devices/0000:c1:00.0/remove
echo 1 > /sys/bus/pci/rescan
```

Function-level reset (if supported)

```bash linenums="1"
echo 1 > /sys/bus/pci/devices/0000:01:00.0/reset
```

Safer unbind/bind to vfio-pci (host must not use the GPU)

```bash linenums="1"
GPU=0000:01:00.0
VENDOR_DEVICE=$(lspci -nns "$GPU" | awk -F'[][]' '{print $2}')
echo "$VENDOR_DEVICE" > /sys/bus/pci/drivers/vfio-pci/new_id
echo -n "$GPU" > /sys/bus/pci/devices/$GPU/driver/unbind
echo -n "$GPU" > /sys/bus/pci/drivers/vfio-pci/bind
```

---

## 🧾 Logs and Troubleshooting {#logs}

System and Proxmox services

```bash linenums="1"
journalctl -xe
journalctl -b -u pveproxy -u pvedaemon -u pvestatd -u pve-cluster \
  -u corosync -u pve-firewall --no-pager | less
dmesg -T | less
```

Guest-specific logs

```bash linenums="1"
tail -f /var/log/pve/qemu-server/<VMID>.log
tail -f /var/log/pve/lxc/<CTID>.log
```

Network diagnostics

```bash linenums="1"
ip -c a
ip -c r
nft list ruleset | less
tcpdump -ni <iface> host <ip-or-host> and port <port>
```

Stuck tasks and locks

```bash linenums="1"
ps aux | grep -E "qm .*<VMID>|vzdump|lxc"
qm unlock <VMID>
pct unlock <CTID>
```

---

## ⬆️ Updates and Repositories {#updates}

Check repos

```bash linenums="1"
cat /etc/apt/sources.list
ls -1 /etc/apt/sources.list.d/
cat /etc/apt/sources.list.d/pve-enterprise.list 2>/dev/null || true
cat /etc/apt/sources.list.d/pve-no-subscription.list 2>/dev/null || true
```

Update safely

```bash linenums="1"
apt update
apt full-upgrade
pveversion -v
reboot
```

---

## 🔌 Proxmox API CLI (pvesh) {#pvesh}

Quick queries

```bash linenums="1"
pvesh get /cluster/resources
pvesh get /nodes
pvesh get /nodes/$(hostname)/qemu
pvesh get /nodes/$(hostname)/lxc
```

Example: get a VM’s status via API

```bash linenums="1"
pvesh get /nodes/$(hostname)/qemu/<VMID>/status/current
```

---
