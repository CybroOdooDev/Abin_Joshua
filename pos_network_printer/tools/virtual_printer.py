#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Virtual Network Thermal Printer Emulator for Testing
=====================================================
Listens on 127.0.0.1:9100 (or 0.0.0.0:9100).
Receives ESC/POS data sent from Odoo, decodes raster images and text,
and logs the print results in real time.
"""
import socket
import datetime
import os
import re

HOST = '127.0.0.1'
PORT = 9100

def run_virtual_printer(host=HOST, port=PORT):
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((host, port))
    server.listen(5)

    print("=" * 60)
    print(f"🖨️  VIRTUAL NETWORK THERMAL PRINTER ACTIVE")
    print(f"📡  Listening on: {host}:{port}")
    print(f"👉  In Odoo Network Printer settings, configure:")
    print(f"    - IP Address : {host}")
    print(f"    - TCP Port   : {port}")
    print("=" * 60)
    print("Waiting for print jobs from Odoo... (Press Ctrl+C to stop)\n")

    output_dir = os.path.join(os.path.dirname(__file__), 'test_receipts')
    os.makedirs(output_dir, exist_ok=True)

    job_counter = 0

    try:
        while True:
            client, addr = server.accept()
            job_counter += 1
            timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            print(f"[{timestamp}] 📥 Incoming print job #{job_counter} from {addr[0]}:{addr[1]}")

            data = bytearray()
            while True:
                chunk = client.recv(4096)
                if not chunk:
                    break
                data.extend(chunk)
            client.close()

            has_cut = b'\x1d\x56' in data or b'\x1dV' in data
            has_drawer = b'\x1bp' in data
            has_raster = b'\x1dv0' in data

            print(f"   ├─ Total Payload Size : {len(data):,} bytes")
            print(f"   ├─ Raster Graphics    : {'YES (High-Fidelity Bit-Image)' if has_raster else 'Plain ESC/POS Text'}")
            print(f"   ├─ Paper Cut Command  : {'YES' if has_cut else 'NO'}")
            print(f"   └─ Cash Drawer Kick   : {'YES' if has_drawer else 'NO'}")

            # Save raw binary stream
            bin_filename = os.path.join(output_dir, f"job_{job_counter}.bin")
            with open(bin_filename, "wb") as f:
                f.write(data)

            # Extract readable text if present
            printable_text = re.sub(rb'[^\x20-\x7E\n\r\t]', rb'', data).decode('ascii', errors='ignore').strip()
            if printable_text:
                print("\n   --- [TICKET TEXT PREVIEW] ---")
                for line in printable_text.splitlines():
                    if line.strip():
                        print(f"   | {line}")
                print("   -----------------------------\n")

            print(f"   ✅ Print job #{job_counter} completed successfully! Saved to {bin_filename}\n")

    except KeyboardInterrupt:
        print("\n🛑 Virtual Printer stopped.")
    finally:
        server.close()

if __name__ == '__main__':
    run_virtual_printer()
