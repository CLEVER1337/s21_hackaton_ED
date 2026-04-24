"""DocFlow AI — FastAPI application."""
from __future__ import annotations

import asyncio
import logging
import mimetypes
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import aiofiles
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

import storage
from export import export as export_document_bytes
from file_compression import maybe_compress_file_for_gigachat
from gigachat_client import GigaChatClient, GigaChatError
from models import (
    DocumentData,
    DocumentRecord,
    DocumentUpdate,
    ExportFormat,
)
from validation import validate_document

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
logger = logging.getLogger("docflow")


MAX_PDF_SIZE = int(os.environ.get("MAX_PDF_SIZE", 41943040))
MAX_IMG_SIZE = int(os.environ.get("MAX_IMG_SIZE", 15728640))
MAX_BATCH_SIZE = int(os.environ.get("MAX_BATCH_SIZE", 83886080))
PROCESS_TIMEOUT_SECONDS = int(os.environ.get("PROCESS_TIMEOUT_SECONDS", 120))

ALLOWED_EXTS = {"pdf", "jpg", "jpeg", "png", "doc", "docx"}


gigachat_client = GigaChatClient()
_doc_locks: dict[str, asyncio.Lock] = {}


def _doc_lock(doc_id: str) -> asyncio.Lock:
    lock = _doc_locks.get(doc_id)
    if lock is None:
        lock = asyncio.Lock()
        _doc_locks[doc_id] = lock
    return lock


@asynccontextmanager
async def lifespan(app: FastAPI):
    await storage.init_db()
    logger.info("DocFlow backend ready. GigaChat enabled=%s", gigachat_client.enabled)
    yield


