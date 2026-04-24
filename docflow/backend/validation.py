"""Deterministic post-LLM validation of document fields."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from models import DocumentData, DocumentItem

_RU_MONTHS = {
    "января": 1, "февраля": 2, "марта": 3, "апреля": 4,
    "мая": 5, "июня": 6, "июля": 7, "августа": 8,
    "сентября": 9, "октября": 10, "ноября": 11, "декабря": 12,
    "янв": 1, "фев": 2, "мар": 3, "апр": 4, "май": 5, "июн": 6,
    "июл": 7, "авг": 8, "сен": 9, "окт": 10, "ноя": 11, "дек": 12,
}

_DATE_FORMATS = ("%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y", "%d.%m.%y", "%d-%m-%Y")

_CURRENCY_TOKENS = ("₽", "руб.", "руб", "RUB", "$", "€", "USD", "EUR")


def validate_inn(value: Any) -> str:
    """Digits only, length 10 or 12. Otherwise empty string."""
    if value is None:
        return ""
    s = re.sub(r"\D", "", str(value))
    if len(s) in (10, 12):
        return s
    return ""


def validate_date(value: Any) -> str:
    """Normalise date to DD.MM.YYYY. Empty string on failure."""
    if value is None:
        return ""
    s = str(value).strip()
    if not s:
        return ""

    for fmt in _DATE_FORMATS:
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime("%d.%m.%Y")
        except ValueError:
            continue

    # Russian textual month: "15 января 2024"
    m = re.match(r"^(\d{1,2})\s+([А-Яа-я]+)\s+(\d{2,4})$", s)
    if m:
        day = int(m.group(1))
        month = _RU_MONTHS.get(m.group(2).lower())
        year = int(m.group(3))
        if year < 100:
            year += 2000
        if month:
            try:
                return datetime(year, month, day).strftime("%d.%m.%Y")
            except ValueError:
                return ""
    return ""


def validate_amount(value: Any) -> str:
    """Clean, coerce to positive float, return string with 2 decimals."""
    if value is None or value == "":
        return ""
    s = str(value).strip()
    if not s:
        return ""

    for tok in _CURRENCY_TOKENS:
        s = s.replace(tok, "")
    s = s.replace("\xa0", "").replace(" ", "")
    # Handle thousands separator like "1.234,56" or "1,234.56"
    if "," in s and "." in s:
        # Assume comma is thousands separator if dot present after comma
        if s.rfind(",") < s.rfind("."):
            s = s.replace(",", "")
        else:
            s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", ".")
    try:
        num = float(s)
    except ValueError:
        return ""
    if num <= 0:
        return ""
    return f"{num:.2f}"


def validate_quantity(value: Any) -> str:
    """Like amount but allows zero-friendly clean integers/floats >= 0."""
    if value is None or value == "":
        return ""
    s = str(value).strip().replace("\xa0", "").replace(" ", "").replace(",", ".")
    try:
        num = float(s)
    except ValueError:
        return ""
    if num < 0:
        return ""
    # preserve integer form when appropriate
    if num == int(num):
        return str(int(num))
    return f"{num:.3f}".rstrip("0").rstrip(".")


def validate_string(value: Any) -> str:
    if value is None:
        return ""
    s = str(value).strip()
    if s.lower() in ("null", "none", "n/a", "не указано", "undefined"):
        return ""
    return s


def validate_item(raw: dict) -> DocumentItem:
    return DocumentItem(
        name=validate_string(raw.get("name", "")),
        quantity=validate_quantity(raw.get("quantity", "")),
        unit=validate_string(raw.get("unit", "")),
        unit_price=validate_amount(raw.get("unit_price", "")),
        total_price=validate_amount(raw.get("total_price", "")),
    )


def validate_document(data: dict) -> tuple[DocumentData, list[str]]:
    """Apply all validators; return (validated_data, errors_list)."""
    errors: list[str] = []

    document_type = validate_string(data.get("document_type", ""))
    document_number = validate_string(data.get("document_number", ""))

    raw_date = data.get("document_date", "")
    document_date = validate_date(raw_date)
    if raw_date and not document_date:
        errors.append("document_date: не удалось распознать дату")

    supplier_name = validate_string(data.get("supplier_name", ""))
    raw_supplier_inn = data.get("supplier_inn", "")
    supplier_inn = validate_inn(raw_supplier_inn)
    if raw_supplier_inn and not supplier_inn:
        errors.append("supplier_inn: неверный формат ИНН (ожидается 10 или 12 цифр)")

    buyer_name = validate_string(data.get("buyer_name", ""))
    raw_buyer_inn = data.get("buyer_inn", "")
    buyer_inn = validate_inn(raw_buyer_inn)
    if raw_buyer_inn and not buyer_inn:
        errors.append("buyer_inn: неверный формат ИНН (ожидается 10 или 12 цифр)")

    raw_total = data.get("total_amount", "")
    total_amount = validate_amount(raw_total)
    if raw_total and not total_amount:
        errors.append("total_amount: не удалось распознать сумму")

    raw_vat = data.get("vat_amount", "")
    vat_amount = validate_amount(raw_vat)
    if raw_vat and not vat_amount:
        errors.append("vat_amount: не удалось распознать сумму НДС")

    currency = validate_string(data.get("currency", "")) or "RUB"

    raw_items = data.get("items") or []
    items: list[DocumentItem] = []
    if isinstance(raw_items, list):
        for raw in raw_items:
            if isinstance(raw, dict):
                items.append(validate_item(raw))

    validated = DocumentData(
        document_type=document_type,
        document_number=document_number,
        document_date=document_date,
        supplier_name=supplier_name,
        supplier_inn=supplier_inn,
        buyer_name=buyer_name,
        buyer_inn=buyer_inn,
        total_amount=total_amount,
        vat_amount=vat_amount,
        currency=currency,
        items=items,
    )
    return validated, errors
