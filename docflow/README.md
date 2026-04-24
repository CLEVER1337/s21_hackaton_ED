# DocFlow AI

Прототип веб-приложения для автоматического распознавания и верификации бухгалтерских документов. Документы распознаются через **GigaChat API**, результат валидируется детерминированными правилами (ИНН, дата, суммы) и отдаётся бухгалтеру на проверку в split-view интерфейсе с последующим экспортом в JSON / CSV / XLSX / XML.

## Стек

- **Backend:** FastAPI, aiosqlite, aiofiles, pandas, openpyxl, dicttoxml, GigaChat SDK
- **Frontend:** React 18 + Vite, React Router, Zustand, axios, Tailwind CSS
- **Хранение:** SQLite + локальная ФС (`./data/uploads`, `./data/results`)
- **Дизайн:** цветовая гамма сайта kzn.ru (тёмно-зелёный, красный акцент, кремовый фон)

## Быстрый старт

### 1. Клонировать и настроить
```bash
cd docflow
cp .env.example .env
# укажите GIGACHAT_CREDENTIALS в .env
mkdir -p data/uploads data/results
```

### 2. Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# Swagger UI: http://localhost:8000/docs
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env           # опционально
npm install
npm run dev
# App: http://localhost:5173
```

### 4. Проверка
```bash
curl http://localhost:8000/health
curl -X POST http://localhost:8000/api/upload -F "files=@test_invoice.pdf"
curl http://localhost:8000/api/documents
```

## REST API

| Метод  | Путь                                   | Описание                                    |
|--------|----------------------------------------|---------------------------------------------|
| POST   | `/api/upload`                          | загрузка файлов (multipart/form-data)       |
| GET    | `/api/documents`                       | список всех документов со статусами         |
| GET    | `/api/documents/{id}`                  | данные одного документа                    |
| PATCH  | `/api/documents/{id}`                  | обновление полей пользователем              |
| POST   | `/api/documents/{id}/approve`          | утверждение документа                       |
| GET    | `/api/documents/{id}/export?format=…`  | экспорт в json / csv / xlsx / xml           |
| GET    | `/api/documents/{id}/file`             | отдача оригинального файла                  |
| DELETE | `/api/documents/{id}`                  | удаление                                     |

## Архитектура

```
docflow/
├── backend/
│   ├── main.py                 — FastAPI приложение и роуты
│   ├── gigachat_client.py      — обёртка над GigaChat SDK
│   ├── validation.py           — детерминированная валидация полей
│   ├── export.py               — генераторы JSON / CSV / XLSX / XML
│   ├── models.py               — Pydantic схемы
│   ├── storage.py              — SQLite + ФС
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.jsx             — router
│       ├── pages/              — Upload, Verify (split-view), Results
│       ├── components/         — FileDropZone, StatusBadge,
│       │                        DocumentViewer, VerifyForm,
│       │                        ValidationTooltip, ExportButtons
│       ├── api.js              — axios + endpoints
│       └── store.js            — Zustand (polling, drafts, documents)
└── data/                       — uploads + results
```

## Ключевые решения по GigaChat

- `upload_file(file_obj, purpose="general")` всегда перед `chat(...)`.
- Для PDF/DOC сообщение с `attachments=[file_id]` и **`"function_call": "auto"`** — без этого модель читает только первый файл.
- Для JPG/PNG — отдельный message с одним изображением; модель `GigaChat-Pro`.
- `temperature=0.1` для детерминированного JSON.
- Ответ очищается от markdown (`regex` `re.sub(r'```json\s*|\s*```', '', text)`), затем `json.loads`; при любой ошибке — `_empty_document()` с пустыми полями, pipeline не ломается.
- Credentials только из `GIGACHAT_CREDENTIALS`.

## Валидация (ни при каких условиях не возвращаем `null`)

- **ИНН:** `^\d{10}$|^\d{12}$`, иначе `""`.
- **Дата:** `%d.%m.%Y`, `%Y-%m-%d`, `%d/%m/%Y`, `%d.%m.%y`, русские месяцы → нормализуются к `ДД.ММ.ГГГГ`.
- **Суммы:** удаляются `₽ руб RUB $ €`, неразрывные пробелы, запятая меняется на точку; возвращается `"1234.56"` при `> 0`.
- **items:** если LLM не нашёл таблицу — `[]`, но остальные поля не ломаются.
- Ошибки складываются в `validation_errors[]` и подсвечиваются во фронтенде красным с tooltip.

## Экспорт

| Формат | Содержимое                                                             |
|--------|------------------------------------------------------------------------|
| JSON   | плоский объект + `exported_at`                                         |
| CSV    | реквизиты (Поле/Значение) + блок «Товары», UTF-8 c BOM для Excel       |
| XLSX   | два листа: `Реквизиты`, `Товары`; жирные заголовки, ширины колонок     |
| XML    | `<document>` корневой, `<items><item>…</item></items>`                 |

Имя файла — `{document_number}.{ext}`, либо `unknown_{doc_id[:8]}.{ext}` с санитизацией `/ \\ : * ? " < > |` и заменой пробелов на `_`.

## Краевые случаи

- Битый файл при загрузке — 500 `{"error": "Не удалось сохранить файл"}`.
- Превышение лимита — 413 с локализованным сообщением.
- Сбой GigaChat — документ переходит в `error` с `error_message`, остальной pipeline не падает.
- Таймаут 120 с (`asyncio.timeout`) — документ в `error`.
- Нет соединения с сервером — frontend показывает баннер.
- Черновики правок хранятся в `localStorage` (`docflow_draft_<id>`) и восстанавливаются при повторном открытии `/verify/:id`.
- Polling с backoff 3 s → 15 s пока есть документы в `processing`.