app = FastAPI(title="DocFlow AI", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info("%s %s", request.method, request.url.path)
    response = await call_next(request)
    logger.info("-> %s %s %s", request.method, request.url.path, response.status_code)
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    doc_id = request.path_params.get("doc_id", "")
    return JSONResponse(
        status_code=500,
        content={"error": str(exc) or "Internal Server Error", "doc_id": doc_id},
    )


def _detect_file_type(filename: str) -> str:
    ext = Path(filename).suffix.lower().lstrip(".")
    if ext == "jpeg":
        ext = "jpg"
    return ext


def _content_disposition(filename: str, *, inline: bool = False) -> str:
    """Build RFC 5987 Content-Disposition that safely carries non-ASCII names."""
    disp = "inline" if inline else "attachment"
    ascii_fallback = filename.encode("ascii", "ignore").decode("ascii").strip() or "document"
    quoted = quote(filename, safe="")
    return f'{disp}; filename="{ascii_fallback}"; filename*=UTF-8\'\'{quoted}'


def _check_limits(file_type: str, size: int) -> None:
    if file_type in ("pdf", "doc", "docx") and size > MAX_PDF_SIZE:
        raise HTTPException(413, detail=f"Документ превышает лимит {MAX_PDF_SIZE // 1024 // 1024}MB")
    if file_type in ("jpg", "png") and size > MAX_IMG_SIZE:
        raise HTTPException(413, detail=f"Изображение превышает лимит {MAX_IMG_SIZE // 1024 // 1024}MB")


MAX_AUTO_RETRIES = int(os.environ.get("MAX_AUTO_RETRIES", 3))


def _is_retryable(exc: BaseException) -> bool:
    """Treat 429 / timeout / connection errors as retryable."""
    if isinstance(exc, asyncio.TimeoutError):
        return True
    text = str(exc).lower()
    markers = (
        "429",
        "too many requests",
        "timeout",
        "timed out",
        "rate limit",
        "temporarily unavailable",
        "503",
        "502",
        "504",
        "connection reset",
        "connection aborted",
        "remote disconnected",
    )
    return any(m in text for m in markers)


def _compute_completeness(data: DocumentData) -> float:
    """Share of filled fields among the expected schema (0..1)."""
    main_fields = [
        data.document_type,
        data.document_number,
        data.document_date,
        data.supplier_name,
        data.supplier_inn,
        data.buyer_name,
        data.buyer_inn,
        data.total_amount,
        data.vat_amount,
        data.currency,
    ]
    filled = sum(1 for v in main_fields if str(v).strip())
    total = len(main_fields)

    if data.items:
        item_total = 0
        item_filled = 0
        for it in data.items:
            for v in (it.name, it.quantity, it.unit, it.unit_price, it.total_price):
                item_total += 1
                if str(v).strip():
                    item_filled += 1
        filled += item_filled
        total += item_total

    return round(filled / total, 4) if total else 0.0


async def _process_document_background(doc_id: str) -> None:
    lock = _doc_lock(doc_id)
    async with lock:
        record = await storage.get_document(doc_id)
        if not record:
            return
        upload_path = storage.find_upload_path(doc_id)
        if not upload_path:
            await storage.update_document(
                doc_id,
                status="error",
                error_message="Файл не найден на диске",
            )
            return

        # Reset state for a fresh (re)processing run
        await storage.update_document(
            doc_id,
            status="processing",
            error_message="",
            retry_count=0,
        )

        last_error: Optional[str] = None
        attempts = 1 + MAX_AUTO_RETRIES  # первая попытка + 3 авто-ретрая
        raw: Optional[dict] = None
        source_for_gigachat = upload_path
        tmp_compressed: Optional[Path] = None

        try:
            tmp_compressed = await maybe_compress_file_for_gigachat(
                upload_path, record.file_type, doc_id
            )
            if tmp_compressed:
                source_for_gigachat = tmp_compressed

            for attempt in range(1, attempts + 1):
                try:
                    async with asyncio.timeout(PROCESS_TIMEOUT_SECONDS):
                        raw = await gigachat_client.process_document(
                            str(source_for_gigachat), record.file_type
                        )
                    last_error = None
                    break
                except asyncio.TimeoutError as exc:
                    last_error = f"Таймаут (>{PROCESS_TIMEOUT_SECONDS} сек)"
                    logger.warning(
                        "Timeout %s attempt %d/%d", doc_id, attempt, attempts
                    )
                    if attempt == attempts:
                        break
                except GigaChatError as exc:
                    last_error = str(exc)
                    logger.warning(
                        "GigaChatError %s attempt %d/%d: %s",
                        doc_id, attempt, attempts, exc,
                    )
                    if not _is_retryable(exc) or attempt == attempts:
                        break
                except Exception as exc:  # pragma: no cover
                    last_error = f"Непредвиденная ошибка: {exc}"
                    logger.exception(
                        "Unexpected error %s attempt %d/%d", doc_id, attempt, attempts
                    )
                    if not _is_retryable(exc) or attempt == attempts:
                        break

                # backoff before next retry
                await storage.update_document(doc_id, retry_count=attempt)
                await asyncio.sleep(min(2 ** attempt, 10))

            if raw is None:
                await storage.update_document(
                    doc_id,
                    status="error",
                    error_message=(
                        f"Не удалось обработать документ после {attempts} попыток. "
                        f"Последняя ошибка: {last_error or 'неизвестно'}"
                    ),
                    retry_count=attempts,
                )
                return

            validated, errors = validate_document(raw or {})
            completeness = _compute_completeness(validated)

            logger.info(
                "Document %s parsed: number=%s supplier=%s total=%s items=%d errors=%d completeness=%.2f",
                doc_id,
                validated.document_number,
                validated.supplier_name,
                validated.total_amount,
                len(validated.items),
                len(errors),
                completeness,
            )
            await storage.update_document(
                doc_id,
                status="ready",
                data=validated,
                validation_errors=errors,
                error_message="",
                completeness=completeness,
            )
        finally:
            if tmp_compressed:
                try:
                    tmp_compressed.unlink(missing_ok=True)
                except OSError:
                    pass


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "gigachat_enabled": gigachat_client.enabled,
        "gigachat_status": gigachat_client.status_message(),
    }


