# Источник данных стран (mock)

Файл `mock/mock_app_data.json` — **фикстура для Фазы 1** (фронт работает на ней без бэкенда).

## Откуда данные
20 карточек стран в массиве `countries` выведены из РЕАЛЬНОЙ базы канала «Где Жить»:

```
d:/DeepReserch/pipeline/telegram_gde_zhit/state/sources/*.md
```

Каждый `.md` имеет frontmatter: `country_ru, visa_free_days, visa_pattern, mir_works,
unionpay_works, tags, critical_change_2026` (+ бюджет в теле). Маппинг в формат карточки
MASTER-SPEC §4.4 (`risk` ← `critical_change_2026`, `budget_month_usd` ← «бюджет 1 чел.»).
Файл `internal-passport-only.md` пропущен (это не страна).

## Канонический производитель — Сессия 1
`fit_score`, `headline`, `why[]`, `segments`, `score_tier` в проде считает **rule-based scorer**
бота (`gde-zhit-funnel/core/scorer.py`), БЕЗ LLM. Эта фикстура лишь повторяет ФОРМАТ §4.4,
чтобы фронт строился параллельно. При стыковке (Фаза 2) `/api/result` и `/api/countries`
отдаёт реальный бэкенд — формат карточки идентичен, поэтому фронт не меняется.

## Консистентность
`result_hot.top_countries` (Грузия/Армения/Сербия/Казахстан) — это те же объекты из массива
`countries`, поэтому одна и та же страна показывает одинаковые цифры на экранах «Подбор» и
«Страны». `fit_score` топ-4 закреплены: 94 / 88 / 81 / 76.

## Фиксированные коды (20)
georgia · armenia · serbia · kazakhstan · uzbekistan · thailand · vietnam · paraguay ·
malaysia · brazil · philippines · montenegro · argentina · bali · panama · cyprus · uae ·
mexico · israel · turkey
