# DocFlow AI — Production Prompt for Claude Opus 4.6
> Автоматическое распознавание и верификация бухгалтерских документов с GigaChat API

---

## 🔍 PRE-GENERATION ANALYTICS

### Проблема и ценность
Бухгалтеры тратят 40–60% рабочего времени на ручной перенос данных из сканов в учётные системы. Ошибки при ручном вводе достигают 3–5% на документ. Решение автоматизирует extraction, оставляя человека в контуре контроля (Human-in-the-Loop).

### Технические риски и митигация

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| LLM вернёт markdown вместо JSON | Высокая | regex-очистка ` ```json...``` ` до парсинга |
| GigaChat читает только 1 файл без function_call | Критический | Всегда `"function_call": "auto"` для PDF |
| Изображение > 1 на сообщение | Критический | Батчинг: отдельный message на каждый img |
| Превышение лимита 40MB/15MB | Средняя | Проверка на backend до отправки → 413 |
| Пустой/битый ответ AI | Средняя | Fallback-структура с `""` полями, не ломает pipeline |
| Race condition при async upload | Низкая | asyncio.Lock на doc_id, статусы в SQLite |

### Stack Decision Matrix

| Компонент | Выбор | Альтернатива | Причина выбора |
|-----------|-------|--------------|----------------|
| Backend framework | FastAPI | Flask/Django | async native, auto OpenAPI docs |
| Frontend | React + Vite | Next.js | скорость прототипа, SPA без SSR |
| State management | Zustand | Redux Toolkit | меньше boilerplate для прототипа |
| Storage | SQLite + FS | PostgreSQL | zero-config, достаточно для прототипа |
| Export CSV/XLSX | pandas | csv module | единый API для всех форматов |
| XML export | dicttoxml | lxml | простота установки |
| PDF preview | iframe/embed | react-pdf | нет webpack конфликтов с PDF.js |

---

## 🎯 MASTER PROMPT

```
РОЛЬ: Ты — Senior Full-Stack Engineer & AI Integration Architect.
Сгенерируй полностью рабочий, самодостаточный прототип веб-приложения
DocFlow AI для автоматического распознавания бухгалтерских документов.
Код должен запускаться командой без дополнительных настроек.
```

---

## 📐 АРХИТЕКТУРНОЕ ЗАДАНИЕ (ПОЛНОЕ)

### Структура проекта — обязательная

```
docflow/
├── backend/
│   ├── main.py                  # FastAPI app, все роуты
│   ├── gigachat_client.py       # Обёртка над GigaChat SDK
│   ├── validation.py            # Post-LLM детерминированная валидация
│   ├── export.py                # JSON / CSV / XLSX / XML генераторы
│   ├── models.py                # Pydantic schemas
│   ├── storage.py               # SQLite + файловая система
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Router: /, /verify/:id, /results/:id
│   │   ├── pages/
│   │   │   ├── Upload.jsx       # Drag-drop + таблица документов
│   │   │   ├── Verify.jsx       # Split-view верификация
│   │   │   └── Results.jsx      # Экспорт и история
│   │   ├── components/
│   │   │   ├── FileDropZone.jsx
│   │   │   ├── StatusBadge.jsx
│   │   │   ├── DocumentViewer.jsx   # iframe для PDF, <img> для изображений
│   │   │   ├── VerifyForm.jsx
│   │   │   ├── ValidationTooltip.jsx
│   │   │   └── ExportButtons.jsx
│   │   ├── api.js               # axios instance + все endpoint-функции
│   │   ├── store.js             # Zustand store
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── data/
│   ├── uploads/                 # Оригиналы файлов
│   └── results/                 # {doc_id}.json с результатами
├── .env.example
└── README.md
```

---

## ⚙️ BACKEND — ДЕТАЛЬНЫЕ ТРЕБОВАНИЯ

### main.py — FastAPI endpoints

Реализуй следующие роуты ПОЛНОСТЬЮ, без заглушек:

```
POST   /api/upload           — загрузка файлов (multipart/form-data)
GET    /api/documents        — список всех документов со статусами
GET    /api/documents/{id}   — данные одного документа
PATCH  /api/documents/{id}   — обновление полей пользователем
POST   /api/documents/{id}/approve  — утверждение документа
GET    /api/documents/{id}/export?format=json|csv|xlsx|xml
GET    /api/documents/{id}/file     — отдача оригинального файла
DELETE /api/documents/{id}   — удаление документа
```

Middleware:
- CORS: allow_origins=["http://localhost:5173"]
- Логирование всех запросов (logging.INFO)
- Global exception handler → {"error": "...", "doc_id": "..."}

