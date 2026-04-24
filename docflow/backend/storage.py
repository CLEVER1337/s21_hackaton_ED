"""Persistence layer: SQLite (via aiosqlite) + filesystem for originals and JSON results."""
from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

import aiosqlite

from models import DocumentData, DocumentRecord, DocumentStatus

DATA_DIR = Path(os.environ.get("DATA_DIR", "./data")).resolve()
UPLOADS_DIR = DATA_DIR / "uploads"
RESULTS_DIR = DATA_DIR / "results"
DB_PATH = DATA_DIR / "docflow.db"

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)


_SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    doc_id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_type TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    data TEXT,
    validation_errors TEXT NOT NULL DEFAULT '[]',
    error_message TEXT NOT NULL DEFAULT ''
);
"""


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(_SCHEMA)
        await db.commit()


def _row_to_record(row: aiosqlite.Row) -> DocumentRecord:
    data_raw = row["data"]
    data_obj = None
    if data_raw:
        try:
            data_obj = DocumentData(**json.loads(data_raw))
        except Exception:
            data_obj = None
    errors_raw = row["validation_errors"] or "[]"
    try:
        errors = json.loads(errors_raw)
    except Exception:
        errors = []
    return DocumentRecord(
        doc_id=row["doc_id"],
        filename=row["filename"],
        file_size=row["file_size"],
        file_type=row["file_type"],
        status=row["status"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
        data=data_obj,
        validation_errors=errors,
        error_message=row["error_message"] or "",
    )


async def create_document(record: DocumentRecord) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO documents
               (doc_id, filename, file_size, file_type, status, created_at, updated_at,
                data, validation_errors, error_message)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                record.doc_id,
                record.filename,
                record.file_size,
                record.file_type,
                record.status,
                record.created_at.isoformat(),
                record.updated_at.isoformat(),
                json.dumps(record.data.model_dump(), ensure_ascii=False) if record.data else None,
                json.dumps(record.validation_errors, ensure_ascii=False),
                record.error_message or "",
            ),
        )
        await db.commit()
    _write_result_file(record)


async def get_document(doc_id: str) -> Optional[DocumentRecord]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM documents WHERE doc_id = ?", (doc_id,)
        ) as cur:
            row = await cur.fetchone()
            return _row_to_record(row) if row else None


async def list_documents() -> list[DocumentRecord]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM documents ORDER BY created_at DESC"
        ) as cur:
            rows = await cur.fetchall()
            return [_row_to_record(r) for r in rows]


async def update_document(
    doc_id: str,
    *,
    status: Optional[DocumentStatus] = None,
    data: Optional[DocumentData] = None,
    validation_errors: Optional[list[str]] = None,
    error_message: Optional[str] = None,
) -> Optional[DocumentRecord]:
    current = await get_document(doc_id)
    if not current:
        return None

    if status is not None:
        current.status = status
    if data is not None:
        current.data = data
    if validation_errors is not None:
        current.validation_errors = validation_errors
    if error_message is not None:
        current.error_message = error_message
    current.updated_at = datetime.utcnow()

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """UPDATE documents
               SET status = ?, data = ?, validation_errors = ?,
                   error_message = ?, updated_at = ?
               WHERE doc_id = ?""",
            (
                current.status,
                json.dumps(current.data.model_dump(), ensure_ascii=False) if current.data else None,
                json.dumps(current.validation_errors, ensure_ascii=False),
                current.error_message or "",
                current.updated_at.isoformat(),
                doc_id,
            ),
        )
        await db.commit()
    _write_result_file(current)
    return current


async def delete_document(doc_id: str) -> bool:
    record = await get_document(doc_id)
    if not record:
        return False
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM documents WHERE doc_id = ?", (doc_id,))
        await db.commit()

    upload_path = find_upload_path(doc_id)
    if upload_path and upload_path.exists():
        try:
            upload_path.unlink()
        except OSError:
            pass
    result_path = RESULTS_DIR / f"{doc_id}.json"
    if result_path.exists():
        try:
            result_path.unlink()
        except OSError:
            pass
    return True


def upload_path_for(doc_id: str, filename: str) -> Path:
    safe = filename.replace("/", "_").replace("\\", "_")
    return UPLOADS_DIR / f"{doc_id}_{safe}"


def find_upload_path(doc_id: str) -> Optional[Path]:
    prefix = f"{doc_id}_"
    for p in UPLOADS_DIR.iterdir():
        if p.name.startswith(prefix):
            return p
    return None


def _write_result_file(record: DocumentRecord) -> None:
    path = RESULTS_DIR / f"{record.doc_id}.json"
    try:
        payload = record.model_dump(mode="json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except OSError:
        pass
