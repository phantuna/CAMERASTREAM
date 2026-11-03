#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
BỘ GIẢI MÃ VÀ CHUẨN HÓA NGỮ PHÁP BIỂN SỐ XE VIỆT NAM (FORMAL ALPR GRAMMAR ENGINE)
Tuân thủ đầy đủ Thông tư 24/2023/TT-BCA và 58/2020/TT-BCA của Bộ Công An:

1. Biển ô tô dài (1 dòng): 
   [2 số tỉnh][1 chữ sê-ri][4 hoặc 5 số] (VD: 30A-123.45, 51K-999.99, 29E-123.45 biển vàng)
   hoặc xe liên doanh: [2 số tỉnh][2 chữ sê-ri][4-5 số] (VD: 30LD-123.45)

2. Biển ô tô vuông (2 dòng - xe con, taxi, xe bán tải, SUV, xe tải):
   - Dòng 1: [2 số tỉnh][1 chữ sê-ri] -> ĐÚNG 3 KÝ TỰ (VD: 50E, 30A, 51K, 15C, 29E...)
     hoặc xe liên doanh: [2 số tỉnh][2 chữ cái] -> ĐÚNG 4 KÝ TỰ (VD: 30LD, 51DA)
     TUYỆT ĐỐI KHÔNG CÓ SỐ ĐỨNG SAU CHỮ CÁI Ở BIỂN Ô TÔ.
   - Dòng 2: [4 hoặc 5 chữ số] (VD: 112.97, 1234)

3. Biển xe máy (2 dòng):
   - Dòng 1: [2 số tỉnh][1 chữ cái sê-ri][1 số sê-ri từ 1 đến 9] -> ĐÚNG 4 KÝ TỰ (VD: 65B1, 64K4, 29E2...)
     hoặc xe máy điện/50cc: [2 số tỉnh][2 chữ cái] -> ĐÚNG 4 KÝ TỰ (VD: 29AA, 59MD)
     LƯU Ý: Số sê-ri xe máy LUÔN TỪ 1 ĐẾN 9, KHÔNG BAO GIỜ CÓ SỐ 0 (Không có 50E0 hay 65B0).
   - Dòng 2: [4 hoặc 5 chữ số] (VD: 045.66, 7483)

4. Biển quân đội & ngoại giao:
   - Quân đội: [2 chữ cái đỏ: QA, TM, TH, QB, TC...][4 chữ số]
   - Ngoại giao: 80-NG-xxx-xx