### gigachat_client.py — строгие правила GigaChat API

```python
# ОБЯЗАТЕЛЬНАЯ ЛОГИКА — не упрощать:

class GigaChatClient:
    def __init__(self):
        # credentials из .env через os.environ
        # verify_ssl_certs=False для dev
        pass

    async def process_document(self, file_path: str, file_type: str) -> dict:
        """
        Основной метод. Логика:
        1. Открыть файл в бинарном режиме
        2. client.upload_file(file_obj, purpose="general") → получить file_id
        3. Сформировать payload:
           - Для PDF/DOC: messages с attachments + "function_call": "auto"
           - Для JPG/PNG: модель GigaChat-Pro, 1 image per message
        4. Вызвать client.chat(payload, temperature=0.1)
        5. Извлечь content[0].text
        6. Очистить от markdown: re.sub(r'```json\s*|\s*```', '', text)
        7. json.loads() в try/except → при ошибке вернуть _empty_document()
        8. Вернуть распознанные данные
        """

    def _build_system_prompt(self) -> str:
        return """Ты — система OCR для бухгалтерских документов.
Извлеки данные и верни ТОЛЬКО валидный JSON без markdown, пояснений и кода.
Структура ответа строго по схеме DocumentExtracted.
Если поле не найдено — верни пустую строку "".
Никогда не возвращай null, undefined, N/A."""

    def _build_user_prompt(self) -> str:
        return """Извлеки из документа:
- document_type (счёт-фактура|накладная|акт|счёт|иное)
- document_number
- document_date (ДД.ММ.ГГГГ)
- supplier_name, supplier_inn (10 или 12 цифр)
- buyer_name, buyer_inn (10 или 12 цифр)
- total_amount (число с точкой), vat_amount, currency (RUB)
- items: [{name, quantity, unit, unit_price, total_price}]
Верни строго JSON."""

    def _empty_document(self) -> dict:
        # Все поля = "", items = []
        # Никогда не ломать pipeline
        pass
```

**КРИТИЧНО для PDF-файлов** — пример payload:
```python
payload = {
    "model": "GigaChat-Pro",
    "messages": [{
        "role": "user",
        "content": user_prompt,
        "attachments": [file_id]   # file_id из upload_file()
    }],
    "function_call": "auto",       # БЕЗ ЭТОГО ЧИТАЕТ ТОЛЬКО 1 ФАЙЛ
    "temperature": 0.1
}
```

**КРИТИЧНО для изображений** — по одному на сообщение:
```python
# Если пакет из 3 изображений — 3 отдельных messages
messages = []
for img_file_id in image_file_ids:
    messages.append({
        "role": "user",
        "content": [
            {"type": "image_url", "image_url": {"url": f"uploads:{img_file_id}"}},
            {"type": "text", "text": user_prompt}
        ]
    })
```

### validation.py — детерминированная валидация

```python
# Реализуй все функции полностью:

def validate_inn(value: str) -> str:
    """Только цифры, длина 10 или 12. Иначе ""."""

def validate_date(value: str) -> str:
    """
    Парсинг форматов: DD.MM.YYYY, YYYY-MM-DD, DD/MM/YYYY, 
    "15 января 2024", "15.01.24".
    Приведение к ДД.ММ.ГГГГ. При неудаче → "".
    """

def validate_amount(value: Any) -> str:
    """
    Очистить: убрать пробелы, валютные символы (₽, руб, RUB, $, €),
    заменить запятую на точку.
    Привести к float > 0. При ошибке → "".
    Вернуть строку с 2 знаками после точки: "1234.56"
    """

def validate_document(data: dict) -> tuple[dict, list[str]]:
    """
    Применить все валидаторы.
    Вернуть (validated_data, errors_list).
    errors_list: ["supplier_inn: неверный формат ИНН", ...]
    """
```

### models.py — Pydantic схемы

```python
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
    items: list[DocumentItem] = []

class DocumentRecord(BaseModel):
    doc_id: str
    filename: str
    file_size: int
    file_type: str  # pdf | jpg | png
    status: Literal["processing", "ready", "approved", "error"]
    created_at: datetime
    updated_at: datetime
    data: Optional[DocumentData] = None
    validation_errors: list[str] = []
    error_message: str = ""

class ExportFormat(str, Enum):
    json = "json"
    csv = "csv"
    xlsx = "xlsx"
    xml = "xml"
```

### export.py — генераторы файлов

