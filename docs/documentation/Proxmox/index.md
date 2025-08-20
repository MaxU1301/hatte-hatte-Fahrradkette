---
title: Introduction to Proxmox VE
hide:
---

# 🐧 Welcome to Proxmox VE

Proxmox Virtual Environment (VE) is a powerful tool that lets you run multiple, separate operating systems on a single physical computer. It uses a simple web-based interface to manage everything, making it easy to create and control your virtual machines and containers.
🖥️ Virtual Machines vs. Containers

Proxmox can run two main types of virtual systems:

* **Virtual Machines (VMs):** A VM acts like a complete, independent computer. Use a VM when you need to run a completely different operating system, like running a Windows machine on your Linux server.

* **Containers (CTs):** Containers are a lightweight and much faster alternative. They share the host server's operating system but keep applications isolated. They are perfect for running Linux-based applications efficiently.

# 🚀 Accessing the Web Interface

The primary way to manage Proxmox is through its web dashboard. You can access it by opening the following address in your web browser.

`https://<your-node-ip>:8006`

From this interface, you can manage all your virtual systems, storage, and network settings.