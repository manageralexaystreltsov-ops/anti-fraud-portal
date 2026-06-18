# Промт для кодера — Portfolio Intelligence System
## Lichka CRM · Sprint 24 · `/dashboard` + новый сервис

---

## Концепция

Каждый клиент — **актив**, который приносит доход. Портфель из 20 клиентов — это источник предсказуемого дохода, если с каждым поддерживать контакт каждые 2–3 дня.

Система должна:
1. Считать **среднюю ценность** клиента и доход с портфеля в целом
2. Контролировать что **ни один клиент не забыт** — каждый должен получить контакт каждые 2–3 дня
3. AI рассчитывает **оптимальное расписание контактов** на день с учётом пенсий, ЗП, обещаний
4. Показывать **«здоровье портфеля»** — сколько клиентов в зоне риска (давно без контакта)

---

## ЧАСТЬ 1 — BACKEND

### Новый сервис: `server/src/services/portfolioIntelligence.ts`

#### 1.1 Метрики портфеля

```typescript
export interface PortfolioMetrics {
  // Общее
  total_active_clients: number;          // активные (не в архиве)
  
  // Ценность портфеля
  avg_client_value_kzt: number;          // среднее: client_remaining_total по всем активным
  total_portfolio_value_kzt: number;     // сумма всех остатков по документам
  total_portfolio_commission_kzt: number; // × commission_rate (из revenue_config)
  
  // Доход в час (твоя комиссия)
  // Логика: если работаешь 8 часов в день, 22 дня в месяц
  // hourly_rate = target_monthly_commission / (8 * 22)
  hourly_rate_kzt: number;
  
  // Доход на клиента
  avg_commission_per_client_kzt: number; // total_portfolio_commission / total_active_clients
  
  // Прогноз
  // Если добавить N клиентов похожего профиля:
  projected_monthly_at_30_clients: number;
  projected_monthly_at_50_clients: number;
  projected_monthly_at_100_clients: number;
  
  // Сегментация портфеля
  segments: {
    pension:     { count: number; avg_value_kzt: number; avg_age: number };
    salary:      { count: number; avg_value_kzt: number };
    other:       { count: number; avg_value_kzt: number };
  };
  
  // Возрастные группы
  age_groups: {
    range: string;       // "60-70", "70-80" и т.д.
    count: number;
    avg_value_kzt: number;
    conversion_rate: number;  // сколько % дошли до оплаты
  }[];
}
```

**Источники данных:**
- `clients` (active, not archived)
- `client_document_orders` (суммы, статусы)
- `client_field_values` (age, income_type, pension_pay_day, salary_pay_day)
- `revenue_config` (commission_rate, target_monthly_kzt)

#### 1.2 Контактный контроль — сердце системы

```typescript
export interface ContactStatus {
  client_id: number;
  full_name: string;
  phone: string;
  
  // Последний контакт
  last_contact_at: Date | null;         // последнее событие MANAGER_NOTE, CONSULTATION, FIRST_CONTACT из case_timeline
  days_since_contact: number;           // сколько дней прошло (0 = сегодня)
  
  // Статус контакта
  contact_health: 'fresh' | 'due' | 'overdue' | 'critical';
  // fresh    = 0–2 дня
  // due      = 3 дня (пора звонить)
  // overdue  = 4–6 дней (просрочено)
  // critical = 7+ дней (критично, клиент может уйти)
  
  // Когда звонить
  next_contact_date: string;            // рекомендуемая дата следующего контакта
  next_contact_reason: string;          // почему именно тогда (пенсия, обещание, просрочка и т.д.)
  priority_score: number;               // 0–100, чем выше — тем срочнее звонить сегодня
  
  // Финансовый контекст
  client_remaining_kzt: number;         // сколько должен
  commission_kzt: number;               // твоя комиссия с него
  expected_payment_date: string | null; // pension_pay_day, salary_pay_day или pay_promised_date
  income_type: string | null;           // пенсия / зарплата / другое
  age: number | null;
  
  // Флаги
  has_promise: boolean;                 // есть pay_promised_date в ближайшие 7 дней
  has_upcoming_income: boolean;         // пенсия/ЗП в ближайшие 5 дней
  is_overdue_payment: boolean;          // есть заказы с payment_status=overdue
}
```