```python
# Реализуй все 4 формата:

def export_json(record: DocumentRecord) -> bytes:
    """json.dumps(record.dict(), ensure_ascii=False, indent=2)"""

def export_csv(record: DocumentRecord) -> bytes:
    """
    pandas DataFrame из items + заголовочные поля документа.
    Кодировка UTF-8 with BOM для совместимости с Excel.
    """

def export_xlsx(record: DocumentRecord) -> bytes:
    """
    Лист 1: Реквизиты документа (key-value таблица)
    Лист 2: Табличная часть (items)
    openpyxl, без временных файлов — BytesIO
    """

def export_xml(record: DocumentRecord) -> bytes:
    """
    Корневой тег <document>.
    dicttoxml с attr_type=False.
    Если dicttoxml недоступен — ручная сборка через xml.etree.ElementTree.
    """

def sanitize_filename(name: str) -> str:
    """Убрать / \\ : * ? " < > | Заменить пробелы на _"""

def get_download_filename(record: DocumentRecord, fmt: ExportFormat) -> str:
    """
    Если document_number не пустой → sanitize(document_number).ext
    Иначе → unknown_{doc_id[:8]}.ext
    """
```

### storage.py — персистентность

```python
# SQLite через aiosqlite (async):
# Таблица documents: все поля DocumentRecord
# Методы: create, get, update, list_all, delete
# data поле хранится как JSON TEXT

# Файловая система:
# ./data/uploads/{doc_id}_{original_filename}
# ./data/results/{doc_id}.json  (обновляется при каждом изменении)
```

---

## DESIGN

### Цветовая гамма

Использоать цветовую гамму с сайта kzn.ru

### Иконка главна

Использовать logo.svg, перенести его в папку со всеми картинками

## 🖥️ FRONTEND — ДЕТАЛЬНЫЕ ТРЕБОВАНИЯ

### api.js — axios instance

```javascript
// BASE_URL из import.meta.env.VITE_API_URL || 'http://localhost:8000'
// Interceptor для логирования ошибок
// Функции:
export const uploadFiles = (files, onProgress) => { ... }
export const getDocuments = () => { ... }
export const getDocument = (id) => { ... }
export const updateDocument = (id, data) => { ... }
export const approveDocument = (id) => { ... }
export const exportDocument = (id, format) => { ... }
export const getFileUrl = (id) => `${BASE_URL}/api/documents/${id}/file`
```

### store.js — Zustand

```javascript
// Состояние:
{
  documents: [],          // список DocumentRecord
  currentDoc: null,       // активный документ
  draftEdits: {},         // { [doc_id]: { field: value } } → localStorage
  isLoading: false,
  processingIds: Set(),   // doc_ids в статусе processing
  
  // Actions:
  fetchDocuments, setCurrentDoc, updateField, 
  saveDraft, clearDraft, approveDocument,
  startPolling, stopPolling
}

// Polling: каждые 3 сек проверяй статус для processingIds
// Останови polling когда все перешли в ready/error
```

### Upload.jsx — страница загрузки

Требования:
- Drag & drop зона с визуальной реакцией на dragover (border + background)
- Принимает: .pdf .jpg .jpeg .png, множественные файлы
- Валидация размера на клиенте до отправки (показ ошибки в зоне)
- Progress bar для каждого файла отдельно (axios onUploadProgress)
- Таблица документов: имя файла | размер | тип | статус | действия
- StatusBadge: processing=жёлтый spinner | ready=синий | approved=зелёный | error=красный
- Кнопка "Открыть верификацию" активна только при status==="ready"
- Автообновление таблицы через polling из store
- Скелетоны во время загрузки (Tailwind animate-pulse)

### Verify.jsx — страница верификации (SPLIT VIEW)

```
Layout: две колонки 50/50, резиновые, min-width 300px каждая

Левая колонка:
- DocumentViewer: если file_type=pdf → <iframe src={fileUrl} />,
  иначе → <img src={fileUrl} />
- Кнопки zoom +/- (CSS transform scale)
- Имя файла + размер

Правая колонка — форма VerifyForm:
- Все поля type="text" (НЕ number, НЕ date — чтобы не ломать маски)
- Группировка: Реквизиты документа | Поставщик | Покупатель | Суммы | Товары
- Поля с validation_errors: красная рамка (border-red-500) + ValidationTooltip
- Таблица items: редактируемая, кнопки "+ строка" и "× удалить"
- Черновики: onChange → store.updateField → автосохранение в localStorage
- Кнопка "Утвердить" (зелёная, внизу) → PATCH + POST approve → redirect /results/:id
- Кнопка "Сбросить к AI-результату" → clearDraft, перезагрузить данные
```

### Results.jsx — страница результатов

