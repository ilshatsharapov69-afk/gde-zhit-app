# Где Жить — Telegram Mini App «Карта доступа» (лид-магнит)

Интерактивная карта релокационных услуг для воронки «Где Жить» (перезапуск: концьерж услуг, а не «подбор страны»).
Vanilla JS, без сборщика. Дизайн-язык — «Паспорт» (тёмный ink-navy + золото).

Один экран: выбери **ЗАДАЧУ** (12 кластеров-чипов, money-first) → **карта мира** подсвечивает страны с доступом →
тап страны (на карте ИЛИ в ряду чипов-стран) = **карточка-тизер** (обобщённые возможности + факт + 🔒) →
кнопка **«Проверить мой случай»** = deep-link в бота `t-<cluster>-<ISO>`.
Принцип «недоговоренность»: карту (ценность) даём, персоналку/цену/контакты партнёров — нет → переход в бота.

Контракт: `../gde-zhit-rework/MASTER-SPEC-v2.md` §3 (cluster-ключи, ISO-2, deep-link) и §5 (апка).

## Структура

```
index.html        — вход (telegram-web-app.js, шрифты, vendor/jsVectorMap, style.css + map.css)
app-map.js         — вся логика: TG-мост, карта (jsVectorMap), чипы, тизер, deep-link
map.css            — стили «Карта доступа» (наследует токены --gzh-* из style.css)
map_data.json      — СТАТИЧЕСКИЕ данные карты (сгенерены build_map_data.py)
build_map_data.py  — генератор данных из partners.json + базы 21 страны (данно-управляемо)
vendor/            — jsVectorMap v1.7.0 (MIT), вендорнут локально (без CDN-зависимости/MITM)
style.css          — база «Паспорт» (общие токены + .btn/.flag-img)
index-legacy.html  — СТАРАЯ апка «подбор страны» (сохранена, не удалять)
views/, main.js, api.js, mock/ — старый country-picker (не загружается index.html, оставлен)
```

## Данные карты (данно-управляемо)

`map_data.json` НЕ редактируется руками — генерится:
```
python build_map_data.py        # из gde-zhit-app/
```
Источник: `../research/2026-06-21_relocation-services-partners/partners.json` (308 партнёров) +
frontmatter базы 21 страны (`../pipeline/telegram_gde_zhit/state/sources/*.md`).
`category → cluster` маппинг + 2 keyword-сплита (housing-education→housing/study,
relocation-logistics→logistics/travel) + словарь RU→ISO-2. `credit` исключён (DISABLED §3.1).
Факты «softened» — суммы/проценты/сроки статуса вырезаны (недоговоренность). Новые партнёры/страны
(в т.ч. параллельный доп-поиск work) появляются на карте сами при ре-ране.

## Запуск локально
```
python -m http.server 8011      # из gde-zhit-app/
# открыть http://localhost:8011/
```
Карта самодостаточна — бэкенд не нужен. Вне Telegram CTA открывает t.me-ссылку в новой вкладке.

## Деплой
GitHub Pages (branch `main`, root). URL: `https://ilshatsharapov69-afk.github.io/gde-zhit-app/`.
`.nojekyll` обязателен (иначе Pages пропустит `vendor/`/`views/`). Все пути относительные (`./`).
```
git add -A && git commit -m "…" && git push   # Pages задеплоит сам
```

## Связка с воронкой
- Бот: `@gde_zhit_YT_bot` (Сессия 1, `../gde-zhit-funnel/`). Парсит `t-<cluster>-<ISO>` (из карты) и `src-<channel>` (атрибуция).
- Карта = menu-button WebApp на этом Pages-URL (настраивает сессия бота).
