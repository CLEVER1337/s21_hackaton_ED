"""Image/PDF compression before sending documents to GigaChat."""
from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from pathlib import Path

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

try:
    import fitz  # PyMuPDF
except Exception:  # pragma: no cover - optional dependency
    fitz = None  # type: ignore[assignment]


COMPRESS_THRESHOLD_BYTES = int(os.environ.get("COMPRESS_THRESHOLD_BYTES", 1572864))
COMPRESS_IMAGE_MAX_DIMENSION = int(os.environ.get("COMPRESS_IMAGE_MAX_DIMENSION", 2200))
COMPRESS_IMAGE_QUALITY = int(os.environ.get("COMPRESS_IMAGE_QUALITY", 72))
COMPRESS_PDF_DPI = int(os.environ.get("COMPRESS_PDF_DPI", 130))
COMPRESS_PDF_JPEG_QUALITY = int(os.environ.get("COMPRESS_PDF_JPEG_QUALITY", 68))


async def maybe_compress_file_for_gigachat(src_path: Path, file_type: str, doc_id: str) -> Path | None:
    """Create a compressed temp file for large image/pdf before GigaChat."""
    if not src_path.exists():
        return None
    src_size = src_path.stat().st_size
    if src_size <= COMPRESS_THRESHOLD_BYTES:
        return None

    ft = (file_type or "").lower().lstrip(".")
    if ft in ("jpg", "jpeg", "png"):
        compressed = await asyncio.to_thread(_compress_image_sync, src_path, doc_id, ft)
    elif ft == "pdf":
        compressed = await asyncio.to_thread(_compress_pdf_sync, src_path, doc_id)
    else:
        return None

    if not compressed or not compressed.exists():
        return None

    compressed_size = compressed.stat().st_size
    logger.info(
        "Compressed %s for %s: %.2fMB -> %.2fMB",
        ft,
        doc_id,
        src_size / (1024 * 1024),
        compressed_size / (1024 * 1024),
    )
    return compressed


def _compress_image_sync(src_path: Path, doc_id: str, file_type: str) -> Path | None:
    suffix = ".jpg" if file_type in ("jpg", "jpeg") else ".png"
    with tempfile.NamedTemporaryFile(prefix=f"{doc_id}_compressed_", suffix=suffix, delete=False) as tmp:
        tmp_path = Path(tmp.name)

    try:
        with Image.open(src_path) as img_raw:
            img = ImageOps.exif_transpose(img_raw)
            max_side = max(img.width, img.height)
            if max_side > COMPRESS_IMAGE_MAX_DIMENSION:
                ratio = COMPRESS_IMAGE_MAX_DIMENSION / float(max_side)
                new_size = (
                    max(1, int(img.width * ratio)),
                    max(1, int(img.height * ratio)),
                )
                img = img.resize(new_size, Image.Resampling.LANCZOS)

            save_kwargs: dict[str, int | bool] = {"optimize": True}
            if file_type in ("jpg", "jpeg"):
                if img.mode not in ("RGB", "L"):
                    img = img.convert("RGB")
                save_kwargs["quality"] = COMPRESS_IMAGE_QUALITY
                save_kwargs["progressive"] = True
            else:
                if img.mode == "RGBA":
                    img = img.convert("P", palette=Image.Palette.ADAPTIVE, colors=256)
                save_kwargs["compress_level"] = 9

            img.save(tmp_path, **save_kwargs)

        if tmp_path.stat().st_size >= src_path.stat().st_size:
            tmp_path.unlink(missing_ok=True)
            return None
        return tmp_path
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


def _compress_pdf_sync(src_path: Path, doc_id: str) -> Path | None:
    if fitz is None:
        return None

    doc = fitz.open(src_path)
    dpi_scale = COMPRESS_PDF_DPI / 72.0
    matrix = fitz.Matrix(dpi_scale, dpi_scale)
    images: list[Image.Image] = []
    try:
        for idx in range(len(doc)):
            page = doc[idx]
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            images.append(img)
    finally:
        doc.close()

    if not images:
        return None

    with tempfile.NamedTemporaryFile(prefix=f"{doc_id}_compressed_", suffix=".pdf", delete=False) as tmp_pdf:
        out_pdf = Path(tmp_pdf.name)

    try:
        first, rest = images[0], images[1:]
        first.save(
            out_pdf,
            save_all=True,
            append_images=rest,
            format="PDF",
            optimize=True,
            resolution=COMPRESS_PDF_DPI,
            quality=COMPRESS_PDF_JPEG_QUALITY,
        )
        if out_pdf.stat().st_size >= src_path.stat().st_size:
            out_pdf.unlink(missing_ok=True)
            return None
        return out_pdf
    except Exception:
        out_pdf.unlink(missing_ok=True)
        raise
    finally:
        for img in images:
            try:
                img.close()
            except Exception:
                pass