- Карточка с утверждёнными данными (read-only)
- ExportButtons: 4 кнопки (JSON / CSV / XLSX / XML)
  - АКТИВНЫ только если status === "approved"
  - Клик → GET /export?format=... → blob → a.download
  - Loading state на кнопке во время скачивания
- История: таблица всех approved документов с датой и номером
- Кнопка "Назад к загрузке"

### ValidationTooltip.jsx

```jsx
// Tooltip появляется при hover/focus на поле с ошибкой
// Позиционирование: absolute, выше поля
// Текст: конкретная ошибка из validation_errors[]
// Красный фон, белый текст, border-radius
```

---

## 🔌 ИНТЕГРАЦИЯ GIGACHAT — КОНТРОЛЬНЫЙ СПИСОК

При генерации кода обязательно выполни ВСЕ пункты:

- [ ] `from gigachat import GigaChat` — официальный SDK
- [ ] `upload_file(file_obj, purpose="general")` перед отправкой в chat
- [ ] `"function_call": "auto"` для PDF и текстовых документов
- [ ] Модель `GigaChat-Pro` для изображений
- [ ] Не более 1 изображения на message (при batch — несколько messages)
- [ ] Не более 10 изображений на весь запрос
- [ ] `temperature=0.1` для детерминированного вывода
- [ ] System prompt требует чистый JSON без markdown
- [ ] regex-очистка ответа перед `json.loads()`
- [ ] При любой ошибке парсинга → `_empty_document()` с `""` полями
- [ ] Проверка размера файла ДО отправки в API
- [ ] Credentials из переменной окружения `GIGACHAT_CREDENTIALS`

---

## ✅ ВАЛИДАЦИЯ — БИЗНЕС-ЛОГИКА

### Правила, которые НЕЛЬЗЯ нарушать:

1. **ИНН** поставщика/покупателя: regex `^\d{10}$|^\d{12}$`. Всё остальное → `""`
2. **Дата документа**: попробовать форматы `%d.%m.%Y`, `%Y-%m-%d`, `%d/%m/%Y`, русские месяцы. Результат всегда `ДД.ММ.ГГГГ`. Неудача → `""`
3. **Суммы** (total_amount, vat_amount, unit_price, quantity): убрать `₽ руб. RUB $ €`, пробелы, заменить `,` на `.`. `float(cleaned) > 0` → строка `"1234.56"`. Иначе → `""`
4. **items**: если LLM не распознал таблицу → `[]` (пустой массив), НЕ ломать остальные поля
5. **Нераспознанные поля**: всегда `""`, НИКОГДА `null`, `None`, `"N/A"`, `"не указано"`
6. **Validation errors**: список строк `["field_name: описание ошибки"]` — отдаётся во frontend для подсветки

---

## 📤 ЭКСПОРТ — ТРЕБОВАНИЯ К ФАЙЛАМ

### JSON
```json
{
  "doc_id": "...",
  "exported_at": "2024-01-15T10:30:00",
  "document_number": "СФ-2024-001",
  "document_date": "15.01.2024",
  "supplier_name": "...",
  "supplier_inn": "...",
  "buyer_name": "...",
  "buyer_inn": "...",
  "total_amount": "118000.00",
  "vat_amount": "18000.00",
  "currency": "RUB",
  "items": [...]
}
```

### XLSX (два листа)
- **Лист "Реквизиты"**: столбцы [Поле, Значение], заголовки жирные
- **Лист "Товары"**: столбцы [Наименование, Кол-во, Ед., Цена, Сумма]
- Ширина столбцов: `ws.column_dimensions['A'].width = 30`

### XML
```xml
<?xml version="1.0" encoding="UTF-8"?>
<document>
  <document_number>СФ-2024-001</document_number>
  <items>
    <item><name>...</name><quantity>...</quantity></item>
  </items>
</document>
```

### Имя файла
- `{document_number}.{ext}` если document_number не пустой
- `unknown_{doc_id[:8]}.{ext}` иначе
- Санитизация: убрать `/ \ : * ? " < > |`, заменить пробелы на `_`

---

## ⚠️ ОБРАБОТКА КРАЕВЫХ СЛУЧАЕВ

### Backend

```python
# Битый файл при загрузке
try:
    await aiofiles.open(path, 'wb')
except Exception:
    return {"error": "Не удалось сохранить файл"}, status=500

# Превышение лимита размера
if file.size > MAX_SIZE:
    raise HTTPException(413, f"Файл превышает лимит {MAX_SIZE_MB}MB")

# Пакет превышает суммарный лимит
if sum(sizes) > BATCH_LIMIT:
    raise HTTPException(413, "Суммарный размер пакета превышает 80MB")

# Сбой GigaChat API
try:
    result = await gigachat.process_document(path, file_type)
except Exception as e:
    logger.error(f"GigaChat error for {doc_id}: {e}")
    await storage.update_status(doc_id, "error", str(e))
    return  # не бросать исключение выше

# Таймаут обработки (> 120 сек)
async with asyncio.timeout(120):
    result = await gigachat.process_document(...)
```

