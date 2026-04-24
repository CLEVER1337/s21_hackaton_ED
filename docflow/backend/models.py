"""Pydantic schemas for DocFlow AI."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


class DocumentItem(BaseModel):
    name: str = ""
    quantity: str = ""
    unit: str = ""
    unit_price: str = ""
    total_price: str = ""


class DocumentData(BaseModel):
    document_type: str = ""
    document_number: str = ""
    document_date: str = ""
    supplier_name: str = ""
    supplier_inn: str = ""
    buyer_name: str = ""
    buyer_inn: str = ""
    total_amount: str = ""
    vat_amount: str = ""
    currency: str = "RUB"
    items: list[DocumentItem] = Field(default_factory=list)


DocumentStatus = Literal["processing", "ready", "approved", "error"]


class DocumentRecord(BaseModel):
    doc_id: str
    filename: str
    file_size: int
    file_type: str  # pdf | jpg | png | doc | docx
    status: DocumentStatus
    created_at: datetime
    updated_at: datetime
    data: Optional[DocumentData] = None
    validation_errors: list[str] = Field(default_factory=list)
    error_message: str = ""
    retry_count: int = 0
    completeness: float = 0.0  # 0..1 — доля заполненных полей после распознавания


class DocumentUpdate(BaseModel):
    data: Optional[DocumentData] = None


class ExportFormat(str, Enum):
    json = "json"
    csv = "csv"
    xlsx = "xlsx"
    xml = "xml"
