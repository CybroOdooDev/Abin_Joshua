# -*- coding: utf-8 -*-
import socket
import logging

_logger = logging.getLogger(__name__)


def send_raw_to_printer(ip_address, port=9100, data=b'', timeout=5):
    """
    Sends raw bytes to a network thermal printer over a TCP socket.

    :param ip_address: IP address or hostname of the printer (e.g. '192.168.1.150').
    :param port: TCP port number (default: 9100).
    :param data: bytes to be sent to the printer.
    :param timeout: socket timeout in seconds.
    :return: (success: bool, message: str)
    """
    if not ip_address:
        return False, "Printer IP address is not configured."
    if not data:
        return False, "No print data to send."

    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip_address.strip(), int(port)))
        sock.sendall(data)
        _logger.info(f"[Network Printer] Successfully sent {len(data)} bytes to {ip_address}:{port}")
        return True, "Ticket printed successfully."
    except socket.timeout:
        err_msg = f"Connection timeout: Printer at {ip_address}:{port} did not respond within {timeout}s."
        _logger.warning(f"[Network Printer] {err_msg}")
        return False, err_msg
    except ConnectionRefusedError:
        err_msg = f"Connection refused: No printer listening on {ip_address}:{port}."
        _logger.warning(f"[Network Printer] {err_msg}")
        return False, err_msg
    except OSError as err:
        err_msg = f"Network socket error ({ip_address}:{port}): {err.strerror or str(err)}"
        _logger.warning(f"[Network Printer] {err_msg}")
        return False, err_msg
    except Exception as err:
        err_msg = f"Unexpected printing error ({ip_address}:{port}): {str(err)}"
        _logger.error(f"[Network Printer] {err_msg}")
        return False, err_msg
    finally:
        if sock:
            try:
                sock.close()
            except Exception:
                pass


def test_printer_connection(ip_address, port=9100, timeout=3):
    """
    Tests whether the network printer is reachable and accepting TCP connections.

    :param ip_address: IP address or hostname.
    :param port: Port number (default: 9100).
    :param timeout: Timeout in seconds.
    :return: (reachable: bool, message: str)
    """
    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip_address.strip(), int(port)))
        return True, f"Printer at {ip_address}:{port} is online and reachable."
    except Exception as err:
        return False, f"Cannot reach printer at {ip_address}:{port}: {str(err)}"
    finally:
        if sock:
            try:
                sock.close()
            except Exception:
                pass
