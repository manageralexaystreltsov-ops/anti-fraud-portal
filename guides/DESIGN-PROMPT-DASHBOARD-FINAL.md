# Промт для кодера — Дашборд «Мой доход» ФИНАЛЬНАЯ ВЕРСИЯ
## Lichka CRM · `client/src/pages/Dashboard.tsx` + дочерние компоненты

---

## Контекст

Это **не редизайн с нуля** — это точная спецификация того что должно быть на экране,
основанная на реальном коде сервера. Каждая цифра привязана к конкретному API и полю.

**Главное правило:** не придумывай формулы — они уже есть в сервере.
Бери данные из API как есть, только рендери правильно.

---

## Архитектура страницы (итог)

```
┌──────────────────────────────────────────────────────────────────┐
│  ЗОНА 0 — ПОРТФЕЛЬ  (новая, ~120px)                              │
│  Здоровье · Ценность · ₸/час факт · До цели · Сценарии          │
├──────────────────────────────────────────────────────────────────┤
│  ЗОНА 1 — КОМАНДНАЯ СТРОКА  (~160px)                             │
│  Собрать сегодня · Факт сегодня · Фаза · До цели месяца          │
├────────────────────────────────┬─────────────────────────────────┤
│  ЗОНА 2L — ЗВОНКИ  (левая)    │  ЗОНА 2R — АНАЛИТИКА (правая)   │
│  [Обзвон] [Расписание]        │  Гонка · Факт vs Портфель        │
│                                │  Сегменты · Пенсии скоро         │
└────────────────────────────────┴─────────────────────────────────┘
```

Все зоны на одном экране 1280px без скролла. На мобиле — вертикальный стек.

---

## API — полный список для дашборда

```
GET /api/dashboard/plan-fact          → основной блок план/факт
GET /api/dashboard/revenue            → снимок + фазы (совместимость)
GET /api/dashboard/revenue-config     → настройки (цель $, ставка 25%)
GET /api/dashboard/call-list          → обзвон
GET /api/dashboard/phase-chart        → данные для гонки фазы
GET /api/dashboard/revenue-opportunities → топ возможностей
GET /api/dashboard/war-room           → обещания, без контакта, топ остатков
GET /api/dashboard/portfolio-overview → расписание, сегменты, контакты
POST /api/dashboard/ack               → закрыть элемент обзвона
POST /api/dashboard/portfolio/contact-confirm → отметить звонок в расписании
PUT /api/dashboard/revenue-config     → изменить цель $
```

Загружать параллельно: `plan-fact` + `revenue-config` + `call-list` при маунте.
`phase-chart`, `war-room`, `portfolio-overview` — ленивая загрузка при первом рендере зоны.

---

## ЗОНА 0 — Портфель

**Компонент:** `<PortfolioBar />`
**API:** `GET /api/dashboard/portfolio-overview`

Одна горизонтальная полоса из 5 блоков. Высота ~120px. Фон `--bg-card`, нижняя граница `--border`.

### Блок 1 — Здоровье портфеля

```
ПОРТФЕЛЬ
━━━━━━━━━━━━━━━━━━━━━
23 клиента
🟢12  🟡6  🔴3  ⚫2
св   пора  проср  забыт
```

Данные из `portfolio-overview.contact_health_summary`:
- `fresh` (0–2 дня) → green число
- `due` (3 дня) → amber число
- `overdue` (4–6 дней) → red число
- `critical` (7+ дней) → muted число + пульсирующая красная точка если > 0

Клик на любое число → фильтрует расписание в зоне 2L.

### Блок 2 — Ценность портфеля

```
ПОРТФЕЛЬ · КОМИССИЯ
━━━━━━━━━━━━━━━━━━━
195 000 ₸   всего
  8 478 ₸   на клиента
```

Данные из `portfolio-overview.metrics`:
- `total_portfolio_commission_kzt` — общая потенциальная комиссия
- `avg_commission_per_client_kzt` = `total / total_active_clients`

