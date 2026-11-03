#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
MODULE HUẤN LUYỆN YOLOX PHÁT HIỆN VỊ TRÍ BIỂN SỐ XE ĐỂ CROP (DETECTION TRAINING)
- Dữ liệu đầu vào: DATA_LICENSE_PLATE/license_plate_kaggle
- Chuyển đổi định dạng YOLO sang COCO
- Huấn luyện kiến trúc YOLOX-S
- Xuất mô hình: license_plate.pth
"""

from pathlib import Path
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from PIL import Image

if sys.platform == "win32":
    for stream in (sys.stdout, sys.stderr):
        reconf = getattr(stream, "reconfigure", None)
        if callable(reconf):
            try:
                reconf(encoding="utf-8")
            except Exception:
                pass

# Định vị thư mục
BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent

YOLOX_DIR = PROJECT_ROOT / "YOLOX"
if YOLOX_DIR.exists() and str(YOLOX_DIR) not in sys.path:
    sys.path.insert(0, str(YOLOX_DIR))
DATASET_ROOT = PROJECT_ROOT / "DATA_LICENSE_PLATE" / "dataset"
if not DATASET_ROOT.exists():
    DATASET_ROOT = PROJECT_ROOT / "DATA_LICENSE_PLATE" / "license_plate_kaggle"
WORK_ROOT = PROJECT_ROOT / "output" / "alpr"
COCO_ROOT = WORK_ROOT / "datasets" / "detection" / "coco"
COCO_ANN_ROOT = COCO_ROOT / "annotations"
MODEL_ROOT = WORK_ROOT / "models" / "detection"
TRAINING_ROOT = WORK_ROOT / "training" / "detection"
EXP_FILE = TRAINING_ROOT / "license_plate_exp.py"

CLASS_ID = 0
CLASS_NAME = "license_plate"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

BATCH_SIZE = 8
MAX_EPOCH = 5
INPUT_SIZE = (640, 640)
TEST_SIZE = (640, 640)

SPLITS = {
    "train": (DATASET_ROOT / "train" / "images", DATASET_ROOT / "train" / "labels"),
    "val": (DATASET_ROOT / "valid" / "images", DATASET_ROOT / "valid" / "labels"),
    "test": (DATASET_ROOT / "test" / "images", DATASET_ROOT / "test" / "labels"),
}


def ensure_dir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def find_images(folder: Path) -> list:
    if not folder.exists():
        return []
    return sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS)


def convert_yolo_to_coco():
    print("\n[BƯỚC 1] Chuyển đổi nhãn YOLO sang định dạng chuẩn COCO...")
    ensure_dir(COCO_ANN_ROOT)

    for split, (image_dir, label_dir) in SPLITS.items():
        if not image_dir.exists() or not label_dir.exists():
            continue

        coco = {
            "info": {"description": "Vietnamese License Plate Dataset"},
            "images": [],
            "annotations": [],
            "categories": [{"id": 1, "name": CLASS_NAME, "supercategory": "vehicle"}],
        }

        images = find_images(image_dir)
        annotation_id = 1

        for image_id, image_path in enumerate(images, start=1):
            try:
                with Image.open(image_path) as img:
                    w, h = img.size
            except Exception:
                continue

            coco["images"].append({
                "id": image_id,
                "file_name": image_path.name,
                "width": w,
                "height": h,
            })

            label_path = label_dir / f"{image_path.stem}.txt"
            if not label_path.exists():
                continue

            with label_path.open("r", encoding="utf-8") as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) != 5:
                        continue
                    cls, xc, yc, bw, bh = map(float, parts)
                    if int(cls) != CLASS_ID:
                        continue

                    x = max(0.0, min((xc - bw / 2) * w, w - 1))
                    y = max(0.0, min((yc - bh / 2) * h, h - 1))
                    box_w = max(1.0, min(bw * w, w - x))
                    box_h = max(1.0, min(bh * h, h - y))

                    coco["annotations"].append({
                        "id": annotation_id,
                        "image_id": image_id,
                        "category_id": 1,
                        "bbox": [round(x, 2), round(y, 2), round(box_w, 2), round(box_h, 2)],
                        "area": round(box_w * box_h, 2),
                        "iscrowd": 0,
                    })
                    annotation_id += 1

        ann_file = COCO_ANN_ROOT / f"instances_{split}2017.json"
        with ann_file.open("w", encoding="utf-8") as f:
            json.dump(coco, f, ensure_ascii=False, indent=2)

        print(f"  Split '{split}': {len(coco['images'])} ảnh | {len(coco['annotations'])} nhãn biển số")


def create_experiment_config():
    ensure_dir(TRAINING_ROOT)
    train_dir_str = str(SPLITS['train'][0]).replace("\\", "/")
    val_dir_str = str(SPLITS['val'][0]).replace("\\", "/")
    train_ann_str = str(COCO_ANN_ROOT / "instances_train2017.json").replace("\\", "/")
    val_ann_str = str(COCO_ANN_ROOT / "instances_val2017.json").replace("\\", "/")

    yolox_models_dir = (BASE_DIR / "models" / "yolox_training").as_posix()
    yolox_dir_str = str(YOLOX_DIR).replace("\\", "/")

    exp_code = f"""import os