### Frontend

```javascript
// Polling с exponential backoff
const poll = async (docId) => {
  let delay = 3000;
  while (true) {
    const doc = await getDocument(docId);
    if (doc.status !== 'processing') break;
    await sleep(delay);
    delay = Math.min(delay * 1.5, 15000);
  }
};

// Сохранение черновиков в localStorage
const DRAFT_KEY = `docflow_draft_${docId}`;
localStorage.setItem(DRAFT_KEY, JSON.stringify(edits));

// Восстановление черновика при открытии Verify
const saved = localStorage.getItem(DRAFT_KEY);
if (saved) setFormData({...aiData, ...JSON.parse(saved)});

// Network error
axios.interceptors.response.use(null, (err) => {
  if (!err.response) {
    store.setError('Нет соединения с сервером');
  }
  return Promise.reject(err);
});
```

---

## 🔧 КОНФИГУРАЦИЯ

### .env.example
```env
# GigaChat API
GIGACHAT_CREDENTIALS=your_base64_credentials_here
GIGACHAT_SCOPE=GIGACHAT_API_PERS

# Backend
HOST=0.0.0.0
PORT=8000
DATA_DIR=./data

# File limits (bytes)
MAX_PDF_SIZE=41943040
MAX_IMG_SIZE=15728640
MAX_BATCH_SIZE=83886080
```

### requirements.txt
```
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
gigachat>=0.1.15
pydantic>=2.5.0
aiofiles>=23.2.0
aiosqlite>=0.19.0
pandas>=2.1.0
openpyxl>=3.1.2
dicttoxml>=1.7.16
python-multipart>=0.0.9
python-dotenv>=1.0.0
httpx>=0.26.0
```

### package.json (frontend)
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.21.0",
    "zustand": "^4.4.7",
    "axios": "^1.6.5"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.0.10",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.33"
  }
}
```

---

## 🚀 ИНСТРУКЦИЯ ПО ЗАПУСКУ

### Шаг 1 — Клонировать и настроить
```bash
git clone <repo> && cd docflow
cp .env.example .env
# Вставить GIGACHAT_CREDENTIALS в .env
mkdir -p data/uploads data/results
```

### Шаг 2 — Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# Swagger UI: http://localhost:8000/docs
```

### Шаг 3 — Frontend
```bash
cd frontend
npm install
npx tailwindcss init -p             # если нет tailwind.config.js
npm run dev
# App: http://localhost:5173
```

### Шаг 4 — Проверка работоспособности
```bash
# Health check
curl http://localhost:8000/health

# Тестовый upload
curl -X POST http://localhost:8000/api/upload \
  -F "files=@test_invoice.pdf"

# Получить список
curl http://localhost:8000/api/documents
```

---

## 📊 МЕТРИКИ УСПЕХА ПРОТОТИПА

| Метрика | Цель |
|---------|------|
| Точность распознавания ИНН | > 90% |
| Точность распознавания суммы | > 85% |
| Время обработки 1 документа | < 30 сек |
| UI отклик при загрузке | < 200 мс |
| Успешный экспорт во все форматы | 100% |
| Pipeline не ломается при ошибке AI | 100% |

---

## 📝 ФОРМАТ ВЫВОДА ОТ CLAUDE OPUS

Сгенерируй код в следующем порядке, каждый файл в отдельном code-блоке с именем файла в комментарии:

1. `backend/models.py`
2. `backend/storage.py`
3. `backend/validation.py`
4. `backend/gigachat_client.py`
5. `backend/export.py`
6. `backend/main.py`
7. `backend/requirements.txt`
8. `frontend/src/api.js`
9. `frontend/src/store.js`
10. `frontend/src/App.jsx`
11. `frontend/src/pages/Upload.jsx`
12. `frontend/src/pages/Verify.jsx`
13. `frontend/src/pages/Results.jsx`
14. `frontend/src/components/` (все компоненты)
15. `frontend/package.json` + `vite.config.js` + `tailwind.config.js`
16. `.env.example`
17. `README.md` с инструкцией запуска

**НЕ оставляй TODO, placeholder, pass или заглушки в критической логике.**
**Каждый файл должен быть production-ready и немедленно запускаемым.**
