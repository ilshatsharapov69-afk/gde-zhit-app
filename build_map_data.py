# -*- coding: utf-8 -*-
"""
build_map_data.py — генератор данных для мини-апки «Карта доступа».

ДАННО-УПРАВЛЯЕМО: читает partners.json (разведка услуг) + frontmatter базы 21 страны
и собирает СТАТИЧЕСКИЙ map_data.json. Новые партнёры/страны (в т.ч. параллельный доп-поиск
work) появляются на карте сами при ре-ране — НИЧЕГО не хардкодим по странам.

Контракт (MASTER-SPEC-v2 §3):
  - cluster-ключи: birth business residence visa work finance docs housing invest logistics travel study
    (+ credit = DISABLED → исключаем)
  - ISO-3166 alpha-2 (хранение) + RU-имя (показ)
  - deep-link генерит апка: t-<cluster>-<ISO>

Запуск:  python build_map_data.py   (из папки gde-zhit-app/)
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PARTNERS = os.path.normpath(os.path.join(
    HERE, "..", "research", "2026-06-21_relocation-services-partners", "partners.json"))
SOURCES = os.path.normpath(os.path.join(
    HERE, "..", "pipeline", "telegram_gde_zhit", "state", "sources"))
OUT = os.path.join(HERE, "map_data.json")

# ── category (partners.json) → канонический cluster ────────────────────────
CAT2CL = {
    "birth-tourism": "birth",
    "business-relocation": "business",
    "residence-permit": "residence",
    "immigration-lawyers": "residence",   # консультанты ВНЖ/визы/гражданства → зонтик residence
    "visas": "visa",
    "work-abroad": "work",
    "relocant-finance": "finance",
    "invest-citizenship": "invest",
    "documents": "docs",
    "credit-broker": "credit",            # DISABLED — отфильтруется
}
# Две комбинированные категории расщепляем по ключевым словам offer/name:
KW_HOUSING_EDU = {
    "study":   ["учеб", "студен", "курс", "школ", "университ", "образов", "language", "school", "univ", "поступл"],
    "housing": ["жиль", "аренд", "недвиж", "квартир", "rent", "housing", "апарт", "дом"],
}
KW_LOGISTICS = {
    "travel":    ["авиабил", "билет", "страхов", "esim", "sim", "симкарт", "перелет", "перелёт", "flight", "insur", "связь"],
    "logistics": ["перевоз", "груз", "питом", "контейнер", "вещ", "переезд", "мебел", "cargo", "pet", "moving", "транспорт"],
}

def clusters_for(p):
    cat = p.get("category", "")
    if cat in CAT2CL:
        return [CAT2CL[cat]]
    blob = (p.get("offer", "") + " " + p.get("name", "")).lower()
    res = []
    if cat == "housing-education":
        for cl, kws in KW_HOUSING_EDU.items():
            if any(k in blob for k in kws):
                res.append(cl)
        return res or ["housing"]
    if cat == "relocation-logistics":
        for cl, kws in KW_LOGISTICS.items():
            if any(k in blob for k in kws):
                res.append(cl)
        return res or ["logistics"]
    return []  # неизвестная категория — игнор

# ── RU-имя → ISO-3166 alpha-2 ──────────────────────────────────────────────
# Не-страны (origin/регионы) намеренно отсутствуют → не красим на карте.
NON_COUNTRY = {"Глобально", "Россия", "ЕС", "Карибы", "Северный Кипр", "Весь мир", "Глобал"}
RU2ISO = {
    "Испания": "ES", "ОАЭ": "AE", "Португалия": "PT", "Турция": "TR", "Кипр": "CY",
    "Сербия": "RS", "Германия": "DE", "Грузия": "GE", "США": "US", "Франция": "FR",
    "Аргентина": "AR", "Греция": "GR", "Бразилия": "BR", "Венгрия": "HU", "Италия": "IT",
    "Польша": "PL", "Великобритания": "GB", "Таиланд": "TH", "Армения": "AM", "Канада": "CA",
    "Мальта": "MT", "Казахстан": "KZ", "Болгария": "BG", "Доминика": "DM",
    "Сент-Китс и Невис": "KN", "Черногория": "ME", "Антигуа и Барбуда": "AG", "Гренада": "GD",
    "Вануату": "VU", "Сент-Люсия": "LC", "Мексика": "MX", "Румыния": "RO", "Гонконг": "HK",
    "Сингапур": "SG", "Израиль": "IL", "Парагвай": "PY", "Чехия": "CZ", "Латвия": "LV",
    "Киргизия": "KG", "Эстония": "EE", "Панама": "PA", "Чили": "CL", "Австралия": "AU",
    "Австрия": "AT", "Нидерланды": "NL", "Китай": "CN", "Япония": "JP", "Узбекистан": "UZ",
    "Бельгия": "BE", "Литва": "LT", "Южная Корея": "KR", "Беларусь": "BY", "Уругвай": "UY",
    "Ирландия": "IE", "Финляндия": "FI", "Таджикистан": "TJ", "Швеция": "SE", "Украина": "UA",
    "Науру": "NR", "Египет": "EG", "Молдова": "MD", "Азербайджан": "AZ", "Индонезия": "ID",
    "Словения": "SI", "Коста-Рика": "CR", "Швейцария": "CH", "Саудовская Аравия": "SA",
    "Индия": "IN", "Вьетнам": "VN", "Босния и Герцеговина": "BA", "Дания": "DK",
    "Хорватия": "HR", "Словакия": "SK", "Малайзия": "MY", "Оман": "OM", "Новая Зеландия": "NZ",
    "Люксембург": "LU", "Сан-Томе и Принсипи": "ST", "Норвегия": "NO", "Катар": "QA",
    # алиасы базы 21 страны
    "Бали": "ID", "Филиппины": "PH", "Республика Корея": "KR",
}

# ── метаданные кластеров (label/emoji/tier/blurb + обобщённые буллеты тизера) ─
# Буллеты — ОБОБЩЁННЫЕ возможности (недоговоренность): что доступно, БЕЗ имён/цен партнёров.
HIGH = {"birth", "business", "residence", "work", "invest", "housing"}
CLUSTERS_META = {
    "birth":     ("🍼", "Родить за границей", "Гражданство ребёнку по праву почвы",
                  ["Гражданство ребёнку по рождению", "ВНЖ для родителей", "Сопровождение родов и документов"]),
    "work":      ("💼", "Работа за рубежом", "Трудоустройство и рабочая виза",
                  ["Поиск работы и вакансии", "Рабочая виза / релокейт-пакет", "Помощь с оформлением"]),
    "residence": ("🏠", "ВНЖ / переехать жить", "Вид на жительство и путь к гражданству",
                  ["ВНЖ / вид на жительство", "Путь к ПМЖ и гражданству", "Консультация иммиграционного юриста"]),
    "business":  ("🏢", "Бизнес за границей", "Компания и налоговое резидентство",
                  ["Регистрация компании", "Налоговое резидентство", "Бухгалтерия для релоканта"]),
    "invest":    ("💎", "Гражданство за инвестиции", "«Золотая виза» и паспорт за вложения",
                  ["ВНЖ / гражданство за инвестиции", "«Золотая виза»", "Сопровождение сделки"]),
    "housing":   ("🔑", "Жильё за рубежом", "Аренда и покупка недвижимости",
                  ["Аренда и покупка жилья", "Помощь с заселением", "Проверка и сопровождение сделки"]),
    "visa":      ("🛂", "Виза", "Оформление визы и въезд",
                  ["Оформление визы", "Поддержка с документами на въезд", "Запись и сопровождение"]),
    "finance":   ("💳", "Деньги и карты", "Зарубежный счёт и платежи",
                  ["Зарубежный счёт и карта", "Приём и вывод платежей", "Платёжные сервисы релоканта"]),
    "docs":      ("📄", "Документы", "Апостиль, перевод, легализация",
                  ["Апостиль и легализация", "Присяжный / нотариальный перевод", "Справки и истребование документов"]),
    "logistics": ("📦", "Переезд и вещи", "Перевозка вещей и питомцев",
                  ["Перевозка вещей и переезд", "Перевоз питомцев", "Грузоперевозка и таможня"]),
    "travel":    ("✈️", "Билеты и связь", "Авиабилеты, страховка, eSIM",
                  ["Авиабилеты и страховка", "eSIM и связь в поездке", "Сервисы для дороги"]),
    "study":     ("🎓", "Учёба за рубежом", "Студенческая виза и поступление",
                  ["Студенческая виза", "Языковые курсы и поступление", "Подбор программы"]),
}
CLUSTER_ORDER = ["birth", "work", "residence", "business", "invest", "housing",
                 "visa", "finance", "docs", "logistics", "travel", "study"]

# ── WHITELIST канон-фраз услуг (per-country «что доступно») ──────────────────
# НЕДОГОВОРЕННОСТЬ-ГАРДРЕЙЛ: на выход идёт ТОЛЬКО фраза из этого списка, никогда
# сырьё offer. Имя партнёра / цена / код программы физически не могут утечь.
# Матч = generate-from-whitelist (ключевик offer → канон-фраза), НЕ extract+blacklist.
# Ключевики нормализованы (lower, ё→е); порядок в списке = приоритет показа.
def norm(s):
    return (s or "").lower().replace("ё", "е")

CLUSTER_SERVICES = {
    "birth": [
        ("Сопровождение родов под ключ", ["родов", "роды", "родах", "родам", "родить", "родами"]),
        ("Гражданство ребёнку по рождению", ["ребен", "детск", "паспорт ребен", "2 гражданства", "ребенка-граждан"]),
        ("ВНЖ/ПМЖ для родителей", ["родител", "для семьи", "для родителей"]),
        ("Клиника, доула и документы", ["клиник", "медицин", "доул", "врач", "переводчик", "медицинск"]),
        ("Можно совместить с ВНЖ/недвижимостью", ["недвижим", "golden", "digital nomad", "за инвестиц", "регистрация бизнес"]),
    ],
    "work": [
        ("Трудоустройство с прямым контрактом", ["трудоустройств", "прямые контракт", "прямых контракт", "работодател", "ваканси", "рекрут", "кадров"]),
        ("Рабочая виза и разрешение на работу", ["рабочая виза", "рабочие виз", "разрешени на работ", "разрешения на работу", "рабочие и профессиональн", "карта побыт", "карты побыт"]),
        ("Релокейт-пакет от работодателя", ["релокац", "релокейт", "жилье для пар", "расходы на работодател", "до визы и квартир", "поддержка до визы"]),
        ("Вакансии по большой базе", ["агрегатор ваканс", "база 500", "база 45", "200k", "крюинг", "моряк", "вахт", "заводы", "стройк"]),
    ],
    "residence": [
        ("ВНЖ под ключ по нескольким основаниям", ["внж", "вид на жительств", "ikamet", "kitas", "побыт", "residencia", "no lucrativa", "non-lucrative", "no lucrative"]),
        ("Виза цифрового кочевника", ["digital nomad", "цифров", "номад", "dtv", "d8", "vitem"]),
        ("Путь к ПМЖ и гражданству", ["пмж", "гражданств", "натурализ", "репатриац"]),
        ("Сопровождение иммиграционным юристом", ["юрист", "адвокат", "иммиграцион", "лицензирован", "юридическ"]),
        ("Воссоединение семьи / Blue Card", ["воссоединени", "blue card", "chancenkarte"]),
    ],
    "business": [
        ("Регистрация компании (free zone / mainland)", ["регистрация компани", "регистрация юрлиц", "регистрация ооо", "регистрация ип", "регистрация бизнес", "регистрация тоо", "srl", " sl", "sas", "e-residency", "free zone", "freezone", "mainland", "офшор"]),
        ("Открытие корпоративного счёта", ["счет", "банковск", "iban", "рко"]),
        ("Бухгалтерия и налоговое резидентство", ["бухгалтер", "налогов", "vat", "отчетност", "payroll", "аудит"]),
        ("Юр. адрес и виртуальный офис", ["виртуальн офис", "юридическ адрес", "юр. адрес", "номинальн", "готовые компани", "готовые ооо"]),
    ],
    "invest": [
        ("Гражданство за инвестиции (CBI)", ["гражданство за инвестиц", "cbi", "гражданство по инвестиц", "паспорт за"]),
        ("«Золотая виза» / ВНЖ за инвестиции", ["золот", "golden", "viper", "внж за инвестиц", "внж через инвестиц", "инвестиционн внж", "инвестиц"]),
        ("Подбор программы и сопровождение", ["подбор программ", "лицензирован", "агент госпрограмм", "досье", "подача заявк", "сопровожд"]),
    ],
    "housing": [
        ("Подбор и покупка недвижимости", ["недвижим", "покупк", "off-plan", "off plan", "квартир", "вилл", "апартамент", "девелопер", "тапу", "продажа жил"]),
        ("Аренда жилья и заселение", ["аренд", "среднесрочн", "заселени", "управлени арендой"]),
        ("Ипотека для нерезидентов", ["ипотек", "mortgage", "рассрочк", "жилищны кредит"]),
        ("Юридическое сопровождение сделки", ["сопровождение сделк", "сопровождение сделок", "переоформлени", "проверка"]),
    ],
    "visa": [
        ("Оформление визы под ключ", ["виз", "шенген", "schengen", "мультивиз"]),
        ("Туристические, деловые, транзитные визы", ["туристич", "делов", "транзит"]),
        ("Визы после отказа, срочно", ["после отказа", "срочн", "запрет на въезд", "24 час", "снятие запрет"]),
    ],
    "finance": [
        ("Открытие счёта и карты за рубежом", ["открытие счет", "счет", "карт", "банк"]),
        ("Платёжные сервисы и переводы", ["платеж", "перевод", "мультивалютн", "кошел", "выплат", "инвойс", "swift"]),
        ("Доставка карты курьером", ["доставк", "курьер", "по доверенности"]),
    ],
    "docs": [
        ("Апостиль и легализация", ["апостил", "легализац", "консульск"]),
        ("Нотариальный / присяжный перевод", ["перевод", "присяжн", "нотариальн", "сертифицирован", "заверен"]),
        ("Истребование документов из РФ/СНГ", ["истребовани", "справк о несудим", "дубликат", "нострификац"]),
    ],
    "logistics": [
        ("Перевозка вещей под ключ (door-to-door)", ["перевозка личных вещ", "переезд", "door-to-door", "door to door", "контейнер", "упаковк", "груз", "транспортн"]),
        ("Перевоз питомцев за рубеж", ["питом", "животн", "зоотакси", "ipata", "ветеринар"]),
        ("Таможенное оформление и хранение", ["таможн", "хранени", "склад"]),
    ],
    "travel": [
        ("Авиабилеты и трансфер", ["авиабил", "билет", "перелет", "трансфер"]),
        ("Страховка для поездки и ВНЖ", ["страхов", "медстрахов", "insur"]),
        ("eSIM и связь в поездке", ["esim", "sim", "симкарт", "связь"]),
    ],
    "study": [
        ("Языковые курсы и поступление", ["языков", "курс", "поступл", "школ", "univ", "университ", "вуз", "образован", "студент"]),
        ("Студенческая виза", ["студенческ виз", "student visa", "учебн виз", "студенческая"]),
        ("Подбор программы обучения", ["подбор", "зачислен", "программ обучен"]),
    ],
}

def match_services(cl, offer):
    """offer → список канон-фраз (whitelist). Фраза попадает в вывод ТОЛЬКО отсюда."""
    spec = CLUSTER_SERVICES.get(cl)
    if not spec or not offer:
        return []
    o = norm(offer)
    return [phrase for phrase, kws in spec if any(k in o for k in kws)]

def top_services(counts, cl, k=3):
    """Топ-k фраз по частоте (затем по приоритету в whitelist). fail-loud: пусто → None."""
    if not counts:
        return None
    order = {ph: i for i, (ph, _) in enumerate(CLUSTER_SERVICES.get(cl, []))}
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], order.get(kv[0], 99)))
    return [ph for ph, _ in ranked[:k]] or None

# ── факты по 21 базовой стране (frontmatter visa_pattern / visa_free_days) ──
def parse_frontmatter(path):
    with open(path, encoding="utf-8") as f:
        txt = f.read()
    m = re.match(r"^---\n(.*?)\n---", txt, re.S)
    if not m:
        return {}
    fm = {}
    for line in m.group(1).splitlines():
        mm = re.match(r"^([a-z_0-9]+):\s*(.*)$", line)
        if mm:
            fm[mm.group(1)] = mm.group(2).strip()
    return fm

def build_facts():
    facts = {}  # ISO -> short fact string
    if not os.path.isdir(SOURCES):
        return facts
    for fn in os.listdir(SOURCES):
        if not fn.endswith(".md"):
            continue
        fm = parse_frontmatter(os.path.join(SOURCES, fn))
        ru = fm.get("country_ru", "").strip()
        iso = RU2ISO.get(ru)
        if not iso:
            continue
        pat = fm.get("visa_pattern", "").strip()
        days = fm.get("visa_free_days", "").strip()
        fact = pat if pat else (f"Безвиз {days} дн." if days else "")
        fact = soften_fact(fact)
        if fact:
            fact = fact[0].upper() + fact[1:]
            facts[iso] = fact
    return facts

# Факт = ПУБЛИЧНЫЙ визовый/трастовый крючок, НЕ персональный ответ.
# Недоговоренность: вырезаем «цену» (суммы/проценты/пороги) — они «на консультации».
# Оставляем визовый режим/путь (общеизвестно → доверие+любопытство, не палит лишнего).
_MONEY_RE = re.compile(r"[$€]|\bUSD\b|\bEUR\b|\d+\s?%|\d[\d  .,]*\s?(тыс|млн|k\b|m\b)", re.I)
# сроки СТАТУСА/пути (ПМЖ/гражданство/«N лет») = «готовый ответ» → за консультацией.
# дни/days НЕ трогаем — это въездной визовый режим (трастовый фон, разрешён).
_TERM_RE = re.compile(r"\d+\s*(год|года|лет)\b|\bПМЖ\b|\bРПП\b|гражданств|натурализ", re.I)

def soften_fact(fact):
    if not fact:
        return None
    parts = re.split(r"\s*[;·]\s*", fact)
    kept, total = [], 0
    for p in parts:
        p = p.strip(" .,")
        if not p or _MONEY_RE.search(p) or _TERM_RE.search(p):  # деньги/порог/срок статуса — выкидываем клаузу
            continue
        if total and total + len(p) > 90:   # компактно: ≤ ~90 симв по границе клауз
            break
        kept.append(p)
        total += len(p) + 2
    return "; ".join(kept).strip(" ;·,-") or None

# ── сборка ─────────────────────────────────────────────────────────────────
def main():
    data = json.load(open(PARTNERS, encoding="utf-8"))["partners"]
    facts = build_facts()

    # cluster -> ISO -> count ; cluster -> #глобальных партнёров ; cluster -> ISO -> {фраза: частота}
    cl_iso = {cl: {} for cl in CLUSTERS_META}
    cl_global = {cl: 0 for cl in CLUSTERS_META}
    cl_iso_svc = {cl: {} for cl in CLUSTERS_META}
    unmapped = {}
    for p in data:
        countries = p.get("countries", []) or []
        only_non = all(c in NON_COUNTRY for c in countries) if countries else True
        for cl in clusters_for(p):
            if cl == "credit" or cl not in CLUSTERS_META:
                continue
            if only_non:
                cl_global[cl] += 1
            # услуги country-specific берём ТОЛЬКО у партнёра с реальными странами
            # (глобальные платформы на 100+ стран дают ложную «специфику» — их в presence/global_note)
            phrases = match_services(cl, p.get("offer", "")) if not only_non else []
            for c in countries:
                if c in NON_COUNTRY:
                    continue
                iso = RU2ISO.get(c)
                if not iso:
                    unmapped[c] = unmapped.get(c, 0) + 1
                    continue
                cl_iso[cl][iso] = cl_iso[cl].get(iso, 0) + 1
                if phrases:
                    d = cl_iso_svc[cl].setdefault(iso, {})
                    for ph in phrases:
                        d[ph] = d.get(ph, 0) + 1

    if unmapped:
        print("⚠️  НЕ СМАПЛЕНЫ страны (добавь в RU2ISO):", unmapped, file=sys.stderr)

    # ISO -> RU имя (обратный словарь для показа)
    iso2ru = {}
    for ru, iso in RU2ISO.items():
        iso2ru.setdefault(iso, ru)
    # предпочитаем «простые» имена для алиасов
    iso2ru["ID"] = "Индонезия"; iso2ru["KR"] = "Южная Корея"

    clusters = {}
    for cl in CLUSTER_ORDER:
        emoji, label, blurb, bullets = CLUSTERS_META[cl]
        isos = cl_iso[cl]
        if not isos and cl_global[cl] == 0:
            continue
        countries = {}
        for iso, n in sorted(isos.items(), key=lambda x: -x[1]):
            countries[iso] = {
                "name": iso2ru.get(iso, iso),
                "services": top_services(cl_iso_svc[cl].get(iso, {}), cl),  # 1-3 канон-фразы (whitelist) или null
                "fact": facts.get(iso),        # факт по базовой стране (softened, или null)
                "n": n,                        # «вариантов: N» в UI (показываем при n>=2)
            }
        clusters[cl] = {
            "emoji": emoji,
            "label": label,
            "blurb": blurb,
            "tier": "high" if cl in HIGH else "low",
            "bullets": bullets,                # обобщённые возможности кластера (общие для всех стран)
            "iso_list": list(countries.keys()),
            "countries": countries,
            "global": cl_global[cl] > 0,
            "global_note": "🌐 Доступно из любой страны" if cl_global[cl] > 0 else None,
        }

    out = {
        "meta": {
            "source": "research/2026-06-21_relocation-services-partners/partners.json + base-21 sources",
            "generated_by": "build_map_data.py",
            "note": "СТАТИКА, данно-управляемо. Re-run регенерит при обновлении данных.",
            "cluster_order": [c for c in CLUSTER_ORDER if c in clusters],
            "deeplink_format": "t-<cluster>-<ISO>",
        },
        "clusters": clusters,
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # сводка + ГЕЙТ ПРИЁМКИ софтенера: густые кластеры должны давать services ≥60% стран
    print("[ok] map_data.json zapisan:", OUT)
    print(f"  klasterov: {len(clusters)}  ·  faktov(baza-21): {len(facts)}")
    fails = []
    for cl in out["meta"]["cluster_order"]:
        c = clusters[cl]
        cs = c["countries"]
        with_svc = sum(1 for co in cs.values() if co["services"])
        cov = (with_svc / len(cs) * 100) if cs else 0
        g = "  +glob" if c["global"] else ""
        gate = ""
        if cl in HIGH:  # густые/денежные — там per-country польза ОБЯЗАНА быть
            gate = "  <<< GATE FAIL (<60%)" if cov < 60 else "  gate ok"
            if cov < 60:
                fails.append(cl)
        print(f"  {cl:10} {len(cs):3} stran{g:8}  services {with_svc:3}/{len(cs):<3} ({cov:4.0f}%){gate}")
    if fails:
        # тихая регрессия данных (новые offer перестали матчиться) НЕ должна уйти в прод
        raise SystemExit(f"[FAIL] GATE FAIL po klasteram (dotyuni keyword'y v CLUSTER_SERVICES): {fails}")
    print("[ok] GATE: vse gustye klastery dayut services >=60% stran")

if __name__ == "__main__":
    main()