Формула: `SUM(client_remaining) × commission_rate` по всем активным клиентам.

### Блок 3 — Твой час (ФАКТ)

```
₸/ЧАС · ФАКТ
━━━━━━━━━━━━━
6 494 ₸
с 1 июня · 37.5 ч
```

Данные из `plan-fact.hourly_rate_kzt` и `plan-fact.hours_worked_month`.

**Формула из сервера:**
```
hourly_rate_kzt = commission_month_fact / hours_worked_month
hours_worked_month = сумма рабочих часов 10:00–17:00 пн–пт с 1-го числа по сейчас
```

Это РЕАЛЬНЫЙ факт — не прогноз. Число считается от 0 (useCountUp).
Tooltip: «Отработано X ч с 1 числа».

### Блок 4 — До цели $

```
ДО ЦЕЛИ $2 000
━━━━━━━━━━━━━━━━
+17 клиентов
Пенсионеры 65–75 лет
[+ Добавить клиента]
```

Данные из `portfolio-overview.growth`:
- `clients_to_add` — сколько нужно добавить при текущем avg
- `best_segment` + `best_age_range` — лучший профиль

Цвет `clients_to_add`: red > 10, amber 5–10, green ≤ 5.

### Блок 5 — Сценарии роста

```
+5 кл  → $2 250/мес
+10    → $2 500/мес
+20    → $3 000/мес
```

Данные из `portfolio-overview.growth.scenarios`.
Строка ближайшая к цели — cyan.

---

## ЗОНА 1 — Командная строка

**Компонент:** `<RevenueCommandBar />`
**API:** `GET /api/dashboard/plan-fact` (основной) + `GET /api/dashboard/revenue` (фаза)

### Блок 1 — «Собрать сегодня»  ← ГЛАВНЫЙ

```
СОБРАТЬ СЕГОДНЯ
━━━━━━━━━━━━━━━━━━━━━━
  240 000 ₸             ← amber, DM Mono, 48px
  
  Осталось сборов ÷ 18 рабочих дней
  База: 240 000 ₸
  Комиссия: 60 000 ₸   ← green, 14px
```

Данные из `plan-fact`:
- `daily_collections_kzt` = `remaining_collections / workdays_left`
- `daily_commission_kzt` = `daily_collections × commission_rate`
- `workdays_left` — будние дни до конца месяца включая сегодня

**Важно:** это ПЛАН, не «долг». Просто сколько нужно собрать сегодня чтобы прийти к цели.
Если уже собрали больше базы сегодня — показать green «✓ Дневная цель выполнена».

Прогресс-бар под числом:
```
Сегодня: ██░░░░░░  21%   (collected_today / daily_collections)
```
Цвет: green ≥ 50%, amber 20–50%, red < 20%.

### Блок 2 — «Факт сегодня»

```
СОБРАНО СЕГОДНЯ
━━━━━━━━━━━━━━━━
  50 000 ₸          ← green
  Комиссия: 12 500 ₸
  2 оплаты
```

Данные из `plan-fact`:
- `collected_today_kzt` — SUM PAYMENT_RECEIVED за сегодня
- `commission_today_kzt` = collected × rate
- `payments_today_count`

Число считается от 0 при загрузке.

### Блок 3 — «Фаза»

```
ФАЗА 1 · дни 1–15    ← cyan рамка если активна
━━━━━━━━━━━━━━━━━━━━
День 5 из 15
█████░░░░░░░░░░  33%
```

Данные из `revenue.active_phase`, `revenue.phase_day`, `revenue.phase_days_total`.
Три точки-индикатора: ● ○ ○ (активная — заполнена cyan).

### Блок 4 — «До цели месяца»