import sys
import cv2
from pathlib import Path

# Đảm bảo YOLOX luôn có trong sys.path
_yolox_root = r"{yolox_dir_str}"
if _yolox_root not in sys.path:
    sys.path.insert(0, _yolox_root)

from yolox.exp import Exp as MyExp
from yolox.data import COCODataset, TrainTransform, ValTransform

class PlateDataset(COCODataset):
    def __init__(self, ann_file, img_dir, img_size, preproc=None, cache=False, cache_type="ram"):
        self.custom_img_dir = str(img_dir)
        ann_p = Path(ann_file)
        super().__init__(
            data_dir=str(ann_p.parent.parent),
            json_file=ann_p.name,
            name="",
            img_size=img_size,
            preproc=preproc,
            cache=cache,
            cache_type=cache_type,
        )

    def load_image(self, index):
        file_name = self.annotations[index][3]
        img_file = os.path.join(self.custom_img_dir, file_name)
        img = cv2.imread(img_file)
        assert img is not None, f"Không tìm thấy ảnh tại: {{img_file}}"
        return img


class Exp(MyExp):
    def __init__(self):
        super().__init__()
        self.depth = 0.33
        self.width = 0.50
        self.num_classes = 1
        self.input_size = {INPUT_SIZE!r}
        self.test_size = {TEST_SIZE!r}
        self.max_epoch = {MAX_EPOCH}
        self.warmup_epochs = 1
        self.no_aug_epochs = 1
        self.data_num_workers = 0
        self.print_interval = 10
        self.eval_interval = 1
        self.output_dir = r"{yolox_models_dir}"
        self.exp_name = "plate"

    def get_dataset(self, cache: bool = False, cache_type: str = "ram"):
        return PlateDataset(
            ann_file=r"{train_ann_str}",
            img_dir=r"{train_dir_str}",
            img_size=self.input_size,
            preproc=TrainTransform(
                max_labels=50,
                flip_prob=self.flip_prob,
                hsv_prob=self.hsv_prob
            ),
            cache=cache,
            cache_type=cache_type,
        )

    def get_eval_dataset(self, **kwargs):
        testdev = kwargs.get("testdev", False)
        legacy = kwargs.get("legacy", False)
        return PlateDataset(
            ann_file=r"{val_ann_str}",
            img_dir=r"{val_dir_str}",
            img_size=self.test_size,
            preproc=ValTransform(legacy=legacy),
        )