**Логика `priority_score` (0–100):**
```
+40  если days_since_contact >= 7 (critical)
+30  если days_since_contact >= 4 (overdue)
+20  если days_since_contact >= 3 (due)
+25  если is_overdue_payment
+20  если has_promise (обещал заплатить — проконтролировать)
+15  если has_upcoming_income (пенсия/ЗП через 1–3 дня — позвонить заранее)
+10  если has_upcoming_income (через 4–5 дней)
-10  если contact_health = 'fresh' (звонили недавно)
```

#### 1.3 AI-расписание дня — `buildDaySchedule()`

```typescript
export interface DayScheduleSlot {
  time_slot: string;       // "10:00", "11:30" и т.д.
  client_id: number;
  client_name: string;
  phone: string;
  reason: string;          // "Пенсия завтра · позвонить сегодня", "Обещал · проверить", "7 дней без контакта"
  script_hint: string;     // одна фраза с чего начать разговор
  priority: 'high' | 'medium' | 'low';
  expected_commission_kzt: number;
}

export interface DaySchedule {
  date: string;
  total_slots: number;
  
  // Расписание по временным слотам (рабочий день 9:00–18:00, слоты по 30 мин)
  slots: DayScheduleSlot[];
  
  // Сводка
  high_priority_count: number;
  total_expected_commission_kzt: number;   // если все high заплатят
  
  // Клиенты которых НЕТ в расписании сегодня (но нужны завтра)
  scheduled_for_tomorrow: { client_id: number; client_name: string; reason: string }[];
  
  // Забытые — в расписании нет ни сегодня ни завтра (critical)
  forgotten: { client_id: number; client_name: string; days_since_contact: number }[];
}
```

**Логика построения расписания:**
1. Собрать всех активных клиентов с `ContactStatus`
2. Отсортировать по `priority_score` DESC
3. Клиенты с `contact_health = 'due' | 'overdue' | 'critical'` → в сегодняшнее расписание
4. Клиенты с `has_upcoming_income` (пенсия/ЗП завтра или послезавтра) → обязательно сегодня
5. Разложить по слотам начиная с 9:00, по 30 минут на звонок
6. Максимум 16 слотов в день (8 часов). Остаток → завтра.
7. `script_hint` — генерировать статически из шаблонов (без AI-запроса):
   - `has_upcoming_income` → «Алимахан, завтра ваша пенсия — хотел уточнить по документам»
   - `has_promise` → «Вы говорили, что оплатите {date} — всё в силе?»
   - `is_overdue_payment` → «У нас небольшой вопрос по документу от {date}»
   - default → «Добрый день, звоню по вашему делу»

#### 1.4 Добавить к `ContactStatus` метку «подтверждён»

```typescript
// Менеджер нажал "Позвонил" в расписании
// POST /api/dashboard/portfolio/contact-confirm
// { client_id, note? }
// → записывает MANAGER_NOTE в case_timeline с source='contact_confirm'
// → обновляет last_contact_at
// → пересчитывает priority_score
```

#### 1.5 Прогностика: «Сколько клиентов нужно»

```typescript
export interface GrowthProjection {
  current_clients: number;
  current_monthly_commission_kzt: number;
  avg_commission_per_client_kzt: number;
  
  // Сколько нужно клиентов для цели
  clients_needed_for_target: number;      // ceil(target_monthly / avg_commission_per_client)
  clients_to_add: number;                 // clients_needed - current
  
  // Профиль «идеального» клиента для добавления
  best_segment: string;                   // 'pension' | 'salary' — у кого выше avg_value
  best_age_range: string;                 // возрастная группа с лучшей конверсией
  
  // Что даст 1 новый клиент
  one_client_monthly_kzt: number;         // = avg_commission_per_client
  one_client_hourly_kzt: number;          // = avg_commission_per_client / (8 * 22)
  
  scenarios: {
    label: string;    // "+5 клиентов", "+10 клиентов", "+20 клиентов"
    total_clients: number;
    monthly_kzt: number;
    monthly_usd: number;
  }[];
}
```

