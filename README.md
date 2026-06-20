# Где Жить — Telegram Mini App (витрина подбора страны)

Красивая витрина результата подбора страны для воронки «Где Жить» (YouTube → бот-квалификатор
→ подбор страны). Vanilla JS, без сборщика. Дизайн-язык — «Паспорт»/досье (числа и вердикты,
тёмные ink-navy плашки + золотой акцент).

Контракт: `gde-zhit-build/MASTER-SPEC.md` §4. Эта папка = Сессия 2 (фронт).

## Экраны
- **Подбор** (`#result`) — карточки топ-3-5 стран (флаг, балл-печать, бюджет, виза, риск,
  why-буллеты) + tier-бейдж 🔥/🌡/❄️ + блок сегмента (CTA по `segments`). Фолбэк, если подбор
  не пройден.
- **Страны** (`#countries`) — все 20 стран с фильтром (лёгкий/средний/сложный вход) и
  сортировкой (балл/бюджет/виза).
- **Билеты** (`#calc`) — калькулятор перелёта: откуда/куда/дата → цена + промокод + ссылка.
- **Отчёт** (`#report`) — сохранённый подбор (localStorage) + «поделиться».

## Запуск локально

**Просто фронт на встроенном моке** (как на GitHub Pages):
```
python -m http.server 8000   # из папки gde-zhit-app/
# открыть http://localhost:8000/
```
`BASE_URL = 'MOCK'` → апка тянет `mock/mock_app_data.json`, бэкенд не нужен.

**С локальным бэкендом (fetch-path parity)** — проверить LIVE-режим до Railway:
```
python mock/mock_server.py            # http://localhost:8787
# в main.js: BASE_URL = 'http://localhost:8787'
```

Демо-флаги: `?mock=empty` — показать экран-фолбэк; `?debug` — лог событий в консоль.

## Переключение на прод (Фаза 2)
Единственная правка — `BASE_URL` в начале `main.js`:
```js
export const BASE_URL = 'https://<railway>.up.railway.app';  // из gde-zhit-funnel/CONTRACT.md
```
После этого внутри Telegram апка работает с реальным бэкендом (валидация initData по HMAC).

## Деплой
GitHub Pages (branch `main` / root). URL: `https://ilshatsharapov69-afk.github.io/gde-zhit-app/`.
`.nojekyll` обязателен (иначе Pages пропустит `views/`). Все пути относительные (`./`).

## Структура
```
index.html            — вход (+ telegram-web-app.js, шрифты)
main.js               — CONFIG (BASE_URL вверху), Telegram-мост, роутер, таб-бар
api.js                — fetch-слой (Authorization: tma initData, MOCK-режим, 401→фолбэк, телеметрия)
views/result.js       — витрина + общий CountryCard + сегмент-CTA + фолбэк
views/countries.js    — меню стран (фильтр/сортировка)
views/calc.js         — калькулятор перелёта
views/report.js       — сохранённый отчёт + поделиться
style.css             — дизайн-система «Паспорт»
mock/mock_app_data.json — фикстура (result_hot/result_empty/countries/calc_example)
mock/mock_server.py   — локальный бэкенд (fetch-path parity)
data/COUNTRIES-DATASET-NOTE.md — откуда данные стран
```
