#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
IMAGE UTILITIES
Hàm hỗ trợ đọc/ghi ảnh an toàn với đường dẫn tiếng Việt (Unicode) trên Windows,
biến đổi hình học và tiền xử lý ảnh biển số.
"""

from pathlib import Path
from typing import Optional
import cv2
import numpy as np
from PIL import Image


def imread_unicode(image_path) -> np.ndarray:
    """Đọc ảnh hỗ trợ đường dẫn Unicode tiếng Việt trên Windows an toàn."""
    path_str = str(image_path)
    try:
        # Sử dụng numpy.fromfile + cv2.imdecode để tránh lỗi cv2.imread với ký tự tiếng Việt
        data = np.fromfile(path_str, dtype=np.uint8)
        img = cv2.imdecode(data, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError(f"Không thể giải mã dữ liệu ảnh từ: {path_str}")
        return img
    except Exception as e:
        # Fallback qua PIL
        with Image.open(path_str) as pil_img:
            img_rgb = pil_img.convert("RGB")
            return cv2.cvtColor(np.array(img_rgb), cv2.COLOR_RGB2BGR)


def imwrite_unicode(image_path, img_bgr: np.ndarray) -> bool:
    """Ghi ảnh hỗ trợ đường dẫn Unicode tiếng Việt trên Windows."""
    try:
        path = Path(image_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        ext = path.suffix.lower()
        if not ext:
            ext = ".jpg"
        is_success, buffer = cv2.imencode(ext, img_bgr)
        if is_success:
            with open(str(path), "wb") as f:
                f.write(buffer)
            return True
        return False
    except Exception:
        return False


def recover_glare_image(img_bgr: Optional[np.ndarray]) -> Optional[np.ndarray]:
    """
    Tự động dìm sáng vùng lóa đèn pha / hồng ngoại (IR) ban đêm để khôi phục viền & chữ biển số:
    - Phát hiện cả lóa toàn cục (mean cao) lẫn lóa cục bộ ban đêm (nền tối nhưng đèn pha chiếu gắt vào biển).
    - Sử dụng đường cong nén vùng sáng (Highlight Roll-off LUT + CLAHE cục bộ) cực nhanh (< 0.5ms).
    """
    if img_bgr is None or img_bgr.size == 0:
        return img_bgr

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    bright_ratio = np.sum(gray > 215) / max(1, gray.size)
    very_bright_ratio = np.sum(gray > 240) / max(1, gray.size)
    mean_val = float(np.mean(gray))

    # Trường hợp 1: Ban đêm bị đèn pha / hồng ngoại rọi cháy cục bộ (nền tối mean < 110 nhưng có đốm cháy > 240)
    # Trường hợp 2: Chói nắng hoặc lóa đèn diện rộng (bright_ratio > 0.025 hoặc mean > 165)
    if very_bright_ratio > 0.012 or bright_ratio > 0.025 or mean_val > 165:
        gamma = 2.2 if (very_bright_ratio > 0.04 or bright_ratio > 0.08) else 1.65
        table = np.array([((i / 255.0) ** gamma) * 255 for i in range(256)]).astype("uint8")
        damped = cv2.LUT(img_bgr, table)
        # Cân bằng cục bộ kênh L để kéo nét chữ đen nổi lên khỏi vùng đèn chói
        lab = cv2.cvtColor(damped, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(4, 4))
        l_eq = clahe.apply(l)
        return cv2.cvtColor(cv2.merge((l_eq, a, b)), cv2.COLOR_LAB2BGR)

    return img_bgr


def is_yellow_plate(plate_bgr: np.ndarray) -> bool:
    """Kiểm tra xem biển số có phải là biển vàng (xe kinh doanh vận tải) hay không."""
    if plate_bgr is None or plate_bgr.size == 0:
        return False
    hsv = cv2.cvtColor(plate_bgr, cv2.COLOR_BGR2HSV)
    # Dải màu vàng trong không gian HSV (kể cả vàng trong bóng râm hoặc nắng gắt)
    mask = cv2.inRange(hsv, np.array([10, 25, 40]), np.array([40, 255, 255]))
    ratio = np.sum(mask > 0) / max(1, plate_bgr.shape[0] * plate_bgr.shape[1])
    return bool(ratio > 0.12)


def enhance_plate_contrast(plate_bgr: np.ndarray) -> np.ndarray:
    """Tăng độ tương phản thích ứng, bảo vệ màu vàng và chống lóa cho ảnh biển số."""
    if plate_bgr is None or plate_bgr.size == 0:
        return plate_bgr

    # XỬ LÝ RIÊNG BIỂN VÀNG: Tăng tương phản giữa chữ đen và nền vàng, bảo vệ nét chữ mảnh như '11'
    if is_yellow_plate(plate_bgr):
        lab = cv2.cvtColor(plate_bgr, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=1.6, tileGridSize=(4, 4))
        cl = clahe.apply(l)
        limg = cv2.merge((cl, a, b))
        return cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)

    # BIỂN TRẮNG: Cân bằng tương phản thông thường nhưng giới hạn clipLimit ở mức an toàn 1.5
    lab = cv2.cvtColor(plate_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(4, 4))
    cl = clahe.apply(l)
    limg = cv2.merge((cl, a, b))
    return cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)


def preprocess_for_ocr(plate_bgr: np.ndarray, target_min_height: int = 80) -> np.ndarray:
    """
    Tiền xử lý toàn diện ảnh crop biển số trước khi đưa vào VietOCR:
    1. Chuẩn hóa kích thước: Upscale bằng Lanczos4 nếu ảnh quá bé (bảo vệ nét '11' không bị dính).
    2. Cân bằng tương phản thông minh (phân biệt biển vàng / biển trắng).
    3. Tăng độ sắc nét viền chữ có kiểm soát (Unsharp Masking nhẹ).
    4. Thêm viền đệm an toàn (Padding).
    """
    if plate_bgr is None or plate_bgr.size == 0:
        return plate_bgr

    h, w = plate_bgr.shape[:2]
    img = plate_bgr.copy()
    aspect = w / max(1, h)

    # Nếu là biển vuông 2 dòng (aspect < 2.35), cần upscale tối thiểu 96px để mỗi dòng đạt >= 48px nét căng
    # Nếu là biển dài 1 dòng, cần upscale tối thiểu 64px chiều cao
    needed_height = 96 if aspect < 2.35 else max(64, target_min_height)
    if h < needed_height or (aspect >= 2.35 and w < 240):
        scale_h = needed_height / float(h)
        scale_w = (240.0 / float(w)) if (aspect >= 2.35 and w < 240) else scale_h
        scale = max(scale_h, scale_w)
        new_w = max(int(w * scale), 80)
        new_h = max(int(h * scale), needed_height)
        
        # Với ảnh ở xa quá bé (< 30px): Làm mịn nhiễu hạt trước khi phóng to
        if h < 32 or w < 64:
            img = cv2.bilateralFilter(img, 5, 50, 50)
            
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
        h, w = img.shape[:2]

    # Khử lóa đèn pha / hồng ngoại ban đêm hoặc nắng gắt trên mặt biển phản quang
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    bright_225 = np.sum(gray > 225) / max(1, gray.size)
    if bright_225 > 0.08:
        gamma_val = 1.85 if bright_225 > 0.22 else 1.45
        table = np.array([((i / 255.0) ** gamma_val) * 255 for i in range(256)]).astype("uint8")
        img = cv2.LUT(img, table)
    elif float(np.mean(gray)) < 75.0:
        # Ban đêm thiếu sáng: nâng sáng thông minh vùng tối mà không làm cháy nền biển trắng
        table = np.array([((i / 255.0) ** 0.72) * 255 for i in range(256)]).astype("uint8")
        img = cv2.LUT(img, table)

    # Cân bằng tương phản thông minh (tách bạch rõ nét chữ đen trên nền trắng/vàng)
    enhanced = enhance_plate_contrast(img)

    # Làm sắc nét có kiểm soát (Unsharp Masking) để phục hồi đường rãnh của số 8, 9, 6, 0
    gaussian = cv2.GaussianBlur(enhanced, (0, 0), 1.2)
    sharpened = cv2.addWeighted(enhanced, 1.35, gaussian, -0.35, 0)

    # Thêm viền đệm an toàn (Padding)
    pad_top, pad_bot = 4, 4
    pad_left, pad_right = 6, 6
    padded = cv2.copyMakeBorder(
        sharpened,
        pad_top, pad_bot, pad_left, pad_right,
        cv2.BORDER_REPLICATE
    )

    return padded


def find_split_line_2row_plate(enhanced_bgr: np.ndarray) -> int:
    """
    Tìm đường phân cách ngang chính xác giữa dòng 1 và dòng 2 của biển vuông/2 dòng.
    (Helper thuần OpenCV, độc lập engine OCR)
    1. Bỏ qua viền khung đen mép ngoài (12% width mỗi bên, 5% height trên dưới).
    2. Chiếu mật độ điểm chữ (Horizontal text projection) qua nhị phân hóa Otsu.
    3. Kết hợp năng lượng Sobel để tìm chính xác rãnh trống giữa 40% và 60% chiều cao,
       tuyệt đối không cắt ngang bụng các chữ/số.
    """
    h, w = enhanced_bgr.shape[:2]
    gray = cv2.cvtColor(enhanced_bgr, cv2.COLOR_BGR2GRAY)

    pad_h = max(2, int(h * 0.05))
    pad_w = max(4, int(w * 0.12))
    inner = gray[pad_h:max(pad_h + 1, h - pad_h), pad_w:max(pad_w + 1, w - pad_w)]
    ih, iw = inner.shape[:2]

    if ih < 10 or iw < 10:
        return int(h * 0.50)

    _, binary = cv2.threshold(inner, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    text_proj = np.sum(binary == 255, axis=1).astype(float)
    sobel = np.mean(np.abs(cv2.Sobel(inner, cv2.CV_64F, 0, 1, ksize=3)), axis=1)

    tp_norm = (text_proj - text_proj.min()) / max(1.0, (text_proj.max() - text_proj.min()))
    sb_norm = (sobel - sobel.min()) / max(1.0, (sobel.max() - sobel.min()))
    combined_cost = tp_norm * 0.7 + sb_norm * 0.3

    s_min = int(ih * 0.38)
    s_max = int(ih * 0.62)
    if s_max <= s_min:
        return int(h * 0.50)

    best_inner_y = s_min + int(np.argmin(combined_cost[s_min:s_max]))
    split_y = pad_h + best_inner_y
    return max(int(h * 0.42), min(split_y, int(h * 0.58)))