### Новые API-эндпоинты

Добавить в `server/src/routes/dashboard.ts` (или новый файл `portfolioDashboard.ts`):

```
GET  /api/dashboard/portfolio/metrics       → PortfolioMetrics
GET  /api/dashboard/portfolio/contacts      → ContactStatus[] (все активные клиенты)
GET  /api/dashboard/portfolio/schedule      → DaySchedule (расписание на сегодня)
GET  /api/dashboard/portfolio/schedule?date=2026-06-05  → расписание на дату
POST /api/dashboard/portfolio/contact-confirm  → { client_id, note? } → записывает контакт
GET  /api/dashboard/portfolio/growth        → GrowthProjection
```

**Кеширование:** `metrics` и `schedule` — кеш 5 минут в памяти (`Map<string, {data, ts}>`). Инвалидируется при `contact-confirm`.

---

## ЧАСТЬ 2 — ОБНОВЛЁННЫЙ ДАШБОРД

### Концепция обновления

Дашборд получает **новую верхнюю зону** — «Портфель». Существующие зоны 1–3 сдвигаются вниз и немного уплотняются.

```
┌──────────────────────────────────────────────────────────────────┐
│  ЗОНА 0: ПОРТФЕЛЬ (новая, ~140px)                                │
│  Здоровье · Ценность · Часовой доход · Прогноз · Забытые         │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│  ЗОНА 1: КОМАНДНАЯ СТРОКА (существующая — без изменений)         │
└──────────────────────────────────────────────────────────────────┘
┌────────────────────────────────┬─────────────────────────────────┐
│  ЗОНА 2 LEFT: РАСПИСАНИЕ ДНЯ  │  ЗОНА 2 RIGHT (обзвон если есть)│
│  (НОВОЕ — заменяет call list  │  или аналитика                   │
│   когда нет срочных должников) │                                  │
└────────────────────────────────┴─────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│  ЗОНА 3: АНАЛИТИКА (существующая — без изменений)                │
└──────────────────────────────────────────────────────────────────┘
```

---

### ЗОНА 0 — Портфель — `<PortfolioBar />`

**API:** `GET /api/dashboard/portfolio/metrics` + `/contacts`

Одна горизонтальная полоса, 5 блоков:

#### Блок 1 — «Здоровье портфеля»

```
ПОРТФЕЛЬ · 23 КЛИЕНТА
━━━━━━━━━━━━━━━━━━━━━
🟢 12  🟡 6  🔴 3  💀 2
свежие  пора  просрочка  забыты
```

- Четыре цветных числа: green/amber/red/muted
- «💀 2 забыты» — красная пульсирующая точка если >0
- Клик по числу → фильтрует расписание ниже

#### Блок 2 — «Ценность портфеля»

```
ПОРТФЕЛЬ · КОМИССИЯ
━━━━━━━━━━━━━━━━━━━
195 000 ₸  всего
  8 478 ₸  ср. на клиента
```

- Числа в DM Mono
- Под суммой: маленький amber текст «если закрыть всех»

#### Блок 3 — «Твой час»

```
ДОХОД · ЧАС РАБОТЫ
━━━━━━━━━━━━━━━━━━
  2 045 ₸
при текущем портфеле
```

- Формула: `target_monthly_commission / (8 × 22)`
- Tooltip при hover: «Если добавить 10 клиентов → 4 090 ₸/час»
- Число считается от 0 при загрузке (useCountUp)

#### Блок 4 — «Нужно клиентов»

```
ДО ЦЕЛИ $2 000
━━━━━━━━━━━━━━━━
+17 клиентов
Лучший профиль: Пенсия 65–75 лет
```