@app.post("/api/upload")
async def upload_documents(files: list[UploadFile] = File(...)) -> dict:
    if not files:
        raise HTTPException(400, "Не переданы файлы")

    # pre-read sizes (UploadFile.size is available for multipart)
    sizes: list[int] = []
    payloads: list[tuple[UploadFile, bytes, str]] = []
    total_size = 0
    for upload in files:
        content = await upload.read()
        size = len(content)
        file_type = _detect_file_type(upload.filename or "")
        if file_type not in ALLOWED_EXTS:
            raise HTTPException(
                400,
                f"Неподдерживаемый формат: {upload.filename}. Разрешены PDF, DOC, DOCX, JPG, PNG",
            )
        _check_limits(file_type, size)
        sizes.append(size)
        total_size += size
        payloads.append((upload, content, file_type))

    if total_size > MAX_BATCH_SIZE:
        raise HTTPException(
            413, f"Суммарный размер пакета превышает {MAX_BATCH_SIZE // 1024 // 1024}MB"
        )

    created: list[DocumentRecord] = []
    now = datetime.utcnow()
    for upload, content, file_type in payloads:
        doc_id = uuid.uuid4().hex
        filename = upload.filename or f"document.{file_type}"
        path = storage.upload_path_for(doc_id, filename)
        try:
            async with aiofiles.open(path, "wb") as fh:
                await fh.write(content)
        except OSError as exc:
            logger.error("Failed to save upload %s: %s", filename, exc)
            raise HTTPException(500, "Не удалось сохранить файл") from exc

        record = DocumentRecord(
            doc_id=doc_id,
            filename=filename,
            file_size=len(content),
            file_type=file_type,
            status="processing",
            created_at=now,
            updated_at=now,
            data=DocumentData(),
            validation_errors=[],
            error_message="",
        )
        await storage.create_document(record)
        created.append(record)
        asyncio.create_task(_process_document_background(doc_id))

    return {"documents": [r.model_dump(mode="json") for r in created]}


@app.get("/api/documents")
async def list_documents() -> dict:
    records = await storage.list_documents()
    return {"documents": [r.model_dump(mode="json") for r in records]}


@app.get("/api/documents/{doc_id}")
async def get_document(doc_id: str) -> dict:
    record = await storage.get_document(doc_id)
    if not record:
        raise HTTPException(404, "Документ не найден")
    return record.model_dump(mode="json")


@app.patch("/api/documents/{doc_id}")
async def patch_document(doc_id: str, update: DocumentUpdate) -> dict:
    record = await storage.get_document(doc_id)
    if not record:
        raise HTTPException(404, "Документ не найден")
    if update.data is None:
        raise HTTPException(400, "Ожидается поле data")

    validated, errors = validate_document(update.data.model_dump())
    # completeness is a quality signal of the AI extraction, so we keep
    # the original value from the automatic run and don't recompute on edits.
    updated = await storage.update_document(
        doc_id,
        data=validated,
        validation_errors=errors,
        status="ready" if record.status != "approved" else "approved",
    )
    assert updated is not None
    return updated.model_dump(mode="json")


@app.post("/api/documents/{doc_id}/retry")
async def retry_document(doc_id: str) -> dict:
    record = await storage.get_document(doc_id)
    if not record:
        raise HTTPException(404, "Документ не найден")
    if record.status == "processing":
        raise HTTPException(409, "Документ уже обрабатывается")
    upload_path = storage.find_upload_path(doc_id)
    if not upload_path or not upload_path.exists():
        raise HTTPException(409, "Оригинальный файл отсутствует — повторная обработка невозможна")

    await storage.update_document(
        doc_id,
        status="processing",
        error_message="",
        retry_count=0,
    )
    asyncio.create_task(_process_document_background(doc_id))
    refreshed = await storage.get_document(doc_id)
    return refreshed.model_dump(mode="json") if refreshed else {"doc_id": doc_id}


