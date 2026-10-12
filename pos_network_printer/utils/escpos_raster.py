# -*- coding: utf-8 -*-
import io
import base64
from PIL import Image

# Common ESC/POS Command Constants
ESC = b'\x1b'
GS = b'\x1d'
INIT_PRINTER = ESC + b'@'
FEED_LINES_4 = ESC + b'd\x04'
CUT_PAPER = GS + b'V\x42\x00'  # Partial/Full cut with feed
DRAWER_KICK = ESC + b'p\x00\x19\xfa'  # Kick cash drawer 1


def image_to_escpos_raster(image_input, paper_width='80mm', cut=True, drawer=False):
    """
    Converts an image (PIL Image, bytes, or base64 string) to standard ESC/POS
    raster bit-image commands (GS v 0), ensuring 100% layout fidelity.

    :param image_input: PIL.Image, raw bytes, or base64 encoded string.
    :param paper_width: '80mm' (576 dots) or '58mm' (384 dots).
    :param cut: Whether to append a paper cut command.
    :param drawer: Whether to kick open the cash drawer.
    :return: bytes containing ESC/POS binary stream.
    """
    if isinstance(image_input, str):
        # Strip data URL prefix if present (e.g. 'data:image/png;base64,...')
        if ',' in image_input:
            image_input = image_input.split(',', 1)[1]
        image_bytes = base64.b64decode(image_input)
        img = Image.open(io.BytesIO(image_bytes))
    elif isinstance(image_input, bytes):
        img = Image.open(io.BytesIO(image_input))
    elif isinstance(image_input, Image.Image):
        img = image_input
    else:
        raise ValueError("Unsupported image input type for ESC/POS conversion")

    # Determine pixel width based on thermal paper specification
    target_width = 576 if paper_width == '80mm' else 384

    # Convert to RGB with white background if transparent
    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
        alpha = img.convert('RGBA')
        background = Image.new('RGB', alpha.size, (255, 255, 255))
        background.paste(alpha, mask=alpha.split()[3])
        img = background
    else:
        img = img.convert('RGB')

    # Calculate proportional height
    width, height = img.size
    aspect_ratio = height / float(width)
    target_height = int(target_width * aspect_ratio)

    # Resize image using high-quality resampling (compatible with all Pillow versions)
    resample_filter = getattr(Image, 'Resampling', None)
    resample_method = resample_filter.LANCZOS if resample_filter else getattr(Image, 'LANCZOS', getattr(Image, 'BILINEAR', 2))
    img = img.resize((target_width, target_height), resample_method)

    # Convert to 1-bit monochrome (dithered for smooth logos and crisp text)
    img = img.convert('1')

    # ESC/POS raster chunking: Print in slices of up to 512 vertical pixels
    # to avoid buffer overflows on printers with limited memory.
    slice_height = 512
    width_bytes = (target_width + 7) // 8

    output = bytearray()
    output.extend(INIT_PRINTER)

    for y_offset in range(0, target_height, slice_height):
        current_chunk_height = min(slice_height, target_height - y_offset)
        box = (0, y_offset, target_width, y_offset + current_chunk_height)
        chunk = img.crop(box)

        # Chunk raster header: GS v 0 m xL xH yL yH
        # m = 0 (Normal density)
        x_l = width_bytes % 256
        x_h = width_bytes // 256
        y_l = current_chunk_height % 256
        y_h = current_chunk_height // 256

        header = GS + b'v0\x00' + bytes([x_l, x_h, y_l, y_h])
        output.extend(header)

        # Extract monochrome bit data
        # In mode '1': 0 is black (dot printed), 255 is white (blank)
        # In ESC/POS: 1 is black (dot printed), 0 is white
        raw_pixels = chunk.load()
        for y in range(current_chunk_height):
            for byte_idx in range(width_bytes):
                byte_val = 0
                for bit in range(8):
                    px = byte_idx * 8 + bit
                    if px < target_width:
                        # 0 means black in PIL '1' mode
                        if raw_pixels[px, y] == 0:
                            byte_val |= (1 << (7 - bit))
                output.append(byte_val)

    # Feed lines and cut paper
    output.extend(FEED_LINES_4)
    if cut:
        output.extend(CUT_PAPER)
    if drawer:
        output.extend(DRAWER_KICK)

    return bytes(output)


def generate_test_ticket(printer_name, ip_address, port, paper_width='80mm'):
    """
    Generates a simple test receipt in ESC/POS format to verify connectivity.
    """
    lines = [
        INIT_PRINTER,
        ESC + b'a\x01',  # Center align
        ESC + b'E\x01',  # Bold on
        b'================================\n',
        b'ODOO LOCAL NETWORK PRINTER TEST\n',
        b'================================\n\n',
        ESC + b'E\x00',  # Bold off
        ESC + b'a\x00',  # Left align
        f"Printer Name : {printer_name}\n".encode('utf-8'),
        f"IP Address   : {ip_address}:{port}\n".encode('utf-8'),
        f"Paper Width  : {paper_width}\n".encode('utf-8'),
        b"Connection   : SUCCESSFUL (TCP 9100)\n\n",
        ESC + b'a\x01',  # Center align
        b"Direct Printing System (No IoT Box)\n",
        b"--------------------------------\n",
        FEED_LINES_4,
        CUT_PAPER,
    ]
    return b''.join(lines)