- `clients_to_add` — красный если >10, amber если 5–10, green если ≤5
- «Лучший профиль» из `best_segment` + `best_age_range`
- Кнопка `[+ Добавить клиента →]` — маленькая, subtle, ссылка на `/clients/new`

#### Блок 5 — «Сценарии роста»

```
+5 клиентов → $2 250/мес
+10          → $2 500/мес
+20          → $3 000/мес
```

- Три строки, числа в DM Mono
- Активный (ближайший к цели) — cyan

---

### ЗОНА 2 LEFT — Расписание дня — `<DaySchedulePanel />`

Заменяет Call List **когда нет срочных должников сегодня**. Если есть должники — Call List как раньше, расписание идёт второй вкладкой.

**API:** `GET /api/dashboard/portfolio/schedule`

#### Переключатель (2 вкладки):

```
[📞 Обзвон сегодня  3]  [🗓 Расписание  16]
```

- Число на таб = количество элементов
- Красная точка на «Обзвон» если есть overdue

#### Расписание:

```
РАСПИСАНИЕ НА 04 ИЮНЯ 2026        16 звонков  [← Вчера] [Завтра →]
─────────────────────────────────────────────────────────────────────
09:00  Турымшаева А.     💀 8 дней без контакта    +48 750 ₸  [HIGH]
       «Алимахан, добрый день. По вашему делу...»
       [✓ Позвонил]  [→ Карточка]

09:30  Ким А.            🔴 Пенсия завтра           +47 125 ₸  [HIGH]
       «Завтра ваша пенсия — хотел уточнить...»
       [✓ Позвонил]  [→ Карточка]

10:00  Нурова С.         🟡 Обещала 5 июня          +41 250 ₸  [HIGH]
       «Вы говорили что оплатите 5 июня — всё в силе?»
       [✓ Позвонил]  [→ Карточка]

10:30  Петров В.         🟡 3 дня — пора            +12 500 ₸  [MED]
       «Добрый день, звоню по вашему делу»
       [✓ Позвонил]  [→ Карточка]
       ...
```

**Детали строки:**

Левая часть:
- Время слота (DM Mono, amber)
- ФИО + Phone (кликабельный телефон)
- Причина контакта (иконка + текст)
- Script hint (курсив, text-secondary, 1 строка)

Правая часть:
- Комиссия `+X ₸` (green если есть платёж в ожидании, text-muted иначе)
- Priority badge: `[HIGH]` red / `[MED]` amber / `[LOW]` text-muted

**Кнопка «✓ Позвонил»:**
- POST `/api/dashboard/portfolio/contact-confirm` `{ client_id }`
- Строка приглушается (opacity 0.4), добавляется green checkmark
- Счётчик «звонков сделано» в заголовке увеличивается
- НЕ вылетает из списка (в отличие от call list) — менеджер видит весь план дня

**«Забытые» — красный блок внизу если есть:**

```
────────────────────────────────────────────────
⚠ НЕ ПОПАЛИ В РАСПИСАНИЕ (7 дней+)
  Сидоров Б.     11 дней без контакта    [Добавить сегодня]
  Марков А.       9 дней без контакта    [Добавить сегодня]
```

«Добавить сегодня» → вставляет клиента в расписание следующим доступным слотом.

---

### Счётчик прогресса дня (новый, под расписанием)

```
Контакты сегодня:  ████████░░░░░░░░  5 из 16
Высокий приоритет: ██████░░░░░░░░░░  3 из 5  ← это важнее
```

Два прогресс-бара. Когда все HIGH закрыты → green сообщение «✓ Все приоритетные звонки сделаны».

---

### Новый виджет в ЗОНЕ 3 — «Портфель по сегментам»

Добавить четвёртый блок в правую аналитическую колонку (под «Пенсия · ЗП · скоро»):