```
ЦЕЛЬ МЕСЯЦА · $2 000
━━━━━━━━━━━━━━━━━━━━
  1 067 500 ₸  осталось
  ██░░░░░░░░░  1.2%
  
  Цель: 1 080 000 ₸ / $2 000
  [Изменить цель →]
```

Данные из `plan-fact`:
- `remaining_commission_kzt` = `target_commission - commission_month_fact`
- `commission_month_fact` / `target_commission_month_kzt` → процент прогресса
- `target_monthly_usd` из `revenue-config`

Кнопка «Изменить цель» → inline форма: input[$], blur → `PUT /api/dashboard/revenue-config { targetMonthlyUSD }` → обновить все блоки.

---

## ЗОНА 2L — Звонки (левая колонка)

**Компонент:** `<CallsPanel />`

Два таба:

```
[📞 Обзвон  N]  [🗓 Расписание  N]
```

Красная точка на «Обзвон» если есть overdue-должники.
По умолчанию активен «Обзвон» если есть элементы, иначе «Расписание».

---

### Таб «Обзвон»

**API:** `GET /api/dashboard/call-list`

Заголовок:
```
ОБЗВОН НА СЕГОДНЯ        Осталось: 207 500 ₸
```

«Осталось» = `daily_collections_kzt - collected_today_kzt` (не уходит в минус).

**Карточка клиента:**

```
┌──────────────────────────────────────────────────┐
│ [border-left: цвет]                              │
│  Турымшаева А.              Просрочка · 3 дня    │
│  +7 701 349 25 61  [📋 копировать]               │
│  Должна: 195 000 ₸  →  +48 750 ₸ комиссии       │
│                                                  │
│  [▼ Сценарий взыскания]   [✓ Забрал]            │
└──────────────────────────────────────────────────┘
```

`border-left` цвет:
- `days_overdue > 3` → red, 3px
- `days_overdue 1–3` → amber, 3px
- срок сегодня → cyan, 3px

Данные из `call-list[]`:
- `full_name`, `phone`
- `amount_kzt` = `client_remaining` (остаток по заказам)
- `commission_kzt` = `amount_kzt × commission_rate`
- `days_overdue`, `reason`

**«Сценарий взыскания» — accordion (не модалка):**

API: `GET /api/dashboard/collection-scenario/:orderId`

```
▼ Сценарий взыскания
  ─────────────────────────────────────────────
  МЯГКИЙ:  «Алимахан, добрый день. Хотел уточнить
            по вашему делу...»        [Отправил soft]
  ЖЁСТКИЙ: «У нас просрочка по договору...»
                                      [Отправил hard]
```

`[Отправил soft/hard]` → POST `.../sent` → фиксирует вариант.

**«✓ Забрал»:**
1. Добавить CSS `animation: slideOutRight 300ms ease-in`
2. После 300ms → POST `/api/dashboard/ack` `{ item_id, client_id, ack_type: 'done' }`
3. Убрать из списка
4. Уменьшить «Осталось» на `amount_kzt`
5. Звук (если включён): `Web Audio API, 800Hz, 80ms`

**Счётчик прогресса под списком:**
```
Закрыто:  ████████░░  5 из 12
```

Когда 100% → зелёное сообщение «✓ Обзвон выполнен», показать «Расписание →».

---

### Таб «Расписание»

**API:** `GET /api/dashboard/portfolio-overview`

Заголовок:
```
РАСПИСАНИЕ · 04 ИЮНЯ 2026      16 звонков  [← Вчера] [Завтра →]
```

Навигация по датам: `?date=2026-06-05` в API запросе.

**Строка расписания:**

```
10:00  Турымшаева А.  💀 8 дней без контакта  +48 750 ₸  [HIGH]
       «Алимахан, завтра пенсия — хотел уточнить...»
       [✓ Позвонил]  [→ Карточка]
```

