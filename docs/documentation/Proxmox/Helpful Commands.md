---
title: Helpful Proxmox Commands
hide:
    - toc
    - path
---

# Helpful Proxmox Commands

## Restarting GPU
This is needed when you are using GPU passthrough and need to move the gpu from one vm to another. Sometimes it does not reset and recognize the new vm.

First find the device ID of the GPU then escape the colons using `#!bash \:`

```bash linenums="1"
echo "1" > /sys/bus/pci/devices/0000\:c1\:00.0//remove
echo "1" > /sys/bus/pci/rescan
```