```
ПОРТФЕЛЬ · СЕГМЕНТЫ
────────────────────────────────────
Пенсионеры  12 кл  8 478 ₸/кл  [cyan bar 60%]
Зарплата     7 кл  6 250 ₸/кл  [cyan bar 35%]
Другое       4 кл  3 100 ₸/кл  [cyan bar 20%]
────────────────────────────────────
Лучший возраст: 65–75 лет  avg 9 200 ₸
```

Каждая строка — CSS flex bar, не recharts.

---

## ЧАСТЬ 3 — ТЕХНИЧЕСКИЕ ДЕТАЛИ

### Определение «последнего контакта»

```typescript
// В сервисе portfolioIntelligence.ts
// last_contact_at = максимальная дата event_date из case_timeline
// где event_type IN ('FIRST_CONTACT', 'CONSULTATION', 'MANAGER_NOTE', 'PAYMENT_RECEIVED')
// AND source IN ('manager', 'contact_confirm')
// AND client_id = X

const lastContact = await db
  .select({ event_date: caseTimeline.eventDate })
  .from(caseTimeline)
  .where(
    and(
      eq(caseTimeline.clientId, clientId),
      inArray(caseTimeline.eventType, [
        'FIRST_CONTACT', 'CONSULTATION', 'MANAGER_NOTE', 'PAYMENT_RECEIVED'
      ])
    )
  )
  .orderBy(desc(caseTimeline.eventDate))
  .limit(1);
```

### `contact-confirm` endpoint

```typescript
// POST /api/dashboard/portfolio/contact-confirm
// body: { client_id: number, note?: string }
//
// Действия:
// 1. recordTimelineEvent({ eventType: 'MANAGER_NOTE', source: 'contact_confirm',
//    title: 'Контакт подтверждён', description: note ?? 'Звонок по расписанию' })
// 2. Инвалидировать кеш schedule + contacts
// 3. return { last_contact_at: now, days_since_contact: 0, contact_health: 'fresh' }
```

### Frontend: `usePortfolioData()`

```typescript
// Загрузка при маунте дашборда (параллельно с revenue)
const [metrics, contacts, schedule, growth] = await Promise.all([
  fetch('/api/dashboard/portfolio/metrics'),
  fetch('/api/dashboard/portfolio/contacts'),
  fetch('/api/dashboard/portfolio/schedule'),
  fetch('/api/dashboard/portfolio/growth'),
]);

// После contact-confirm: инвалидировать contacts + schedule
// (не metrics — он меняется реже)
```

### Хранение конфига контактного цикла

Добавить в `revenue_config` (или отдельная таблица `app_settings`):

```sql
-- Уже есть таблица app_settings или settings
-- Добавить ключи:
contact_cycle_days = 3          -- как часто касаться клиента
work_hours_per_day = 8          -- рабочих часов
work_days_per_month = 22        -- рабочих дней
schedule_start_hour = 9         -- начало расписания
schedule_slot_minutes = 30      -- длина слота
max_slots_per_day = 16          -- максимум звонков в день
```

Можно конфигурировать через `/settings` (позже). Пока — хардкод с возможностью переопределить через переменные окружения.

---

## Порядок реализации

1. `portfolioIntelligence.ts` — сервис (метрики + контакты + расписание + прогноз)
2. API эндпоинты в `dashboard.ts` или новый `portfolioDashboard.ts`
3. `PortfolioBar.tsx` — зона 0 на дашборде
4. `DaySchedulePanel.tsx` — расписание с кнопкой «Позвонил»
5. Виджет сегментов в зоне 3
6. Интеграция: кнопка «Позвонил» → POST → инвалидация

---

## Что НЕ делать

- Не удалять существующий Call List — он работает параллельно с расписанием
- Не вводить отдельную таблицу «контакты» — писать в существующий `case_timeline`
- Не делать AI-запрос к DeepSeek для script_hint — только шаблоны (дёшево и быстро)
- Не менять серверный код карточки клиента

---

*Lichka CRM · Portfolio Intelligence · Sprint 24 · 04.06.2026*
