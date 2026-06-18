# База знаний AI-ассистента (источник: `/home/vladymyr/Рабочий стол/rabota`)

Документ для Cursor/AI: канон бизнес-логики, психологии клиента, withdrawal/SDL, строгих правил и референс-кода.  
**Перед ответами по GlobalSafe Finance / newsell / SDL — сверяйся с этим файлом и первоисточниками ниже.**

**Операционный регламент для AI на проде:** папка `наработки/` (`ПРАВИЛА_ВЕДЕНИЯ_КЛИЕНТА.md`, `ФОРМАТ_ОТВЕТА_AI.md`) — загружается в промпт через `src/AiClientPlaybook.php` (AI-Секретарь, План влияния).

---

## 1. Карта папки `rabota`

| Путь | Назначение |
|------|------------|
| `rabota/` | Лендинг юриста Сергея Макарова (возврат от мошенников, KZ) |
| `rabota/dla_posobia/newsell/` | **Основная PHP-платформа** GlobalSafe Finance (полный CRM, withdrawal 6 этапов, AI) |
| `rabota/dla_posobia/newsell_hybrid/` | Вариант с 6-этапным withdrawal UI (`admin-withdrawal-6stages.php`) |
| `rabota/dla_posobia/Sels/` | Legacy CRM (TCPDF, старые миграции) |
| `rabota/dla_posobia/git/` | Статика: подписание claim/contract/report |
| `rabota/dla_posobia/ПОЛНОЕ_ПРАКТИЧЕСКОЕ_ПОСОБИЕ*.md` | **Библия продаж и сопровождения** (3 части) |

**Текущий рабочий репозиторий деплоя:** `/home/vladymyr/Рабочий стол/sekkkkll` (SDL-кабинет, `admin/client.php`, кувшины, AI-секретарь).  
Логика должна быть **согласована** с `newsell`, но схемы таблиц могут отличаться (`sdl` vs `withdrawal_requests`).

---

## 2. STRICT RULES (операционный регламент)

Источник: `rabota/dla_posobia/newsell/STRICT_RULES.md`

1. **Единый источник баланса** — полный баланс только через `user_total_balance_kzt(user_id)`; не изобретать формулы на страницах/API.
2. **Вывод = вся сумма** — активная заявка синхронизируется на полный KZT-эквивалент (`withdrawal_sync_amount_to_full_balance`); не создавать частичные дубли.
3. **Этапы последовательно** — без пропусков, только через явные transition rules (в sekkkkll админ может `force_sdl_stage` — осознанное исключение с логом).
4. **Идемпотентность** — повторные действия сходятся к одному состоянию.
5. **Аудит** — критические операции → `audit_log` / `admin_logs`; оператору — понятная причина нарушения правила.
6. **Консолидация перед выводом** — если деньги на нескольких счетах/валютах, сначала внутреннее объединение (кувшины), потом вывод.

**Кувшины (Jar System) в sekkkkll:** `kzt_balance`, `eur_balance`, `usd_balance`, `crypto_balance`, `uk_escrow_frozen` — списание только из выбранного кувшина.

---

## 3. Канонический withdrawal workflow (newsell)

Источник: `rabota/dla_posobia/newsell/docs/withdrawal-workflow.md`

| Этап | `status` (кейс) | `funds_status` |
|------|-----------------|----------------|
| 1 | `identity_verification` | `uk_escrow_frozen` |
| 2 | `source_of_funds` | `source_of_funds_verification` |
| 3 | — | `aml_compliance_review` |
| 4 | — | `pending_commission_payment` |
| 5 | — | `processing_transfer` |
| 6 | `completed` | `completed` |

Документы этапа 2 — **по сумме заявки** (`withdrawal_intel.php`): от справки 2-НДФЛ до расширенного пакета на 10M+ KZT.

**Создание заявки (newsell):** `api/withdrawals/request.php` — только полный баланс, одна активная заявка, обязательные документы одобрены.

---

## 4. SDL workflow (sekkkkll — 6 этапов кабинета)

| # | Клиент видит (пример) | Админ-очередь |
|---|------------------------|---------------|
| 1 | Идентификация | `pipeline_queue.php?stage=1` |
| 2 | Происхождение средств (SOF) | stage 2, `sof_review.php` |
| 3 | Юридический | stage 3 |
| 4 | Регуляторы | stage 4, `stage_review.php` |
| 5 | Финансовое урегулирование | stage 5 |
| 6 | Банковский выпуск | stage 6 |

Поля: `sdl.stage_number`, `current_stage`, `progress_percent`, `funds_status`, `psychotype`, `risk_score`, `global_search_started_at`.

---

## 5. Психология клиента (для AI «План влияния» и чата)

Источник: `ПОЛНОЕ_ПРАКТИЧЕСКОЕ_ПОСОБИЕ.md` (части 1–3)

- **Портрет:** 30–55 лет, потеря $1k–500k+, страх + недоверие + стыд + надежда.
- **Золотое правило:** не продавать, пока не показано понимание боли.
- **Триггеры доверия:** конкретика, этапы, прозрачность, кейсы; **не** обещать 100% возврат.
- **Язык клиента:** зеркалить («мошенники», «брокеры», «кидалы»), без жаргона на старте.
- **Оплата:** дробление этапов, сравнение с потерей («1% от потерянного»), срочность без агрессии.
- **Скрипты переходов** этап 1→6 — в части 2 пособия (готовые фразы для оператора).

