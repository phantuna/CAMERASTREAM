#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
PLATE VALIDATOR & SANITIZER
Bộ lọc và chuẩn hóa biển số xe Việt Nam.
Giúp kiểm tra nhãn dữ liệu chuẩn (tránh nhãn rác khi train) và hậu xử lý kết quả OCR.
"""

import re
from typing import Tuple, Optional

# Danh sách mã tỉnh/thành phố hợp lệ của Việt Nam (11 -> 99)
VALID_PROVINCE_CODES = {
    "11", "12", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25",
    "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39",
    "40", "43", "47", "48", "49", "50", "51", "52", "53", "54", "55", "56", "57", "58",
    "59", "60", "61", "62", "63", "64", "65", "66", "67", "68", "69", "70", "71", "72",
    "73", "74", "75", "76", "77", "78", "79", "80", "81", "82", "83", "84", "85", "86", "88",
    "89", "90", "92", "93", "94", "95", "97", "98", "99"
}

# Các chữ cái sê-ri hợp lệ trong biển số Việt Nam
VALID_SERIES_LETTERS = set("ABCDEFGHKLMNPSTUVXYZ")


def clean_plate_text(raw_text: str) -> str:
    """Loại bỏ ký tự đặc biệt, dấu chấm, gạch ngang, khoảng trắng và chuyển chữ hoa."""
    if not raw_text:
        return ""
    try:
        from core._frame_sync import filter_ocr_result
        txt, _ = filter_ocr_result(raw_text, 1.0)
        if not txt:
            return ""
    except Exception:
        pass
    # Chuyển về chữ hoa và chỉ giữ chữ cái + chữ số
    text = re.sub(r"[^A-Za-z0-9]", "", raw_text).upper()
    return text


OPTICAL_CHAR_TO_DIGIT = {
    'O': '0', 'D': '0', 'Q': '0', 'I': '1', 'L': '1', 'T': '1',
    'Z': '2', 'B': '8', 'S': '5', 'G': '6', 'A': '4'
}

OPTICAL_DIGIT_TO_CHAR = {
    '0': 'D', '8': 'B', '1': 'T', '2': 'Z', '5': 'S', '4': 'A', '6': 'G'
}


def repair_optical_plate(cleaned: str) -> str:
    """Tự động sửa các lỗi nhầm lẫn quang học phổ biến giữa chữ và số trong biển số VN."""
    if len(cleaned) < 7:
        return cleaned
    chars = list(cleaned)

    # 1. Hai ký tự đầu (Mã tỉnh) bắt buộc là số: sửa chữ -> số
    for i in (0, 1):
        if chars[i] in OPTICAL_CHAR_TO_DIGIT:
            chars[i] = OPTICAL_CHAR_TO_DIGIT[chars[i]]

    # 2. Ký tự thứ 3 (Sê-ri) bắt buộc là chữ cái: sửa số -> chữ
    if chars[2].isdigit() and chars[2] in OPTICAL_DIGIT_TO_CHAR:
        chars[2] = OPTICAL_DIGIT_TO_CHAR[chars[2]]

    # 3. Phần đuôi (4 hoặc 5 số cuối): sửa chữ -> số
    tail_len = 5 if len(chars) >= 9 else 4
    for i in range(len(chars) - tail_len, len(chars)):
        if chars[i] in OPTICAL_CHAR_TO_DIGIT:
            chars[i] = OPTICAL_CHAR_TO_DIGIT[chars[i]]

    return "".join(chars)


def validate_vietnam_plate(raw_text: str) -> Tuple[bool, str, Optional[str]]:
    """
    Kiểm tra biển số xe có đúng quy cách Việt Nam hay không.
    Tự động sửa lỗi nhầm lẫn ký tự quang học (O/0, B/8, I/1, S/5, etc.) trước khi kiểm định.
    Returns:
        (is_valid: bool, cleaned_text: str, reason: str or None)
    """
    cleaned = clean_plate_text(raw_text)
    length = len(cleaned)

    # 1. Độ dài chuẩn biển số Việt Nam: tối thiểu 7 ký tự (tối đa 9 ký tự cho biển dân sự)
    if length < 7:
        # Chỉ ngoại lệ duy nhất cho biển quân sự 6 ký tự (2 chữ cái đầu + 4 số, VD: TM1234, QA1234)
        if length == 6 and cleaned[:2].isalpha() and cleaned[2:].isdigit():
            return True, cleaned, None
        return False, cleaned, f"Độ dài quá ngắn ({length} ký tự, tối thiểu 7)"
    if length > 9:
        return False, cleaned, f"Độ dài quá dài ({length} ký tự, tối đa 9)"

    # Tự động nắn chỉnh ký tự quang học
    repaired = repair_optical_plate(cleaned)

    # 2. Hai ký tự đầu phải là mã tỉnh thành hợp lệ (2 chữ số: 11 -> 99)
    prov_code = repaired[:2]
    if prov_code.isdigit() and prov_code in VALID_PROVINCE_CODES:
        series_char = repaired[2]
        if series_char.isalpha() and series_char in VALID_SERIES_LETTERS:
            # Ô tô (7-8 ký tự: 2 số tỉnh + 1 chữ + 4/5 số) hoặc Xe máy (8-9 ký tự: 2 số tỉnh + 1 chữ + 1 số/chữ + 4/5 số)
            tail = repaired[3:]
            if len(tail) in (4, 5) and tail.isdigit():
                return True, repaired, None
            if len(tail) in (5, 6) and (tail[0].isdigit() or tail[0].isalpha()) and tail[1:].isdigit():
                return True, repaired, None

    # Biển quân sự / công vụ (2 chữ cái đầu + 4 hoặc 5 chữ số)
    if repaired[:2].isalpha() and repaired[2:].isdigit() and len(repaired) in (6, 7):
        return True, repaired, None

    # Biển liên doanh / nước ngoài (LD, DA, NN, NG: 2 số tỉnh + 2 chữ + 4/5 số)
    if prov_code.isdigit() and prov_code in VALID_PROVINCE_CODES and repaired[2:4].isalpha() and repaired[4:].isdigit():
        return True, repaired, None

    return False, cleaned, "Không khớp quy cách biển số chuẩn VN"


def format_plate_display(cleaned_text: str) -> str:
    """
    Định dạng hiển thị đẹp mắt cho biển số xe (VD: 51G-100.96 hoặc 66K8-6475)
    """
    cleaned = clean_plate_text(cleaned_text)
    if len(cleaned) < 7:
        return cleaned

    # Biển ô tô 8 ký tự (VD: 51G10096 -> 51G-100.96)
    if len(cleaned) == 8 and cleaned[2].isalpha() and cleaned[3:].isdigit():
        return f"{cleaned[:3]}-{cleaned[3:6]}.{cleaned[6:]}"

    # Biển ô tô 9 ký tự (VD: 29LD12345 -> 29LD-123.45)
    if len(cleaned) == 9 and cleaned[2:4].isalpha() and cleaned[4:].isdigit():
        return f"{cleaned[:4]}-{cleaned[4:7]}.{cleaned[7:]}"

    # Biển xe máy 8 ký tự (VD: 66K86475 -> 66K8-6475)
    if len(cleaned) == 8 and cleaned[2].isalpha() and cleaned[3].isdigit():
        return f"{cleaned[:4]}-{cleaned[4:]}"

    # Biển xe máy 9 ký tự (VD: 35B263371 -> 35-B2 633.71)
    if len(cleaned) == 9 and cleaned[2].isalpha() and cleaned[3].isdigit() and cleaned[4:].isdigit():
        return f"{cleaned[:2]}-{cleaned[2:4]} {cleaned[4:7]}.{cleaned[7:]}"

    return cleaned
