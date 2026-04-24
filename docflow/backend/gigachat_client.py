"""Thin wrapper around the official GigaChat SDK."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any, Optional

logger = logging.getLogger(__name__)


class GigaChatError(RuntimeError):
    """Raised when GigaChat cannot produce a usable result.

    The background task catches this and puts the document into ``error``
    status with a human-readable message instead of leaving the user with
    an empty form and no explanation.
    """


SYSTEM_PROMPT = """Ты — система OCR для бухгалтерских документов.
Извлеки данные и верни ТОЛЬКО валидный JSON без markdown, пояснений и кода.
Структура ответа строго по схеме DocumentExtracted.
Если поле не найдено — верни пустую строку "".
Никогда не возвращай null, undefined, N/A.

Ожидаемая JSON-схема:
{
  "document_type": "счёт-фактура|накладная|акт|счёт|иное",
  "document_number": "",
  "document_date": "ДД.ММ.ГГГГ",
  "supplier_name": "",
  "supplier_inn": "10 или 12 цифр",
  "buyer_name": "",
  "buyer_inn": "10 или 12 цифр",
  "total_amount": "число с точкой",
  "vat_amount": "число с точкой",
  "currency": "RUB",
  "items": [
    {"name": "", "quantity": "", "unit": "", "unit_price": "", "total_price": ""}
  ]
}"""


USER_PROMPT = """Извлеки из документа:
- document_type (счёт-фактура|накладная|акт|счёт|иное)
- document_number
- document_date (ДД.ММ.ГГГГ)
- supplier_name, supplier_inn (10 или 12 цифр)
- buyer_name, buyer_inn (10 или 12 цифр)
- total_amount (число с точкой), vat_amount, currency (RUB)
- items: [{name, quantity, unit, unit_price, total_price}]