Поля из `portfolio-overview.schedule.slots[]`:
- `time_slot` — время (DM Mono, amber)
- `client_name`, `phone`
- `reason` — причина контакта
- `script_hint` — курсив, text-secondary
- `expected_commission_kzt` — green если есть ожидаемый платёж
- `priority` → badge `[HIGH]` red / `[MED]` amber / `[LOW]` muted

Иконка перед reason:
- `contact_health = 'critical'` (7+д) → 💀
- `contact_health = 'overdue'` (4–6д) → 🔴
- `contact_health = 'due'` (3д) → 🟡
- `has_upcoming_income` → 💰
- `has_promise` → 🤝

**«✓ Позвонил»:**
1. POST `/api/dashboard/portfolio/contact-confirm` `{ client_id, note?: '' }`
2. Строка приглушается (opacity 0.45) + green checkmark
3. Строка **не уходит** — план дня должен оставаться виден весь день
4. Счётчик «позвонил N из 16» в заголовке растёт

**Прогресс-бары под расписанием:**
```
Всего:    ████████░░░░░░  5 из 16
Срочные:  ██████░░░░░░░░  3 из 5   ← важнее
```

Когда все HIGH закрыты → «✓ Все приоритетные звонки сделаны» (green).

**Блок «Забытые» (если есть `forgotten[]`):**
```
─────────────────────────────────────────────────────
⚠ НЕ В РАСПИСАНИИ (7+ дней)
  Сидоров Б.   11 дней без контакта  [Позвонить сейчас →]
```

«Позвонить сейчас» → добавляет слот вне расписания, POST contact-confirm.

---

## ЗОНА 2R — Аналитика (правая колонка)

Три блока стопкой.

### Блок A — Гонка · Фаза

**API:** `GET /api/dashboard/phase-chart`

```
ГОНКА · ФАЗА 1              День 5 · 10 дней до конца
────────────────────────────────────────────────────────
              СБОРЫ         КОМИССИЯ
 Сегодня
  план:     240 000 ₸       60 000 ₸
  факт:      50 000 ₸       12 500 ₸
  Δ:        -190 000 ₸     -47 500 ₸  ← red

 Месяц
  план:   4 320 000 ₸    1 080 000 ₸
  факт:      50 000 ₸       12 500 ₸
  Δ:      -4 270 000 ₸  -1 067 500 ₸  ← red

Дни:  ▪ ▪ ▪ ▪ ▪ ▫ ▫ ▫ ▫ ▫ ▫ ▫ ▫ ▫ ▫
      1  2  3  4  5  6  ...         15
```

Поля из `phase-chart`:
- `plan_today_collections`, `fact_today_collections`
- `plan_month_collections` = `target_collections_month_kzt`
- `fact_month_collections` = `collected_month_kzt`
- Δ: красный если отставание, зелёный если перевыполнение

Полоска дней:
- Прошедшие с оплатой → cyan квадрат
- Прошедшие без оплаты → dark квадрат
- Сегодня → amber с пульсацией
- Будущие → тёмные

**Важно:** показываем ДВЕ колонки — сборы и комиссию. Не путать.

### Блок B — Факт vs Портфель

**API:** `GET /api/dashboard/plan-fact` + `GET /api/dashboard/war-room`

```
ФАКТ · КОМИССИЯ             ПОРТФЕЛЬ · ЕСЛИ ЗАКРЫТЬ
────────────────────────────────────────────────────
Сегодня   12 500 ₸         Сегодня     48 750 ₸
Неделя    12 500 ₸         Неделя     126 875 ₸
Месяц     12 500 ₸         Месяц      195 000 ₸
────────────────────────────────────────────────────
Портфель: 780 000 ₸ сборов · Комиссия 195 000 ₸
```

Поля из `plan-fact`:
- `commission_today_kzt`, `commission_week_kzt`, `commission_month_fact`