"""

import re
from typing import Tuple, Optional

# Bảng tra cứu chuyển đổi ký tự OCR nhầm lẫn từ chữ sang số (dùng cho phần số)
LETTER_TO_DIGIT = {
    'O': '0', 'D': '0', 'Q': '0',
    'I': '1', 'L': '1', 'J': '1',
    'Z': '2',
    'A': '4',
    'S': '5',
    'G': '6',
    'B': '8',
}

# Bảng tra cứu chuyển đổi ký tự OCR nhầm lẫn từ số sang chữ (dùng cho vị trí sê-ri)
DIGIT_TO_LETTER = {
    '0': 'D',
    '1': 'I',
    '2': 'Z',
    '4': 'A',
    '5': 'S',
    '6': 'G',
    '8': 'B',
}

# Danh sách ký tự sê-ri hợp lệ của Việt Nam
VALID_SERIES_LETTERS = set("ABCDEFGHKLMNPSTUVXYZ")


def clean_raw_ocr_text(text: str) -> str:
    """Loại bỏ ký tự lạ, giữ lại chữ cái và chữ số, viết hoa toàn bộ."""
    if not text:
        return ""
    text = str(text).upper().strip()
    return re.sub(r"[^A-Z0-9]", "", text)


def decode_plate_top_line(raw_text: str) -> str:
    """
    Giải mã Dòng 1 của biển số 2 dòng theo Ngữ pháp chuẩn:
    - Ô tô vuông: 3 ký tự (VD: 50E, 30A, 51K, 29E)
    - Xe máy: 4 ký tự (VD: 65B1, 64K4, 29E2, 29AA, 59MD)
    - Quân đội: 2 ký tự (VD: QA, TM, TH)
    Tự động triệt tiêu các token ảo giác thừa do Transformer sinh ra.
    """
    clean = clean_raw_ocr_text(raw_text)
    if not clean or len(clean) < 2:
        return clean

    chars = list(clean)

    # 1. KIỂM TRA BIỂN QUÂN ĐỘI / NGOẠI GIAO (Bắt đầu bằng 2 chữ cái đỏ như QA, TM, TH...)
    if len(chars) >= 2 and chars[0].isalpha() and chars[1].isalpha() and chars[0] not in ('O', 'D', 'I'):
        return "".join(chars[:2])

    # 2. BIỂN DÂN SỰ (Ô tô / Xe máy / Xe điện):
    # Ký tự 0 & 1: Bắt buộc là số tỉnh thành (11 - 99)
    for i in range(min(2, len(chars))):
        if chars[i] in LETTER_TO_DIGIT:
            chars[i] = LETTER_TO_DIGIT[chars[i]]

    # Ký tự 2: Ký tự sê-ri (A - Z)
    if len(chars) >= 3:
        if chars[2] in DIGIT_TO_LETTER:
            chars[2] = DIGIT_TO_LETTER[chars[2]]

    # NGUYÊN TẮC QUYẾT ĐỊNH ĐỘ DÀI DÒNG 1:
    # Nếu chỉ có 2-3 ký tự:
    if len(chars) <= 3:
        return "".join(chars)

    # Nếu có từ 4 ký tự trở lên (chars[3] tồn tại):
    c3 = chars[3]
    # Trường hợp 2 chữ cái sê-ri (VD: 29AA, 30LD, 51MD): Ký tự thứ 3 là chữ cái
    if c3.isalpha():
        return "".join(chars[:4])

    # Trường hợp sê-ri xe máy thông thường: Ký tự thứ 3 là số từ 1 đến 9 (VD: 65B1, 64K4, 29E2)
    if c3.isdigit() and c3 != '0':
        return "".join(chars[:4])

    # NẾU KÝ TỰ THỨ 3 LÀ SỐ '0' (VD: 50E0, 30A0, 51K0):
    # Ở Việt Nam KHÔNG BAO GIỜ có sê-ri xe máy kết thúc bằng 0.
    # Đây 100% là số 0 ảo giác do Transformer thêm vào biển ô tô 3 ký tự (50E)!
    # -> Cắt bỏ số 0 này để trả về đúng 3 ký tự của biển ô tô:
    return "".join(chars[:3])


def decode_plate_bottom_line(raw_text: str) -> str:
    """
    Giải mã Dòng 2 của biển số 2 dòng theo Ngữ pháp chuẩn:
    - Bản chất 100% LÀ CHỮ SỐ (4 hoặc 5 số).
    - Tự động chuyển đổi các chữ cái do OCR đọc nhầm do font (S->5, O/D->0, B->8, Z->2, I/L->1).
    - Triệt tiêu vòng lặp số 0 ảo giác (VD: 748300000 -> 7483).
    - Cắt đúng độ dài tối đa 5 chữ số.
    """
    clean = clean_raw_ocr_text(raw_text)
    if not clean:
        return ""

    digits = []
    for ch in clean:
        if ch.isdigit():
            digits.append(ch)
        elif ch in LETTER_TO_DIGIT:
            digits.append(LETTER_TO_DIGIT[ch])

    num_str = "".join(digits)
    if not num_str:
        return ""

    # 1. Triệt tiêu vòng lặp số 0 ảo giác (Repetitive Zero Loop: 000, 0000, 00000)
    # Ví dụ: Biển 4 số "7483" bị decoder sinh thêm thành "748300000"
    if len(num_str) > 4 and re.search(r"0{2,}$", num_str):
        trimmed = re.sub(r"0{2,}$", "", num_str)
        if len(trimmed) in (4, 5):
            return trimmed

    # 2. Lấy tối đa 5 chữ số đầu tiên
    return num_str[:5]


def decode_single_line_plate(raw_text: str) -> str:
    """
    Giải mã Biển 1 dòng (ô tô dài) theo Ngữ pháp chuẩn:
    - Cấu trúc: [2 số tỉnh][1-2 chữ sê-ri][4-5 số] (tổng độ dài 7 đến 9 ký tự).
    - Cắt bỏ phần đuôi ảo giác thừa nếu vượt quá độ dài hợp lệ.
    """
    clean = clean_raw_ocr_text(raw_text)
    if len(clean) < 7:
        return clean

    # Nếu có đuôi 0 lặp ảo giác
    if len(clean) > 9 and re.search(r"0{2,}$", clean):
        trimmed = re.sub(r"0{2,}$", "", clean)
        if 7 <= len(trimmed) <= 9:
            clean = trimmed

    # Giới hạn tối đa 9 ký tự chữ và số
    alnum = clean[:9]

    # Định dạng hiển thị chuẩn: 30A-123.45 hoặc 51K-1234
    if len(alnum) == 8 and alnum[2].isalpha() and alnum[3:].isdigit():
        return f"{alnum[:3]}-{alnum[3:6]}.{alnum[6:]}"
    if len(alnum) == 9 and alnum[2].isalpha() and alnum[3:].isdigit():
        return f"{alnum[:3]}-{alnum[3:6]}.{alnum[6:]}"
    if len(alnum) == 9 and alnum[2:4].isalpha() and alnum[4:].isdigit():
        return f"{alnum[:4]}-{alnum[4:7]}.{alnum[7:]}"

    return alnum


def format_two_line_plate(top_str: str, bot_str: str) -> str:
    """
    Ghép 2 dòng biển số thành chuỗi chuẩn hiển thị:
    - 50E và 11297 -> 50E-112.97
    - 65B1 và 04566 -> 65B1-045.66
    - 64K4 và 7483 -> 64K4-7483
    """
    top_clean = decode_plate_top_line(top_str)
    bot_clean = decode_plate_bottom_line(bot_str)

    if not top_clean and not bot_clean:
        return ""
    if not top_clean:
        return bot_clean
    if not bot_clean:
        return top_clean

    # Định dạng dòng dưới: 5 số thì thêm dấu chấm ngăn cách (112.97, 045.66), 4 số thì giữ nguyên (7483)
    if len(bot_clean) == 5:
        formatted_bot = f"{bot_clean[:3]}.{bot_clean[3:]}"
    else:
        formatted_bot = bot_clean

    return f"{top_clean}-{formatted_bot}"


def parse_two_line_plate_for_training(text: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Tách nhãn tổng của một biển 2 dòng thành nhãn dòng 1 và dòng 2 dùng khi chuẩn bị Dataset Train:
    - 50E-112.97 -> ('50E', '11297')
    - 50E11297 -> ('50E', '11297')
    - 65B1-045.66 -> ('65B1', '04566')
    - 64K47483 -> ('64K4', '7483')
    """
    raw = str(text).upper().strip()
    if "-" in raw:
        parts = raw.split("-", 1)
        top = decode_plate_top_line(parts[0])
        bot = decode_plate_bottom_line(parts[1])
        return top, bot

    clean = clean_raw_ocr_text(raw)
    if not clean or len(clean) < 6:
        return None, None

    # Biển quân đội: 6 ký tự (QA1234 -> QA, 1234)
    if len(clean) == 6 and clean[:2].isalpha() and clean[2:].isdigit():
        return clean[:2], clean[2:]

    # Biển ô tô vuông 8 ký tự (30A12345 -> 30A, 12345)
    if len(clean) == 8 and clean[2].isalpha() and clean[3:].isdigit():
        return clean[:3], clean[3:]

    # Biển xe máy 4 số 8 ký tự (64K47483 -> 64K4, 7483)
    if len(clean) == 8 and clean[2].isalpha() and clean[3].isdigit():
        return clean[:4], clean[4:]

    # Biển xe máy 5 số 9 ký tự (65B104566 -> 65B1, 04566)
    if len(clean) == 9 and clean[2].isalpha() and clean[3].isdigit():
        return clean[:4], clean[4:]

    # Biển ô tô vuông liên doanh 9 ký tự (30LD12345 -> 30LD, 12345)
    if len(clean) == 9 and clean[2:4].isalpha() and clean[4:].isdigit():
        return clean[:4], clean[4:]

    mid = len(clean) // 2
    return clean[:mid], clean[mid:]