Верни строго JSON по схеме выше, без markdown и комментариев.
Если какое-то поле не можешь распознать — оставь пустую строку "", но
остальные поля всё равно заполни."""


def _empty_document() -> dict:
    return {
        "document_type": "",
        "document_number": "",
        "document_date": "",
        "supplier_name": "",
        "supplier_inn": "",
        "buyer_name": "",
        "buyer_inn": "",
        "total_amount": "",
        "vat_amount": "",
        "currency": "RUB",
        "items": [],
    }


def _strip_markdown_json(text: str) -> str:
    if not text:
        return ""
    cleaned = re.sub(r"```json\s*|\s*```", "", text, flags=re.IGNORECASE)
    return cleaned.strip()


def _extract_json_object(text: str) -> Optional[dict]:
    """Accept raw LLM output that may wrap JSON in prose."""
    if not text:
        return None
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except (ValueError, TypeError):
            return None
    return None


class GigaChatClient:
    """Wrapper around the GigaChat SDK.

    Loading is lazy so the backend can boot even when ``gigachat`` isn't
    installed (e.g. frontend-only dev). ``process_document`` raises
    :class:`GigaChatError` for operational failures so the caller can
    surface them to the user.
    """

    def __init__(self) -> None:
        self.credentials = os.environ.get("GIGACHAT_CREDENTIALS", "").strip()
        self.scope = os.environ.get("GIGACHAT_SCOPE", "GIGACHAT_API_PERS").strip()
        self._model_pdf = os.environ.get("GIGACHAT_MODEL_PDF", "GigaChat-Pro")
        self._model_image = os.environ.get("GIGACHAT_MODEL_IMAGE", "GigaChat-Pro")
        self._sdk_ok = True
        self._sdk_import_error: Optional[str] = None
        try:
            from gigachat import GigaChat  # noqa: F401
        except Exception as exc:  # pragma: no cover - import guard
            logger.warning("GigaChat SDK is not available: %s", exc)
            self._sdk_ok = False
            self._sdk_import_error = str(exc)

    @property
    def enabled(self) -> bool:
        return bool(self.credentials) and self._sdk_ok

    def status_message(self) -> str:
        if not self._sdk_ok:
            return f"GigaChat SDK не установлен: {self._sdk_import_error or 'pip install gigachat'}"
        if not self.credentials:
            return (
                "Не задан GIGACHAT_CREDENTIALS в .env — документ не может быть распознан. "
                "Укажите base64-credentials и перезапустите backend."
            )
        return "GigaChat готов"

    async def process_document(self, file_path: str, file_type: str) -> dict:
        """Run OCR via GigaChat. Raise GigaChatError on any failure."""
        if not self.enabled:
            raise GigaChatError(self.status_message())

        try:
            return await asyncio.to_thread(self._process_sync, file_path, file_type)
        except GigaChatError:
            raise
        except Exception as exc:
            logger.exception("GigaChat processing failed: %s", exc)
            raise GigaChatError(f"Сбой GigaChat API: {exc}") from exc

    def _process_sync(self, file_path: str, file_type: str) -> dict:
        from gigachat import GigaChat

        try:
            from gigachat.models import Chat, Messages, MessagesRole
        except Exception:
            Chat = Messages = MessagesRole = None  # type: ignore[assignment]

        ft = (file_type or "").lower().lstrip(".")
        is_image = ft in ("jpg", "jpeg", "png")

        with GigaChat(
            credentials=self.credentials,
            scope=self.scope,
            verify_ssl_certs=False,
            model=self._model_image if is_image else self._model_pdf,
        ) as client:
            # 1. Upload file
            with open(file_path, "rb") as fh:
                try:
                    uploaded = client.upload_file(fh, purpose="general")
                except TypeError:
                    # Older SDK signature: upload_file(file=...)
                    fh.seek(0)
                    uploaded = client.upload_file(file=fh)

            file_id = (
                getattr(uploaded, "id_", None)
                or getattr(uploaded, "id", None)
            )
            if not file_id and hasattr(uploaded, "model_dump"):
                file_id = uploaded.model_dump().get("id") or uploaded.model_dump().get("id_")
            if not file_id and hasattr(uploaded, "dict"):
                file_id = uploaded.dict().get("id") or uploaded.dict().get("id_")
            if not file_id:
                raise GigaChatError(
                    f"GigaChat upload_file вернул ответ без id: {uploaded!r}"
                )

            logger.info("GigaChat file uploaded: id=%s type=%s", file_id, ft)

            # 2. Build chat payload
            model = self._model_image if is_image else self._model_pdf

            if Chat is not None and Messages is not None:
                try:
                    system_role = MessagesRole.SYSTEM  # type: ignore[union-attr]
                    user_role = MessagesRole.USER      # type: ignore[union-attr]
                except Exception:
                    system_role, user_role = "system", "user"

                messages = [
                    Messages(role=system_role, content=SYSTEM_PROMPT),
                    Messages(
                        role=user_role,
                        content=USER_PROMPT,
                        attachments=[file_id],
                    ),
                ]
                chat_kwargs: dict[str, Any] = {
                    "model": model,
                    "messages": messages,
                    "temperature": 0.1,
                }
                # "function_call": "auto" — КРИТИЧНО для PDF: без него
                # модель читает только первый файл вложения.
                try:
                    chat_payload = Chat(**chat_kwargs, function_call="auto")
                except Exception:
                    chat_payload = Chat(**chat_kwargs)
                response = client.chat(chat_payload)
            else:
                # Fallback path: raw dict
                payload = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": USER_PROMPT,
                            "attachments": [file_id],
                        },
                    ],
                    "function_call": "auto",
                    "temperature": 0.1,
                }
                response = client.chat(payload)

        text = self._extract_text(response)
        if not text:
            raise GigaChatError(
                "GigaChat вернул пустой ответ. Возможно, документ не распознан "
                "или превышен лимит токенов."
            )
        logger.info("GigaChat raw response (%d chars): %s", len(text), text[:500])

        cleaned = _strip_markdown_json(text)
        parsed = _extract_json_object(cleaned)
        if not isinstance(parsed, dict):
            logger.warning("Cannot parse GigaChat output as JSON: %s", text[:400])
            raise GigaChatError(
                "GigaChat вернул не-JSON ответ. Попробуйте повторно загрузить документ."
            )
        return parsed

    @staticmethod
    def _extract_text(response: Any) -> str:
        try:
            choices = getattr(response, "choices", None)
            if choices is None and isinstance(response, dict):
                choices = response.get("choices")
            if not choices:
                return ""
            first = choices[0]
            message = getattr(first, "message", None)
            if message is None and isinstance(first, dict):
                message = first.get("message")
            if message is None:
                return ""
            content = getattr(message, "content", None)
            if content is None and isinstance(message, dict):
                content = message.get("content")
            if isinstance(content, list):
                parts: list[str] = []
                for c in content:
                    t = getattr(c, "text", None)
                    if t is None and isinstance(c, dict):
                        t = c.get("text")
                    if t:
                        parts.append(t)
                return "".join(parts)
            return content or ""
        except Exception:
            logger.exception("Failed to extract text from GigaChat response")
            return ""