Поля из `war-room` (или `portfolio-overview`):
- `potential_today_commission_kzt` — обещания + просрочки срок сегодня
- `potential_week_commission_kzt` — до конца недели
- `potential_month_commission_kzt` — всё что в портфеле на месяц
- `portfolio_remaining_kzt` — SUM остатков по заказам

Факт — green. Портфель — amber.

**Разрыв = «работа на сегодня»:**
```
Разрыв: 182 500 ₸ комиссии
— деньги есть в портфеле, нужны звонки
```
Показывается только если `portfolio > 5 × commission_today`. Cyan текст.

### Блок C — Сегменты портфеля

**API:** `GET /api/dashboard/portfolio-overview`

```
ПОРТФЕЛЬ · СЕГМЕНТЫ
────────────────────────────────────
Пенсионеры  12  9 200 ₸/кл  ████████ 60%
Зарплата     7  6 250 ₸/кл  █████    35%
Другое       4  3 100 ₸/кл  ██       20%
────────────────────────────────────────
Лучший профиль: Пенсионеры 65–75 лет
```

Бары — чистый CSS flex, не recharts. Ширина = `avg_value / max_avg_value × 100%`.

### Блок D — Скоро деньги у клиентов

**API:** `GET /api/dashboard/war-room` (секция `upcoming_income`)

```
СКОРО ДЕНЬГИ У КЛИЕНТОВ
────────────────────────────────────
🗓 Сегодня   Нурова С.   Пенсия   165k ₸
🗓 5 июня    Ким А.       ЗП      200k ₸
🗓 7 июня    Петров В.    Выплата   85k ₸
```

Клик → открывает карточку клиента.
«Сегодня» → cyan подсветка строки.

---

## Мотивационные механики

### 1. Streak — серия выполненных дней

```typescript
// localStorage: 'revenue_streak' = { count: 3, last_date: '2026-06-04' }
// Условие выполнения дня: collected_today >= daily_collections * 0.8
// При маунте: проверить last_date
//   если вчера → streak++
//   если позавчера+ → streak = 0
//   если сегодня → без изменений
```

Показывать в правом верхнем углу командной строки:
```
🔥 3 дня подряд
```

### 2. Звук при «Забрал»

Кнопка-тогл 🔇/🔊 в углу (localStorage `sound_enabled`):
```typescript
// Web Audio API — при каждом успешном ack
function playSuccessSound() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.frequency.value = 800;
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
  osc.start(); osc.stop(ctx.currentTime + 0.08);
}
```

### 3. Цвет фона командной строки по прогрессу дня

```typescript
// progress = collected_today / daily_collections (0..1)
// Тонкий оверлей поверх --bg-card:
// 0%    → rgba(239, 68, 68, 0.04)   // едва красноватый
// 50%   → rgba(0, 0, 0, 0)          // нейтральный
// 100%  → rgba(16, 185, 129, 0.06)  // едва зеленоватый
```

### 4. Анимации чисел

```typescript
function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) return;
    const start = Date.now();
    const frame = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(Math.floor(target * eased));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [target, duration]);
  return value;
}
```

Применять к: главной цифре командной строки, `₸/час`, `commission_month_fact`.

---

## Форматирование чисел

```typescript
// 1080000 → '1 080 000 ₸'
function formatKzt(n: number): string {
  return Math.round(n).toLocaleString('ru-RU') + ' ₸';
}

// 173800000 → '173.8M ₸'  (для больших чисел)
function formatKztShort(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M ₸';
  if (n >= 1_000) return Math.round(n / 1_000) + 'k ₸';
  return n + ' ₸';
}

// 2000 → '$2 000' (с пробелом-разделителем)
function formatUsd(n: number): string {
  return '$' + Math.round(n).toLocaleString('ru-RU');
}

// Прогресс 0..1 → цвет CSS переменной
function progressColor(ratio: number): string {
  if (ratio >= 0.5) return 'var(--accent-green)';
  if (ratio >= 0.2) return 'var(--accent-amber)';
  return 'var(--accent-red)';
}
```