AI при генерации плана влияния должен: психотип → стратегия диалога → шаги (документы, `staff_tasks`, `client_notifications`) → целевой `funds_status` / `progress_percent`.

---

## 6. AI-модули в newsell (эталон промптов)

### 6.1 Секретарь оператора (`client_ai_advisor.php`)

- API: DeepSeek `deepseek-chat`, `DEEPSEEK_API_KEY`
- Формат ответа (обязателен):
  1. Статус кейса  
  2. Что сделано  
  3. Блокеры  
  4. Рекомендуемый этап + обоснование  
  5. План на 24 часа  
  6. Потенциал оплат  
  7. Психотип (гипотеза) + как говорить  
  8. Готовые фразы (3–5)

Этапы withdrawal в промпте:  
`identity_verification → source_of_funds → aml_compliance_review → commission_payment → processing → completed`

### 6.2 Документы (`document_ai.php`)

- Таблица `document_ai_checks`: extraction, authenticity, risk_level, flags JSON
- Скан PDF через `pdftotext`, ответ LLM — строго JSON

### 6.3 sekkkkll (текущий код)

| Модуль | Файл |
|--------|------|
| LLM клиент | `src/AiLlmClient.php` |
| План влияния | `src/ClientInfluencePlanService.php`, `admin/api/influence_plan.php` |
| AI-Секретарь «Режим Бога» | `src/AiSecretaryService.php`, `src/AiGodModeExecutor.php`, `admin/ai_secretary.php` |
| Переводы кувшинов | `src/ClientJarService.php` |
| Крипто-вывод | `src/CryptoWithdrawal.php`, `withdraw_crypto.php` |
| Этап без документов | `src/AdminSdlControl.php` |

**God Mode actions (whitelist):** `approve_documents`, `jar_adjust`, `sdl_patch`, `insert_notification`, `insert_staff_task`, `crm_note`, `crm_conversation_summary`, `bank_loan_status`, `identity_checks_done` — всё в транзакции.

---

## 7. Услуги и монетизация (newsell)

- Каталог: `public_html/includes/services_catalog.php`
- Цена: `max(база, % от balance KZT)` — `service_effective_price_kzt()`
- Оплата: чек → `verification` → админ `approve_receipt` → `paid` → `in_progress`
- Перевод документов: код `doc_translation_legal`, этап 6 каталога

---

## 8. Что НЕ писать клиенту (внутренние операции)

- Переводы между кувшинами админом (`client_jar_transfers`)
- TX hash / внутренние заметки по крипто-выводу
- «Обход документов» / принудительная смена этапа
- Технические имена таблиц в уведомлениях

Клиенту — нейтральные статусы: «На проверке», «Исполняется», «Выполнено»; маскированный адрес кошелька.

---

## 9. Крипто-кошельки (sekkkkll)

Провайдеры: MetaMask, Trust Wallet, Binance, Bybit, OKX, Coinbase, Kraken, Crypto.com, Ledger, Trezor, Phantom, Tonkeeper.  
Поток: клиент `withdraw_crypto.php` → `pending_admin` → админ исполняет (списание кувшина) → уведомление без внутренних деталей.

---

## 10. Банк / кредиты (sekkkkll)

`src/BankCredit.php` — от 1M ₸, LTV 75%, залог SDL-балансы, застава = 1-й платёж, одобрение только админом.

---

## 11. Первоисточники для углублённого чтения

При сложных задачах **читай файлы целиком**:

1. `rabota/dla_posobia/newsell/docs/project-full-description.md` — архитектура, все API
2. `rabota/dla_posobia/newsell/docs/withdrawal-workflow.md` — этапы вывода
3. `rabota/dla_posobia/ПОЛНОЕ_ПРАКТИЧЕСКОЕ_ПОСОБИЕ.md` — психология, этапы, монетизация
4. `rabota/dla_posobia/ПОЛНОЕ_ПРАКТИЧЕСКОЕ_ПОСОБИЕ_ЧАСТЬ_2.md` — скрипты, возражения, дожим
5. `rabota/dla_posobia/ПОЛНОЕ_ПРАКТИЧЕСКОЕ_ПОСОБИЕ_ЧАСТЬ_3.md` — LTV, CRM, кейсы
6. `rabota/dla_posobia/newsell/STRICT_RULES.md` — регламент разработки

---

## 12. Подписываемые документы (HRL-style, sekkkkll)

- Шаблоны: `contract`, `claim`, `report`, `custom` + свои в `sign_document_templates`
- Админ: `admin/sign_documents.php` — AI-текст, предпросмотр, ссылка клиенту
- Клиент: `my_signatures.php` → `sign.php?t=TOKEN` — биометрия 2.5 сек
- БД: `client_signable_documents`, `client_document_signatures`, `sdl_signature_log`, заметки CRM
- AI-Секретарь: action `create_signable_document` с `template_key` или `title`+`body`

## 13. Чеклист ответа «умного» ассистента

- [ ] Учтён полный баланс / кувшин списания?  
- [ ] Этап и `funds_status` согласованы с workflow?  
- [ ] Рекомендации по клиенту — с психологией и конкретными фразами?  
- [ ] Изменения БД — транзакция + audit?  
- [ ] Клиент не видит внутренних операций админа?  
- [ ] При сомнении — сверка с `newsell` референсом в `rabota`?

*Обновлено: интеграция знаний из папки rabota для AI GlobalSafe Finance.*
