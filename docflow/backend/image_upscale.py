"""Image/PDF upscaling via free-tier DeepAI API."""
from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from pathlib import Path

import httpx
from PIL import Image

logger = logging.getLogger(__name__)

try:
    import fitz  # PyMuPDF
except Exception:  # pragma: no cover - optional dependency
    fitz = None  # type: ignore[assignment]


class UpscaleError(RuntimeError):
    """Raised when upscale operation fails."""


DEEPAI_UPSCALE_URL = "https://api.deepai.org/api/torch-srgan"
UPSCALE_TIMEOUT_SECONDS = float(os.environ.get("UPSCALE_TIMEOUT_SECONDS", 90))
UPSCALE_MAX_PDF_PAGES = int(os.environ.get("UPSCALE_MAX_PDF_PAGES", 6))
UPSCALE_PDF_DPI = int(os.environ.get("UPSCALE_PDF_DPI", 200))


def _deepai_key() -> str:
    return os.environ.get("DEEPAI_API_KEY", "").strip()


def _upscale_enabled() -> bool:
    return os.environ.get("UPSCALE_ENABLED", "1").strip().lower() not in ("0", "false", "no")


async def maybe_upscale_file(src_path: Path, file_type: str, doc_id: str) -> Path | None:
    """Create an upscaled temp file for image/pdf, or return None."""
    if not _upscale_enabled():
        return None
    if not _deepai_key():
        logger.info("Upscale skipped for %s: DEEPAI_API_KEY is not configured", doc_id)
        return None

    ft = (file_type or "").lower().lstrip(".")
    if ft in ("jpg", "jpeg", "png"):
        return await upscale_image_file(src_path, doc_id=doc_id)
    if ft == "pdf":
        return await upscale_pdf_file(src_path, doc_id=doc_id)
    return None


async def upscale_image_file(src_path: Path, *, doc_id: str) -> Path:
    return await asyncio.to_thread(_upscale_image_sync, src_path, doc_id)


def _upscale_image_sync(src_path: Path, doc_id: str) -> Path:
    key = _deepai_key()
    suffix = src_path.suffix.lower() or ".png"
    with tempfile.NamedTemporaryFile(prefix=f"{doc_id}_upscaled_", suffix=suffix, delete=False) as tmp:
        tmp_path = Path(tmp.name)

    with src_path.open("rb") as fh:
        files = {"image": (src_path.name, fh, "application/octet-stream")}
        headers = {"api-key": key}
        with httpx.Client(timeout=UPSCALE_TIMEOUT_SECONDS, follow_redirects=True) as client:
            resp = client.post(DEEPAI_UPSCALE_URL, headers=headers, files=files)
            resp.raise_for_status()
            payload = resp.json()
            output_url = payload.get("output_url")
            if not output_url:
                raise UpscaleError(f"DeepAI response missing output_url: {payload}")
            out = client.get(output_url)
            out.raise_for_status()
            tmp_path.write_bytes(out.content)

    logger.info("Upscaled image for %s saved to %s", doc_id, tmp_path)
    return tmp_path


async def upscale_pdf_file(src_path: Path, *, doc_id: str) -> Path:
    if fitz is None:
        raise UpscaleError("PyMuPDF is not installed. Add dependency `pymupdf`.")
    return await asyncio.to_thread(_upscale_pdf_sync, src_path, doc_id)


def _upscale_pdf_sync(src_path: Path, doc_id: str) -> Path:
    doc = fitz.open(src_path)
    dpi_scale = UPSCALE_PDF_DPI / 72.0
    matrix = fitz.Matrix(dpi_scale, dpi_scale)
    rendered_pages: list[Path] = []
    try:
        page_count = min(len(doc), UPSCALE_MAX_PDF_PAGES)
        for idx in range(page_count):
            page = doc[idx]
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            with tempfile.NamedTemporaryFile(
                prefix=f"{doc_id}_page_{idx + 1}_",
                suffix=".png",
                delete=False,
            ) as tmp_page:
                page_path = Path(tmp_page.name)
            pix.save(str(page_path))
            rendered_pages.append(page_path)
    finally:
        doc.close()

    upscaled_pages: list[Path] = []
    try:
        for page_path in rendered_pages:
            upscaled_pages.append(_upscale_image_sync(page_path, doc_id))

        images: list[Image.Image] = []
        for p in upscaled_pages:
            img = Image.open(p)
            if img.mode != "RGB":
                img = img.convert("RGB")
            images.append(img)

        if not images:
            raise UpscaleError("No PDF pages were rendered for upscaling")

        with tempfile.NamedTemporaryFile(
            prefix=f"{doc_id}_upscaled_",
            suffix=".pdf",
            delete=False,
        ) as tmp_pdf:
            out_pdf = Path(tmp_pdf.name)

        first, rest = images[0], images[1:]
        first.save(out_pdf, save_all=True, append_images=rest, format="PDF")
        logger.info("Upscaled PDF for %s saved to %s", doc_id, out_pdf)
        return out_pdf
    finally:
        for p in rendered_pages + upscaled_pages:
            try:
                p.unlink(missing_ok=True)
            except OSError:
                pass