"""
    EXP_FILE.write_text(exp_code.strip() + "\n", encoding="utf-8")
    print(f"\n[BƯỚC 2] Đã tạo file cấu hình YOLOX: {EXP_FILE}")


def download_pretrained_yolox() -> Path:
    ckpt_path = YOLOX_DIR / "yolox_s.pth"
    if not ckpt_path.exists():
        url = "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.pth"
        print(f"Đang tải trọng số YOLOX-S pre-trained từ {url} ...", flush=True)
        urllib.request.urlretrieve(url, str(ckpt_path))
    return ckpt_path


LOCAL_CROPS_ROOT = BASE_DIR / "dataset" / "crops"
GLOBAL_CROPS_ROOT = WORK_ROOT / "datasets" / "ocr" / "crops"
CROPS_ROOT = LOCAL_CROPS_ROOT  # Luôn ưu tiên lưu tập trung vào vietocr_plate/dataset/crops/


def export_cropped_plates(limit_per_split=None):
    """Cắt tự động các biển số từ tập dataset YOLO, nắn thẳng và lưu tập trung vào vietocr_plate/dataset/crops/"""
    print(f"\n[BƯỚC CROP & NẮN THẲNG] Đang cắt (Crop) và làm phẳng ảnh biển số...")
    print(f"👉 Thư mục đích: {LOCAL_CROPS_ROOT}")
    ensure_dir(LOCAL_CROPS_ROOT)
    ensure_dir(GLOBAL_CROPS_ROOT)

    from utils.image_utils import imread_unicode, imwrite_unicode, preprocess_for_ocr
    from plate_detector_deskew import deskew_and_rectify

    total_cropped = 0
    for split, (image_dir, label_dir) in SPLITS.items():
        if not image_dir.exists() or not label_dir.exists():
            continue

        split_crop_dir = LOCAL_CROPS_ROOT / split
        ensure_dir(split_crop_dir)
        global_split_dir = GLOBAL_CROPS_ROOT / split
        ensure_dir(global_split_dir)

        images = find_images(image_dir)
        if limit_per_split:
            images = images[:limit_per_split]

        for img_path in images:
            label_path = label_dir / f"{img_path.stem}.txt"
            if not label_path.exists():
                continue

            try:
                img_bgr = imread_unicode(img_path)
                H, W = img_bgr.shape[:2]
            except Exception:
                continue

            with label_path.open("r", encoding="utf-8") as f:
                idx = 0
                for line in f:
                    parts = line.strip().split()
                    if len(parts) != 5 or int(float(parts[0])) != CLASS_ID:
                        continue

                    _, xc, yc, bw, bh = map(float, parts)
                    x1 = max(0, int((xc - bw / 2) * W))
                    y1 = max(0, int((yc - bh / 2) * H))
                    x2 = min(W, int((xc + bw / 2) * W))
                    y2 = min(H, int((yc + bh / 2) * H))

                    # Margin 4%
                    pad_x = int((x2 - x1) * 0.04)
                    pad_y = int((y2 - y1) * 0.04)
                    mx1 = max(0, x1 - pad_x)
                    my1 = max(0, y1 - pad_y)
                    mx2 = min(W, x2 + pad_x)
                    my2 = min(H, y2 + pad_y)

                    crop_bgr = img_bgr[my1:my2, mx1:mx2]
                    if crop_bgr.size == 0:
                        continue

                    rectified, _ = deskew_and_rectify(crop_bgr)
                    crop_filename = f"{img_path.stem}_{idx:02d}.jpg"
                    save_path = split_crop_dir / crop_filename
                    imwrite_unicode(save_path, rectified)
                    if global_split_dir.exists():
                        imwrite_unicode(global_split_dir / crop_filename, rectified)
                    idx += 1
                    total_cropped += 1

    print(f"  ✅ Đã lưu xong {total_cropped:,} ảnh biển số crop vào: {LOCAL_CROPS_ROOT}")


def main():
    print("=" * 80)
    print("MODULE HUẤN LUYỆN YOLOX PHÁT HIỆN BIỂN SỐ XE (DETECTION TRAINING)")
    print("=" * 80)

    if not DATASET_ROOT.exists():
        raise FileNotFoundError(f"Không tìm thấy dataset tại: {DATASET_ROOT}")

    print(f"[INFO] Nguồn dữ liệu ảnh xe: {DATASET_ROOT}")
    print(f"[INFO] Nơi lưu ảnh crop biển số cho VietOCR: {CROPS_ROOT}")

    # Chuyển đổi nhãn sang COCO
    convert_yolo_to_coco()
    create_experiment_config()
    pretrained_weights = download_pretrained_yolox()

    # Kiểm tra cờ dòng lệnh nếu muốn tự động crop ảnh
    import sys
    if "--crop" in sys.argv or "--export-crops" in sys.argv:
        export_cropped_plates()

    # Nếu có tham số --train: Tự động chạy huấn luyện YOLOX và xuất trọng số về vietocr_plate/models/
    if "--train" in sys.argv:
        print("\n" + "=" * 80)
        print("BẮT ĐẦU HUẤN LUYỆN YOLOX-S PHÁT HIỆN BIỂN SỐ...")
        print("=" * 80)
        env = os.environ.copy()
        sep = ";" if sys.platform == "win32" else ":"
        env["PYTHONPATH"] = f"{str(YOLOX_DIR)}{sep}{str(PROJECT_ROOT)}{sep}{env.get('PYTHONPATH', '')}"

        cmd = [
            sys.executable,
            str(YOLOX_DIR / "tools" / "train.py"),
            "-f", str(EXP_FILE),
            "-b", str(BATCH_SIZE),
            "-c", str(pretrained_weights),
        ]
        ret = subprocess.run(cmd, env=env, cwd=str(YOLOX_DIR))
        if ret.returncode == 0:
            # Tìm file best_ckpt.pth hoặc latest_ckpt.pth vừa train xong
            candidates = list(PROJECT_ROOT.glob("**/best_ckpt.pth"))
            if not candidates:
                candidates = list(PROJECT_ROOT.glob("**/latest_ckpt.pth"))
            if candidates:
                best_ckpt = max(candidates, key=lambda p: p.stat().st_mtime)
                dest_weights = BASE_DIR / "models" / "license_plate.pth"
                dest_weights.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(best_ckpt, dest_weights)
                ensure_dir(MODEL_ROOT)
                shutil.copy2(best_ckpt, MODEL_ROOT / "license_plate.pth")
                print("\n" + "=" * 80)
                print(f"🎉 [THÀNH CÔNG] Đã xuất mô hình YOLOX mới nhất về:")
                print(f"  👉 {dest_weights}")
                print("=" * 80)
        return

    print("\n" + "=" * 80)
    print("Dữ liệu và cấu hình YOLOX đã sẵn sàng!")
    print(f"1. Toàn bộ ảnh crop biển số đang được lưu tại:")
    print(f"   👉 {CROPS_ROOT}")
    print(f"2. Để chạy huấn luyện YOLOX tự động và tự nạp vào App, bạn thực thi:")
    print(f"   py train_yolox_detector.py --train")
    print(f"   (hoặc chạy lệnh thủ công: py YOLOX/tools/train.py -f {EXP_FILE} -b {BATCH_SIZE} -c {pretrained_weights})")
    print("=" * 80)


if __name__ == "__main__":
    main()