---

## Структура компонентов

```
client/src/pages/Dashboard.tsx           ← главный, оркестрирует загрузку
client/src/components/dashboard/
  PortfolioBar.tsx                        ← зона 0 (новая)
  RevenueCommandBar.tsx                   ← зона 1
  CallsPanel.tsx                          ← зона 2L (оба таба)
    CallCard.tsx                          ← карточка в обзвоне
    CollectionScenarioDrawer.tsx          ← accordion сценарий
    ScheduleSlot.tsx                      ← строка расписания
  AnalyticsColumn.tsx                     ← зона 2R
    PhaseRacePanel.tsx                    ← блок A
    EarnedVsPortfolioPanel.tsx            ← блок B (переименован)
    PortfolioSegmentsPanel.tsx            ← блок C (новый)
    UpcomingIncomePanel.tsx               ← блок D
  GoalEditor.tsx                          ← inline редактор цели $
```

---

## Загрузка данных

```typescript
// Dashboard.tsx
const { data: planFact } = useSWR('/api/dashboard/plan-fact', { refreshInterval: 60_000 });
const { data: config }   = useSWR('/api/dashboard/revenue-config');
const { data: callList } = useSWR('/api/dashboard/call-list', { refreshInterval: 30_000 });

// Ленивая загрузка — только при видимости зоны:
const { data: phaseChart }  = useSWR(zoneVisible ? '/api/dashboard/phase-chart' : null);
const { data: warRoom }     = useSWR(zoneVisible ? '/api/dashboard/war-room' : null);
const { data: portfolio }   = useSWR(zoneVisible ? '/api/dashboard/portfolio-overview' : null);

// После ack: мутировать call-list локально + инвалидировать plan-fact
mutate('/api/dashboard/call-list', removeItem);
mutate('/api/dashboard/plan-fact');
```

Если SWR не используется — заменить на простой `fetch` + `useState` + `useEffect`.

---

## Адаптив

| Ширина | Зона 0 | Зона 1 | Зоны 2L+2R |
|--------|--------|--------|------------|
| ≥ 1280px | 5 блоков в ряд | 4 блока в ряд | 2 колонки 50/50 |
| 768–1279px | 3+2 блока | 2+2 блока | 1 колонка, 2R под 2L |
| < 768px | вертикальный стек | вертикальный стек | вертикальный стек |

На мобиле: расписание — основной вид, обзвон — второй таб.

---

## Что НЕ делать

- Не использовать recharts или другие чарт-библиотеки — все бары через CSS flex
- Не показывать `pace_potential.month` в блоке «Факт» — это прогноз, не факт
- Не путать план сборов (4.32M) с планом комиссии (1.08M) — всегда показывать оба
- Не вычислять формулы на фронте — брать готовые числа из API
- Не добавлять новые npm-зависимости
- Не трогать серверный код

---

## Ключевые числа для проверки (пример: $2000, 5 июня, факт = 0)

| Поле API | Значение | Откуда |
|----------|----------|--------|
| `target_commission_month_kzt` | 1 080 000 ₸ | 2000 × 540 |
| `target_collections_month_kzt` | 4 320 000 ₸ | 1 080 000 / 0.25 |
| `workdays_left` | ~18 | будних дней до 30 июня |
| `daily_collections_kzt` | ~240 000 ₸ | 4 320 000 / 18 |
| `daily_commission_kzt` | ~60 000 ₸ | 240 000 × 0.25 |
| `collected_today_kzt` | 0 | нет оплат |
| `commission_month_fact` | 0 | нет оплат |
| `remaining_commission_kzt` | 1 080 000 ₸ | 1 080 000 − 0 |

Если цифры на UI не совпадают с этой таблицей — смотреть `plan-fact` ответ в DevTools.

---

*Lichka CRM · Dashboard Final Spec · Sprint 24 · 05.06.2026*
