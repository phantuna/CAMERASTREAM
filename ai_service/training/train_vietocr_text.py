#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
MODULE HUẤN LUYỆN VIETOCR NHẬN DIỆN ẢNH CROP THÀNH TEXT (OCR MODEL TRAINING)
- Đọc dữ liệu nhãn trực tiếp từ: ocr_labels_template.xlsx (hoặc ocr_labels_template.csv)
- Nạp ảnh từ: output/alpr/datasets/ocr/crops
- Xuất mô hình: output/alpr/models/ocr/vietocr_license_plate.pth
"""

from pathlib import Path
import csv
import os
import re
import shutil
import sys
import random

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore
        sys.stderr.reconfigure(encoding="utf-8")  # type: ignore
    except Exception:
        pass

# Định vị thư mục
BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent

VIETOCR_SRC = PROJECT_ROOT / "VietOCR"
if not VIETOCR_SRC.exists():
    VIETOCR_SRC = BASE_DIR / "VietOCR"

if VIETOCR_SRC.exists() and str(VIETOCR_SRC) not in sys.path:
    sys.path.insert(0, str(VIETOCR_SRC))

LOCAL_DATASET = BASE_DIR / "dataset"
LABELS_XLSX = LOCAL_DATASET / "ocr_labels_template.xlsx" if (LOCAL_DATASET / "ocr_labels_template.xlsx").exists() else PROJECT_ROOT / "ocr_labels_template.xlsx"
LABELS_CSV = LOCAL_DATASET / "ocr_labels_template.csv" if (LOCAL_DATASET / "ocr_labels_template.csv").exists() else PROJECT_ROOT / "ocr_labels_template.csv"
CROPS_ROOT = LOCAL_DATASET / "crops" if (LOCAL_DATASET / "crops").exists() else PROJECT_ROOT / "output" / "alpr" / "datasets" / "ocr" / "crops"

DATASET_ROOT = PROJECT_ROOT / "output" / "alpr" / "datasets" / "ocr" / "vietocr_dataset"
TRAINING_ROOT = PROJECT_ROOT / "output" / "alpr" / "training" / "ocr"
MODEL_ROOT = PROJECT_ROOT / "output" / "alpr" / "models" / "ocr"

# Siêu tham số
BATCH_SIZE = 16
NUM_EPOCHS = 15
LEARNING_RATE = 0.0003
NUM_WORKERS = 0


def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)


from utils.plate_validator import validate_vietnam_plate


def load_labels_from_excel_or_csv() -> list:
    """Nạp và làm sạch nhãn từ file Excel (hoặc CSV). Tự động loại bỏ nhãn sai/rác."""
    raw_rows = []

    # Ưu tiên đọc file Excel vì chứa các nhãn bạn đã điền
    if LABELS_XLSX.exists():
        print(f"[INFO] Đang nạp nhãn từ file Excel: {LABELS_XLSX.name} ...")
        try:
            import openpyxl
            wb = openpyxl.load_workbook(str(LABELS_XLSX), data_only=True)
            sheet = wb.active
            if sheet is None and wb.sheetnames:
                sheet = wb[wb.sheetnames[0]]
            if sheet is not None:
                all_rows = list(sheet.iter_rows(values_only=True))
                for r in all_rows[1:]:
                    if len(r) >= 4 and r[3] is not None:
                        text = str(r[3]).strip()
                        crop_rel = str(r[2] or "").strip()
                        split = str(r[0] or "train").strip().lower()
                        if text and crop_rel:
                            crop_path = crop_rel.replace("\\", "/").replace("datasets/ocr/", "output/alpr/datasets/ocr/")
                            raw_rows.append({
                                "split": "valid" if split in ["valid", "val"] else "train",
                                "crop_path": crop_path,
                                "lp": text
                            })
                print(f"[INFO] Đọc được {len(raw_rows)} dòng có nhãn từ Excel.")
        except Exception as e:
            print(f"[WARN] Không đọc được Excel ({e}), chuyển sang đọc file CSV...")
            raw_rows = []

    if not raw_rows and LABELS_CSV.exists():
        print(f"[INFO] Đang nạp nhãn từ CSV: {LABELS_CSV.name} ...")
        with LABELS_CSV.open("r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                lp = (row.get("text") or row.get("lp") or "").strip()
                crop_rel = (row.get("crop") or row.get("crop_path") or "").strip()
                if lp and crop_rel:
                    crop_path = crop_rel.replace("\\", "/").replace("datasets/ocr/", "output/alpr/datasets/ocr/")
                    raw_rows.append({
                        "split": row.get("split", "train").strip(),
                        "crop_path": crop_path,
                        "lp": lp
                    })

    if not raw_rows:
        raise ValueError("Không tìm thấy dữ liệu nhãn hợp lệ nào trong file Excel hoặc CSV!")

    # LÀM SẠCH VÀ KIỂM TRA ĐỊNH DẠNG BIỂN SỐ VIỆT NAM
    clean_rows = []
    skipped_count = 0
    for item in raw_rows:
        is_valid, cleaned, reason = validate_vietnam_plate(item["lp"])
        if is_valid:
            item["lp"] = cleaned
            clean_rows.append(item)
        else:
            skipped_count += 1

    print(f"[INFO] Bộ lọc dữ liệu: {len(clean_rows)} nhãn đạt chuẩn biển số VN | {skipped_count} nhãn sai định dạng đã được loại bỏ.")
    return clean_rows


from utils.plate_grammar import parse_two_line_plate_for_training as parse_two_line_plate


def prepare_dataset(rows: list) -> Path:
    ensure_dir(DATASET_ROOT)
    images_dir = DATASET_ROOT / "images"
    ensure_dir(images_dir)

    import cv2
    from utils.image_utils import find_split_line_2row_plate

    train_rows = []
    valid_rows = []
    split_2line_count = 0
    single_line_count = 0

    print("\n[INFO] Đang xử lý và phân tách dữ liệu huấn luyện (Dataset Builder)...")

    for r in rows:
        crop_fname = Path(r["crop_path"]).name
        src = CROPS_ROOT / r["split"] / crop_fname
        if not src.exists():
            src = PROJECT_ROOT / r["crop_path"]
        if not src.exists():
            continue

        img = cv2.imread(str(src))
        if img is None:
            continue

        h, w = img.shape[:2]
        aspect_ratio = w / max(1, h)

        # PHÂN LOẠI & HUẤN LUYỆN THEO TỪNG DÒNG (ROW-LEVEL OCR TRAINING):
        # Biển 2 dòng (aspect_ratio < 1.9, h >= 32): Tách thành 2 ảnh dòng 1 và dòng 2 riêng biệt.
        # Giúp Transformer học chuẩn độ dài ngắn (3-5 ký tự) và tự động phát ra <eos> dừng đúng lúc!
        if aspect_ratio < 1.9 and h >= 32:
            try:
                split_y = find_split_line_2row_plate(img)
            except Exception:
                split_y = int(h * 0.50)

            # Cắt 2 dòng an toàn
            top_crop = img[0:max(14, split_y - 2), :]
            bot_crop = img[min(h - 14, split_y + 2):h, :]

            top_label, bot_label = parse_two_line_plate(r["lp"])
            stem = Path(src.name).stem

            # Lưu dòng 1 (r1)
            if top_label and top_crop.size > 0:
                top_name = f"{stem}_r1.jpg"
                top_dst = images_dir / top_name
                cv2.imwrite(str(top_dst), top_crop)
                top_item = f"images/{top_name}\t{top_label}\n"
                if r["split"] == "valid":
                    valid_rows.append(top_item)
                else:
                    train_rows.append(top_item)

            # Lưu dòng 2 (r2)
            if bot_label and bot_crop.size > 0:
                bot_name = f"{stem}_r2.jpg"
                bot_dst = images_dir / bot_name
                cv2.imwrite(str(bot_dst), bot_crop)
                bot_item = f"images/{bot_name}\t{bot_label}\n"
                if r["split"] == "valid":
                    valid_rows.append(bot_item)
                else:
                    train_rows.append(bot_item)

            split_2line_count += 1

        else:
            # Biển 1 dòng thông thường (dài)
            dst = images_dir / src.name
            if not dst.exists():
                shutil.copy2(src, dst)

            item = f"images/{src.name}\t{r['lp']}\n"
            if r["split"] == "valid":
                valid_rows.append(item)
            else:
                train_rows.append(item)

            single_line_count += 1

    # Đảm bảo tập valid có ít nhất 15% mẫu để đo lường độ chính xác
    if not valid_rows or len(valid_rows) < 10:
        random.seed(42)
        all_samples = train_rows + valid_rows
        random.shuffle(all_samples)
        val_count = max(10, int(len(all_samples) * 0.15))
        valid_rows = all_samples[:val_count]
        train_rows = all_samples[val_count:]

    with (DATASET_ROOT / "train.txt").open("w", encoding="utf-8") as f:
        f.writelines(train_rows)
    with (DATASET_ROOT / "valid.txt").open("w", encoding="utf-8") as f:
        f.writelines(valid_rows)

    print(f"\n[INFO] Dataset chuẩn bị hoàn tất tại: {DATASET_ROOT}")
    print(f"       - Biển 2 dòng đã tách dòng (Row-level Sliced) : {split_2line_count} biển ({split_2line_count * 2} mẫu dòng)")
    print(f"       - Biển 1 dòng dài (Single-line Plates)         : {single_line_count} biển")
    print(f"       - Tổng số mẫu huấn luyện (Train)               : {len(train_rows)}")
    print(f"       - Tổng số mẫu kiểm thử (Valid)                 : {len(valid_rows)}")
    return DATASET_ROOT


class LicensePlateSkewAugmentor:
    """
    Bộ tăng cường dữ liệu chuyên biệt cho Biển Số Xe Việt Nam:
    - Xoay ngẫu nhiên từ -25° đến +25° (mô phỏng biển số bị nghiêng xe, lệch góc chụp)
    - Phối cảnh 3D Perspective (mô phỏng camera an ninh chụp từ trên cao, chéo góc 30-45 độ)
    - Kéo xiên Affine (Shear -14° đến +14°)
    - Biến thiên ánh sáng, tương phản (mô phỏng ban đêm, chói lóa đèn xe)
    - Mờ chuyển động nhẹ (MotionBlur khi xe đang di chuyển qua cổng)
    """
    def __init__(self):
        try:
            import albumentations as A
            import cv2
            self.aug = A.Compose([
                A.Rotate(limit=25, p=0.8, border_mode=cv2.BORDER_REPLICATE),
                A.Perspective(scale=(0.04, 0.12), p=0.6),
                A.Affine(shear=(-14, 14), p=0.5),
                A.RandomBrightnessContrast(brightness_limit=0.25, contrast_limit=0.25, p=0.6),
                A.MotionBlur(blur_limit=(3, 5), p=0.35),
            ])
            self.enabled = True
        except Exception as e:
            print(f"[WARN] Không nạp được albumentations ({e}), chuyển sang chế độ chuẩn.")
            self.enabled = False

    def __call__(self, img):
        if not self.enabled:
            return img
        try:
            import numpy as np
            from PIL import Image
            img_np = np.array(img)
            transformed = self.aug(image=img_np)
            return Image.fromarray(transformed["image"])
        except Exception:
            return img


def train(dataset_root: Path):
    from vietocr.tool.config import Cfg  # type: ignore
    from vietocr.model.trainer import Trainer  # type: ignore
    import torch

    print("\n" + "=" * 80)
    print("BẮT ĐẦU HUẤN LUYỆN VIETOCR CHỐNG NGHIÊNG VỚI TOÀN BỘ NHÃN")
    print("=" * 80)

    config = Cfg.load_config_from_name("vgg_transformer")
    dataset_name = "license_plate_ocr"

    # Xóa cache LMDB cũ
    for p in [Path(f"train_{dataset_name}"), Path(f"valid_{dataset_name}"), dataset_root / f"train_{dataset_name}", dataset_root / f"valid_{dataset_name}"]:
        if p.exists():
            shutil.rmtree(p, ignore_errors=True)

    num_train_samples = sum(1 for _ in (dataset_root / "train.txt").open("r", encoding="utf-8"))
    iters_per_epoch = max(1, num_train_samples // BATCH_SIZE)
    total_iters = iters_per_epoch * NUM_EPOCHS

    ensure_dir(TRAINING_ROOT)
    ensure_dir(MODEL_ROOT)

    export_weights_path = TRAINING_ROOT / "transformerocr.pth"
    checkpoint_path = TRAINING_ROOT / "transformerocr_checkpoint.pth"

    config["dataset"]["name"] = dataset_name
    config["dataset"]["data_root"] = str(dataset_root)
    config["dataset"]["train_annotation"] = "train.txt"
    config["dataset"]["valid_annotation"] = "valid.txt"

    config["trainer"]["batch_size"] = BATCH_SIZE
    config["trainer"]["iters"] = total_iters
    config["trainer"]["print_every"] = 25
    config["trainer"]["valid_every"] = max(25, iters_per_epoch)
    config["trainer"]["checkpoint"] = str(checkpoint_path)
    config["trainer"]["export"] = str(export_weights_path)
    config["trainer"]["log"] = str(TRAINING_ROOT / "train.log")
    config["trainer"]["metrics"] = None

    config["optimizer"]["max_lr"] = LEARNING_RATE
    config["dataloader"]["num_workers"] = NUM_WORKERS

    config["device"] = "cuda:0" if torch.cuda.is_available() else "cpu"

    # KÍCH HOẠT AUGMENTATION CHUYÊN DỤNG CHO BIỂN SỐ NGHIÊNG
    config["aug"] = {
        "image_aug": True,
        "masked_language_model": False
    }
    augmentor = LicensePlateSkewAugmentor()

    print(f"[INFO] Thiết bị: {config['device']} | Tổng số iteration: {total_iters:,}")
    print("[INFO] Đã kích hoạt bộ huấn luyện chống nghiêng (License Plate Skew Augmentation):")
    print("       🔄 Xoay góc ngẫu nhiên: -25° đến +25°")
    print("       📐 Phối cảnh 3D góc chéo (Perspective Tilt): scale 0.04 - 0.12")
    print("       ⚡ Kéo xiên chữ (Affine Shear): -14° đến +14°")
    print("       🌙 Giả lập tương phản ban đêm & mờ chuyển động xe")

    # BẮT ĐẦU HUẤN LUYỆN
    trainer = Trainer(config, augmentor=augmentor)
    trainer.train()

    target_local = BASE_DIR / "models" / "vietocr_license_plate.pth"
    target_backup = MODEL_ROOT / "vietocr_license_plate.pth"
    ensure_dir(BASE_DIR / "models")
    ensure_dir(MODEL_ROOT)

    source_weights = export_weights_path if export_weights_path.exists() else checkpoint_path
    if source_weights.exists():
        shutil.copy2(source_weights, target_local)
        shutil.copy2(source_weights, target_backup)

    print("\n" + "=" * 80)
    print(f"🎉 [THÀNH CÔNG] Đã huấn luyện xong và lưu 2 bản mô hình VietOCR mới tại:")
    print(f"  👉 Bản cho App UI : {target_local}")
    print(f"  👉 Bản lưu trữ ALPR: {target_backup}")
    print("=" * 80)


def main():
    rows = load_labels_from_excel_or_csv()
    dataset_dir = prepare_dataset(rows)
    train(dataset_dir)


if __name__ == "__main__":
    main()