@app.get("/api/stats")
async def stats() -> dict:
    records = await storage.list_documents()
    total = len(records)
    by_status: dict[str, int] = {}
    by_type: dict[str, int] = {}
    completeness_values: list[float] = []
    approved_count = 0
    error_count = 0
    retries_used = 0
    recent: list[dict] = []

    for r in records:
        by_status[r.status] = by_status.get(r.status, 0) + 1
        by_type[r.file_type] = by_type.get(r.file_type, 0) + 1
        retries_used += r.retry_count or 0
        if r.status == "approved":
            approved_count += 1
        if r.status == "error":
            error_count += 1
        if r.status in ("ready", "approved") and r.completeness:
            completeness_values.append(r.completeness)

    avg = (
        round(sum(completeness_values) / len(completeness_values), 4)
        if completeness_values
        else 0.0
    )

    # top/bottom by completeness
    ranked = sorted(
        [r for r in records if r.status in ("ready", "approved")],
        key=lambda r: r.completeness,
        reverse=True,
    )
    best = [
        {
            "doc_id": r.doc_id,
            "filename": r.filename,
            "completeness": r.completeness,
            "document_number": r.data.document_number if r.data else "",
        }
        for r in ranked[:5]
    ]
    worst = [
        {
            "doc_id": r.doc_id,
            "filename": r.filename,
            "completeness": r.completeness,
            "document_number": r.data.document_number if r.data else "",
        }
        for r in ranked[-5:][::-1]
    ]

    for r in records[:10]:
        recent.append(
            {
                "doc_id": r.doc_id,
                "filename": r.filename,
                "status": r.status,
                "completeness": r.completeness,
                "retry_count": r.retry_count,
                "updated_at": r.updated_at.isoformat(),
            }
        )

    return {
        "total": total,
        "approved": approved_count,
        "errors": error_count,
        "by_status": by_status,
        "by_type": by_type,
        "avg_completeness": avg,
        "retries_used": retries_used,
        "best": best,
        "worst": worst,
        "recent": recent,
    }


@app.post("/api/documents/{doc_id}/approve")
async def approve_document(doc_id: str) -> dict:
    record = await storage.get_document(doc_id)
    if not record:
        raise HTTPException(404, "Документ не найден")
    if record.status == "processing":
        raise HTTPException(409, "Документ ещё обрабатывается")
    if record.status == "error":
        raise HTTPException(409, "Невозможно утвердить документ с ошибкой")

    updated = await storage.update_document(doc_id, status="approved")
    assert updated is not None
    return updated.model_dump(mode="json")


@app.get("/api/documents/{doc_id}/export")
async def export_document(doc_id: str, format: ExportFormat = ExportFormat.json):
    record = await storage.get_document(doc_id)
    if not record:
        raise HTTPException(404, "Документ не найден")
    if not record.data:
        raise HTTPException(409, "Нет данных для экспорта")
    payload, media_type, filename = export_document_bytes(record, format)
    headers = {
        "Content-Disposition": _content_disposition(filename),
    }
    return Response(content=payload, media_type=media_type, headers=headers)


@app.get("/api/documents/{doc_id}/file")
async def get_original_file(doc_id: str) -> FileResponse:
    record = await storage.get_document(doc_id)
    if not record:
        raise HTTPException(404, "Документ не найден")
    path = storage.find_upload_path(doc_id)
    if not path or not path.exists():
        raise HTTPException(404, "Файл не найден")
    media_type, _ = mimetypes.guess_type(record.filename)
    if not media_type:
        media_type = "application/octet-stream"
    return FileResponse(
        path,
        media_type=media_type,
        headers={"Content-Disposition": _content_disposition(record.filename, inline=True)},
    )


@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str) -> dict:
    ok = await storage.delete_document(doc_id)
    if not ok:
        raise HTTPException(404, "Документ не найден")
    _doc_locks.pop(doc_id, None)
    return {"deleted": doc_id}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", 8000)),
        reload=False,
    )
