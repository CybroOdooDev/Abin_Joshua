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
        if not image_input or len(image_input.strip()) < 50:
            raise ValueError("Empty or invalid receipt image data received from POS frontend.")
        try:
            image_bytes = base64.b64decode(image_input)
        except Exception as e:
            raise ValueError(f"Failed to decode receipt base64 image: {e}")
        if not image_bytes:
            raise ValueError("Decoded receipt image payload is empty.")
        img = Image.open(io.BytesIO(image_bytes))
    elif isinstance(image_input, bytes):
        if not image_input:
            raise ValueError("Receipt image payload is empty.")
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


def generate_kitchen_ticket(order, paper_width='80mm'):
    """
    Generates a high-contrast thermal preparation ticket for kitchen/bar printers.
    Formats courses/plating levels, quantities, and customer notes clearly.
    """
    TXT_RESET = ESC + b'!\x00'
    TXT_BOLD = ESC + b'E\x01'
    TXT_BOLD_OFF = ESC + b'E\x00'
    TXT_DOUBLE_SIZE = ESC + b'!\x30'
    ALIGN_LEFT = ESC + b'a\x00'
    ALIGN_CENTER = ESC + b'a\x01'

    table_name = order.table_id.name if getattr(order, 'table_id', None) else ""
    is_takeaway = getattr(order, 'take_away', False)
    tracking = str(getattr(order, 'tracking_number', '') or order.name or '')
    user_name = order.user_id.name if getattr(order, 'user_id', None) else ""
    date_str = str(order.date_order)[:19] if getattr(order, 'date_order', None) else ""

    ticket = [
        INIT_PRINTER,
        ALIGN_CENTER,
        TXT_BOLD,
        b"================================\n",
        b"***  PEDIDO DE COCINA  ***\n",
        b"================================\n\n",
        TXT_BOLD_OFF,
    ]

    # Big Table / Order Header
    ticket.append(TXT_DOUBLE_SIZE)
    if is_takeaway:
        ticket.append(b"PARA LLEVAR\n")
    elif table_name:
        ticket.append(f"MESA: {table_name}\n".encode('utf-8'))
    ticket.append(f"ORDEN #{tracking}\n".encode('utf-8'))
    ticket.append(TXT_RESET)

    # Order Metadata
    ticket.extend([
        ALIGN_LEFT,
        b"--------------------------------\n",
        f"Camarero: {user_name}\n".encode('utf-8'),
        f"Fecha: {date_str}\n".encode('utf-8'),
        b"--------------------------------\n\n",
    ])

    # Group lines by course / plating level if applicable
    courses = {}
    for line in order.lines:
        course_name = ""
        if hasattr(line, 'plating_level_id') and line.plating_level_id:
            course_name = line.plating_level_id.name
        courses.setdefault(course_name, []).append(line)

    for course, lines in courses.items():
        if course:
            ticket.extend([
                TXT_BOLD,
                f"[{course.upper()}]\n".encode('utf-8'),
                TXT_BOLD_OFF,
            ])

        for line in lines:
            qty = int(line.qty) if line.qty == int(line.qty) else line.qty
            product_name = line.product_id.name if line.product_id else ""
            if hasattr(line, '_get_kitchen_product_name'):
                product_name = line._get_kitchen_product_name()

            ticket.extend([
                TXT_BOLD,
                f"  [{qty}x] {product_name}\n".encode('utf-8'),
                TXT_BOLD_OFF,
            ])

            # Customer cooking / preparation notes
            note = getattr(line, 'customer_note', False) or getattr(line, 'note', False)
            if note:
                ticket.append(f"       >> {note}\n".encode('utf-8'))

        ticket.append(b"\n")

    ticket.extend([
        ALIGN_CENTER,
        b"--------------------------------\n",
        FEED_LINES_4,
        CUT_PAPER,
    ])

    return b''.join(ticket)

