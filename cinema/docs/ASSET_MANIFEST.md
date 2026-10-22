# Визуальные материалы: происхождение и честная оценка

## Что реально включено

- 9 исходных сценических композиций, представленных 18 WebP-файлами (desktop 1600×900 и mobile 720×1080).
- 2 AI-композитных изображения-референса, из которых выполнены кадрирования.
- SVG-символ интерфейса, CSS/Vignette/Grain, Canvas-декоративные частицы.
- Параметры исходников и кропов — `assets/ASSET_MANIFEST.json`; таблица из него генерируется ниже.

**Критично:** WebP-файлы увеличены из небольших фрагментов композитных исходников, их пиксельный размер не равен исходной оптической детализации. Некоторые кропы могут включать части нарисованного в оригинальном концепте интерфейса. Называть их настоящими 4K/8K запрещено. Для полноценного коммерческого качества нужна отдельная генерация/отрисовка 9 сценических фотофонов без надписей и UI. Это главный оставшийся художественный риск.

## Правила замены

Заменить файлы в `assets/keyframes` без изменения логики. Для каждой сцены сохранить ID, desktop и mobile версии, указать фактическое разрешение и сжатие в JSON. Оставить световую логику и положение объектов для непрерывности. При необходимости внести дополнительные кадры в конфигурацию.

## Два режима распространения

- `index.html + src/ + story/ + assets/` — нормальная версия, легковесная и модульная.
- `VIEW_OFFLINE.html` — встроенные JS/CSS/WebP в одном файле. Создана для удобства просмотра без локального сервера, но не подходит для точечного кэширования и повторного использования кадров в нескольких фильмах.

## Фактическая таблица файлов

| ID | Файл | Экспортное разрешение | Реальный исходный кроп | Апскейл | Объём |
|---|---|---|---|---|---:|
| `city_dawn-desktop` | `assets/keyframes/city_dawn-desktop.webp` | 1600×900 | 470×565 | да | 77 КБ |
| `city_dawn-mobile` | `assets/keyframes/city_dawn-mobile.webp` | 720×1080 | 470×565 | да | 69 КБ |
| `gateway-desktop` | `assets/keyframes/gateway-desktop.webp` | 1600×900 | 475×560 | да | 82 КБ |
| `gateway-mobile` | `assets/keyframes/gateway-mobile.webp` | 720×1080 | 475×560 | да | 73 КБ |
| `vault-desktop` | `assets/keyframes/vault-desktop.webp` | 1600×900 | 286×178 | да | 67 КБ |
| `vault-mobile` | `assets/keyframes/vault-mobile.webp` | 720×1080 | 286×178 | да | 42 КБ |
| `archive-desktop` | `assets/keyframes/archive-desktop.webp` | 1600×900 | 296×182 | да | 94 КБ |
| `archive-mobile` | `assets/keyframes/archive-mobile.webp` | 720×1080 | 296×182 | да | 48 КБ |
| `memory-desktop` | `assets/keyframes/memory-desktop.webp` | 1600×900 | 297×182 | да | 94 КБ |
| `memory-mobile` | `assets/keyframes/memory-mobile.webp` | 720×1080 | 297×182 | да | 49 КБ |
| `edda-desktop` | `assets/keyframes/edda-desktop.webp` | 1600×900 | 296×177 | да | 31 КБ |
| `edda-mobile` | `assets/keyframes/edda-mobile.webp` | 720×1080 | 296×177 | да | 21 КБ |
| `genome-desktop` | `assets/keyframes/genome-desktop.webp` | 1600×900 | 293×181 | да | 63 КБ |
| `genome-mobile` | `assets/keyframes/genome-mobile.webp` | 720×1080 | 293×181 | да | 38 КБ |
| `lab-desktop` | `assets/keyframes/lab-desktop.webp` | 1600×900 | 293×181 | да | 63 КБ |
| `lab-mobile` | `assets/keyframes/lab-mobile.webp` | 720×1080 | 293×181 | да | 38 КБ |
| `outcome-desktop` | `assets/keyframes/outcome-desktop.webp` | 1600×900 | 590×250 | да | 56 КБ |
| `outcome-mobile` | `assets/keyframes/outcome-mobile.webp` | 720×1080 | 590×250 | да | 30 КБ |
