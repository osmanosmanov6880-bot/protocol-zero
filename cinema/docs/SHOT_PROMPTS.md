# SHOT PROMPTS — 15 кинематографических кадров

Эти задания самостоятельны и пригодны для генератора изображений. **Текущая сборка уже содержит кадры, но они получены кропом из двух композитных концептов**. Промпты ниже предназначены для повторной генерации чистых высококачественных сцен, без вшитой типографики и интерфейса. В рантайме текст накладывается HTML/CSS.

## Художественная непрерывность (для каждого кадра)

- Место: один и тот же футуристический комплекс городского архива, кольцевой портал с разрывом вверху справа, тёмный графитовый металл, сине-зелёное стекло, редкие бронзовые вставки, влажные поверхности.
- Эдда: женщина 38–45, короткие/асимметричные тёмные волосы, серо-зелёные глаза, угольно-тёмный архивный плащ, один бронзовый треугольный знак; внешность и причёску сохранять между кадрами.
- Формат: desktop **16:9**, для mobile — отдельная композиция **2:3 или 9:16**, не автоматический кроп, допускающий обрезание персонажа.
- Технический ориентир для производства: новые чистые desktop source 2560×1440 (или иное подтверждённое нативное качество), mobile source 1080×1620+, WebP/AVIF; не заявлять «8K» без проверки.
- Полный запрет: не генерировать текст, буквы, логотипы, бейджи, интерфейс, кнопки, водяные знаки, дублирующих персонажей, избыточные lens flare/particles, пластифицированную кожу, мультяшные строения и случайные лица.

## SCENE_01 — Сигнал (`city_dawn`)

**Production prompt (English):** An isolated maintenance observer stands in deep shadow at the LEFT edge of a damaged observation balcony. Beyond: kilometer-tall futuristic metropolis, a colossal broken orbital ring hanging in atmospheric haze. Foreground: wet graphite rail, fine rain droplets. Midground: lone human silhouette, back to camera. Distance: sprawling angular towers and soft sunrise over reflective canals. 24mm anamorphic equivalent, eye-height from a wide terrace, a subtle forward glide. Golden backlight far right, blue-grey haze, sparse green transmission beacon, generous clean dark lower-left for interface. Materials: aged graphite alloy, matte basalt stone, bronze micro-details, photorealistic wet textures, restrained filmic grain, atmospheric depth. Cinematic sci-fi world continuity with a split upper-right orbital ring and the same archive complex where visible. Render as a SINGLE photo-realistic film still, true 16:9, no embedded type, no captions, no UI, no watermark, no collage. Do not crop focal subjects. Reserve 35–45 percent uncluttered darkness on the LEFT for code-rendered Russian/English/Chinese text. No excessive purple neon, no global over-sharpening, no cartoon styling.

**Идентификатор/выход:** `shot_01_desktop.webp` и `shot_01_mobile.webp`; исходный внутренний ключ `assets/keyframes/city_dawn-desktop.webp`/`-mobile.webp`. Десктоп 16:9, mobile reframe 2:3. Для замены обновить одноимённый WebP в проекте, не менять сценарий.

**Слои при наличии исходников:** foreground архитектурный элемент; главный объект; средний план; дальняя архитектура; отдельно свет/частицы. Если нет масок, использовать только умеренный программный сдвиг целого изображения.

## SCENE_02 — Балкон (`city_dawn`)

**Production prompt (English):** A human on a suspended balcony watches tiny beacon lights blinking in the lower city; massive dark infrastructure frames a luminous horizon. Foreground: scratched metal and condensation. Midground: human with charcoal coat and small vertical green module. Distance: skyscraper silhouettes merging into fog. 35mm lens, slow rightward pan, camera two meters behind human. Amber rim light behind right shoulder, cyan-grey deep shadows, sky opens on right, unobstructed left third for text. Materials: aged graphite alloy, matte basalt stone, bronze micro-details, photorealistic wet textures, restrained filmic grain, atmospheric depth. Cinematic sci-fi world continuity with a split upper-right orbital ring and the same archive complex where visible. Render as a SINGLE photo-realistic film still, true 16:9, no embedded type, no captions, no UI, no watermark, no collage. Do not crop focal subjects. Reserve 35–45 percent uncluttered darkness on the LEFT for code-rendered Russian/English/Chinese text. No excessive purple neon, no global over-sharpening, no cartoon styling.

**Идентификатор/выход:** `shot_02_desktop.webp` и `shot_02_mobile.webp`; исходный внутренний ключ `assets/keyframes/city_dawn-desktop.webp`/`-mobile.webp`. Десктоп 16:9, mobile reframe 2:3. Для замены обновить одноимённый WebP в проекте, не менять сценарий.

**Слои при наличии исходников:** foreground архитектурный элемент; главный объект; средний план; дальняя архитектура; отдельно свет/частицы. Если нет масок, использовать только умеренный программный сдвиг целого изображения.

## SCENE_03 — Порог (`gateway`)

**Production prompt (English):** A towering fractured circular gate occupies the RIGHT 60% of an abandoned transit atrium. Two silent corridors lead beneath it, one golden, one icy teal; a single watcher stands at the threshold. Foreground fractured basalt, middle suspended cables, deep distance city glow. 28mm lens low human eye perspective, locked-off composition with restrained perspective. Cold overhead practical lighting, small amber choice lamps, volumetric shafts, left negative space for interactive choices. Materials: aged graphite alloy, matte basalt stone, bronze micro-details, photorealistic wet textures, restrained filmic grain, atmospheric depth. Cinematic sci-fi world continuity with a split upper-right orbital ring and the same archive complex where visible. Render as a SINGLE photo-realistic film still, true 16:9, no embedded type, no captions, no UI, no watermark, no collage. Do not crop focal subjects. Reserve 35–45 percent uncluttered darkness on the LEFT for code-rendered Russian/English/Chinese text. No excessive purple neon, no global over-sharpening, no cartoon styling.

**Идентификатор/выход:** `shot_03_desktop.webp` и `shot_03_mobile.webp`; исходный внутренний ключ `assets/keyframes/gateway-desktop.webp`/`-mobile.webp`. Десктоп 16:9, mobile reframe 2:3. Для замены обновить одноимённый WebP в проекте, не менять сценарий.

**Слои при наличии исходников:** foreground архитектурный элемент; главный объект; средний план; дальняя архитектура; отдельно свет/частицы. Если нет масок, использовать только умеренный программный сдвиг целого изображения.

## SCENE_04 — Зал семи (`vault`)

**Production prompt (English):** Seven monolithic research enclosures surround a floating blue-green holographic planet, with one visibly blank compartment. Distant human silhouette as scale reference. Steel and dark glass floors reflect dim service lights; layered architecture and sparse dust. 21mm wide-angle from raised gallery, slight upward motion. Blue-white core light, copper side lamps, restrained green indicators; left 40% comparatively dark for titles. Materials: aged graphite alloy, matte basalt stone, bronze micro-details, photorealistic wet textures, restrained filmic grain, atmospheric depth. Cinematic sci-fi world continuity with a split upper-right orbital ring and the same archive complex where visible. Render as a SINGLE photo-realistic film still, true 16:9, no embedded type, no captions, no UI, no watermark, no collage. Do not crop focal subjects. Reserve 35–45 percent uncluttered darkness on the LEFT for code-rendered Russian/English/Chinese text. No excessive purple neon, no global over-sharpening, no cartoon styling.

**Идентификатор/выход:** `shot_04_desktop.webp` и `shot_04_mobile.webp`; исходный внутренний ключ `assets/keyframes/vault-desktop.webp`/`-mobile.webp`. Десктоп 16:9, mobile reframe 2:3. Для замены обновить одноимённый WebP в проекте, не менять сценарий.

**Слои при наличии исходников:** foreground архитектурный элемент; главный объект; средний план; дальняя архитектура; отдельно свет/частицы. Если нет масок, использовать только умеренный программный сдвиг целого изображения.

## SCENE_05 — Коридор (`archive`)

**Production prompt (English):** An apparently infinite industrial archive corridor with tall bookshelves, sealed artifact cases and floating particulate dust. An archivist silhouette passes through a beam of distant light; a glass sphere hangs far beyond. Foreground labeled drawers without legible letters; medium repeating shelving; infinite vanishing point. 40mm lens centered one-point perspective, gentle push-in. Strips of cold white practical light meet one warm inspection lamp; dark blank left wall for readable overlay. Materials: aged graphite alloy, matte basalt stone, bronze micro-details, photorealistic wet textures, restrained filmic grain, atmospheric depth. Cinematic sci-fi world continuity with a split upper-right orbital ring and the same archive complex where visible. Render as a SINGLE photo-realistic film still, true 16:9, no embedded type, no captions, no UI, no watermark, no collage. Do not crop focal subjects. Reserve 35–45 percent uncluttered darkness on the LEFT for code-rendered Russian/English/Chinese text. No excessive purple neon, no global over-sharpening, no cartoon styling.

**Идентификатор/выход:** `shot_05_desktop.webp` и `shot_05_mobile.webp`; исходный внутренний ключ `assets/keyframes/archive-desktop.webp`/`-mobile.webp`. Десктоп 16:9, mobile reframe 2:3. Для замены обновить одноимённый WebP в проекте, не менять сценарий.

**Слои при наличии исходников:** foreground архитектурный элемент; главный объект; средний план; дальняя архитектура; отдельно свет/частицы. Если нет масок, использовать только умеренный программный сдвиг целого изображения.

## SCENE_06 — Дело №0 (`archive`)

**Production prompt (English):** Close examination of a single worn unmarked metal data folder on an illuminated archive table. A second translucent card behind it suggests inheritance. Foreground fingerprint-free frosted glass; midground folder; distant shelves falling into darkness. 55mm lens, static camera low over table, shallow depth of field, no readable paper text. A soft amber pool on the folder, teal rim reflection, deep shadows and text-safe dark left margin. Materials: aged graphite alloy, matte basalt stone, bronze micro-details, photorealistic wet textures, restrained filmic grain, atmospheric depth. Cinematic sci-fi world continuity with a split upper-right orbital ring and the same archive complex where visible. Render as a SINGLE photo-realistic film still, true 16:9, no embedded type, no captions, no UI, no watermark, no collage. Do not crop focal subjects. Reserve 35–45 percent uncluttered darkness on the LEFT for code-rendered Russian/English/Chinese text. No excessive purple neon, no global over-sharpening, no cartoon styling.

**Идентификатор/выход:** `shot_06_desktop.webp` и `shot_06_mobile.webp`; исходный внутренний ключ `assets/keyframes/archive-desktop.webp`/`-mobile.webp`. Десктоп 16:9, mobile reframe 2:3. Для замены обновить одноимённый WebP в проекте, не менять сценарий.

**Слои при наличии исходников:** foreground архитектурный элемент; главный объект; средний план; дальняя архитектура; отдельно свет/частицы. Если нет масок, использовать только умеренный программный сдвиг целого изображения.

## SCENE_07 — Аномалия (`memory`)

**Production prompt (English):** Mirror-like chamber reflects a visitor whose silhouette dissolves into faint luminous record threads, while an enormous spherical memory archive floats in the distance. Foreground dark glass with tiny droplets, middle observer, background layered reflections. 45mm cinematic lens at shoulder height, static shot after a subtle single visual discontinuity. Neutral-blue lights with one unsettling desaturated red pulse, no bright UI artwork, left space for twist headline. Materials: aged graphite alloy, matte basalt stone, bronze micro-details, photorealistic wet textures, restrained filmic grain, atmospheric depth. Cinematic sci-fi world continuity with a split upper-right orbital ring and the same archive complex where visible. Render as a SINGLE photo-realistic film still, true 16:9, no embedded type, no captions, no UI, no watermark, no collage. Do not crop focal subjects. Reserve 35–45 percent uncluttered darkness on the LEFT for code-rendered Russian/English/Chinese text. No excessive purple neon, no global over-sharpening, no cartoon styling.

**Идентификатор/выход:** `shot_07_desktop.webp` и `shot_07_mobile.webp`; исходный внутренний ключ `assets/keyframes/memory-desktop.webp`/`-mobile.webp`. Десктоп 16:9, mobile reframe 2:3. Для замены обновить одноимённый WebP в проекте, не менять сценарий.

**Слои при наличии исходников:** foreground архитектурный элемент; главный объект; средний план; дальняя архитектура; отдельно свет/частицы. Если нет масок, использовать только умеренный программный сдвиг целого изображения.

## SCENE_08 — Эдда Кейн (`edda`)

**Production prompt (English):** Consistent character EDDA KANE, woman about 38–45, asymmetrical dark hair, grey-green eyes, tiny bronze triangular badge on charcoal archival coat, calm analytical stare. She stands at the RIGHT third of a quiet lab, half profile, reading a suspended translucent campaign lineage sculpture. Foreground file cabinet edge, background enormous dark archives. 65mm portrait lens, medium close-up, camera slightly below eye height, almost no camera motion. Soft teal key from right, subtle copper practical rim from left, chiaroscuro dark LEFT half for subtitles. Materials: aged graphite alloy, matte basalt stone, bronze micro-details, photorealistic wet textures, restrained filmic grain, atmospheric depth. Cinematic sci-fi world continuity with a split upper-right orbital ring and the same archive complex where visible. Render as a SINGLE photo-realistic film still, true 16:9, no embedded type, no captions, no UI, no watermark, no collage. Do not crop focal subjects. Reserve 35–45 percent uncluttered darkness on the LEFT for code-rendered Russian/English/Chinese text. No excessive purple neon, no global over-sharpening, no cartoon styling.

**Идентификатор/выход:** `shot_08_desktop.webp` и `shot_08_mobile.webp`; исходный внутренний ключ `assets/keyframes/edda-desktop.webp`/`-mobile.webp`. Десктоп 16:9, mobile reframe 2:3. Для замены обновить одноимённый WebP в проекте, не менять сценарий.

**Слои при наличии исходников:** foreground архитектурный элемент; главный объект; средний план; дальняя архитектура; отдельно свет/частицы. Если нет масок, использовать только умеренный программный сдвиг целого изображения.

## SCENE_09 — Геном (`genome`)

**Production prompt (English):** Dark advertising research laboratory with a single large luminous double helix sculpted from typographic-independent abstract glass segments, seven structural nodes each with different brightness. Edda appears in middle distance as dark recognizable silhouette. Foreground polished stone desk; background linear light rails. 38mm perspective with delicate upward camera drift, helix placed right of center. Controlled sea-green internal glow, bronze reflection underneath, left negative space for text and buttons. Materials: aged graphite alloy, matte basalt stone, bronze micro-details, photorealistic wet textures, restrained filmic grain, atmospheric depth. Cinematic sci-fi world continuity with a split upper-right orbital ring and the same archive complex where visible. Render as a SINGLE photo-realistic film still, true 16:9, no embedded type, no captions, no UI, no watermark, no collage. Do not crop focal subjects. Reserve 35–45 percent uncluttered darkness on the LEFT for code-rendered Russian/English/Chinese text. No excessive purple neon, no global over-sharpening, no cartoon styling.

**Идентификатор/выход:** `shot_09_desktop.webp` и `shot_09_mobile.webp`; исходный внутренний ключ `assets/keyframes/genome-desktop.webp`/`-mobile.webp`. Десктоп 16:9, mobile reframe 2:3. Для замены обновить одноимённый WebP в проекте, не менять сценарий.

**Слои при наличии исходников:** foreground архитектурный элемент; главный объект; средний план; дальняя архитектура; отдельно свет/частицы. Если нет масок, использовать только умеренный программный сдвиг целого изображения.

## SCENE_10 — Одна мутация (`genome`)

**Production prompt (English):** Macro view of the exact same glowing glass genome helix in the laboratory; one strand segment emits stronger gold light as if being selected, while six remain dim green. No literal advertising text, no digital labels, no menus rendered into image. 60mm close camera, near-static, tight composition with clear space on left. Dark background with narrow cold rim, precisely one amber highlight, shallow atmospheric haze. Materials: aged graphite alloy, matte basalt stone, bronze micro-details, photorealistic wet textures, restrained filmic grain, atmospheric depth. Cinematic sci-fi world continuity with a split upper-right orbital ring and the same archive complex where visible. Render as a SINGLE photo-realistic film still, true 16:9, no embedded type, no captions, no UI, no watermark, no collage. Do not crop focal subjects. Reserve 35–45 percent uncluttered darkness on the LEFT for code-rendered Russian/English/Chinese text. No excessive purple neon, no global over-sharpening, no cartoon styling.

**Идентификатор/выход:** `shot_10_desktop.webp` и `shot_10_mobile.webp`; исходный внутренний ключ `assets/keyframes/genome-desktop.webp`/`-mobile.webp`. Десктоп 16:9, mobile reframe 2:3. Для замены обновить одноимённый WebP в проекте, не менять сценарий.

**Слои при наличии исходников:** foreground архитектурный элемент; главный объект; средний план; дальняя архитектура; отдельно свет/частицы. Если нет масок, использовать только умеренный программный сдвиг целого изображения.

## SCENE_11 — Эхо (`lab`)

**Production prompt (English):** Two translucent blank ad cards suspended between bronze mechanical arms inside the established archive laboratory, connected by a single thread of gold light. Foreground cables and glass; midground paired cards; background faint genome helix. 35mm centered camera, subtle backward movement to reveal both cards. Single warm pulse on the descendant card against stable cool parent card; ample left negative space. Materials: aged graphite alloy, matte basalt stone, bronze micro-details, photorealistic wet textures, restrained filmic grain, atmospheric depth. Cinematic sci-fi world continuity with a split upper-right orbital ring and the same archive complex where visible. Render as a SINGLE photo-realistic film still, true 16:9, no embedded type, no captions, no UI, no watermark, no collage. Do not crop focal subjects. Reserve 35–45 percent uncluttered darkness on the LEFT for code-rendered Russian/English/Chinese text. No excessive purple neon, no global over-sharpening, no cartoon styling.

**Идентификатор/выход:** `shot_11_desktop.webp` и `shot_11_mobile.webp`; исходный внутренний ключ `assets/keyframes/lab-desktop.webp`/`-mobile.webp`. Десктоп 16:9, mobile reframe 2:3. Для замены обновить одноимённый WebP в проекте, не менять сценарий.

**Слои при наличии исходников:** foreground архитектурный элемент; главный объект; средний план; дальняя архитектура; отдельно свет/частицы. Если нет масок, использовать только умеренный программный сдвиг целого изображения.

## SCENE_12 — Конфликт (`memory`)

**Production prompt (English):** A restrained courtroom-like archival inspection desk where one beautiful luminous unmarked advertising sheet and one plain verification file stand on opposing sides of a thin red line. No real-world logos, no legible words. Distant spherical memory system watches. 50mm static, eye-level close medium shot, symmetrical tension. Blue-neutral evidence lamp, amber creative light, near-black negative space for warning statement. Materials: aged graphite alloy, matte basalt stone, bronze micro-details, photorealistic wet textures, restrained filmic grain, atmospheric depth. Cinematic sci-fi world continuity with a split upper-right orbital ring and the same archive complex where visible. Render as a SINGLE photo-realistic film still, true 16:9, no embedded type, no captions, no UI, no watermark, no collage. Do not crop focal subjects. Reserve 35–45 percent uncluttered darkness on the LEFT for code-rendered Russian/English/Chinese text. No excessive purple neon, no global over-sharpening, no cartoon styling.

**Идентификатор/выход:** `shot_12_desktop.webp` и `shot_12_mobile.webp`; исходный внутренний ключ `assets/keyframes/memory-desktop.webp`/`-mobile.webp`. Десктоп 16:9, mobile reframe 2:3. Для замены обновить одноимённый WebP в проекте, не менять сценарий.

**Слои при наличии исходников:** foreground архитектурный элемент; главный объект; средний план; дальняя архитектура; отдельно свет/частицы. Если нет масок, использовать только умеренный программный сдвиг целого изображения.

## SCENE_13 — Вердикт (`gateway`)

**Production prompt (English):** A huge incomplete ring behind one small observer in a monumental black stone decision chamber; one softly glowing green passage and one quiet pale gold sealed arch on either side. Foreground worn step, midground figure, distant structural ring. 27mm wide symmetrical cinema composition, carefully held still with slight lens breathing only. Nearly silent low-light scene, two distinct but understated corridor glows; safe left area for choice text. Materials: aged graphite alloy, matte basalt stone, bronze micro-details, photorealistic wet textures, restrained filmic grain, atmospheric depth. Cinematic sci-fi world continuity with a split upper-right orbital ring and the same archive complex where visible. Render as a SINGLE photo-realistic film still, true 16:9, no embedded type, no captions, no UI, no watermark, no collage. Do not crop focal subjects. Reserve 35–45 percent uncluttered darkness on the LEFT for code-rendered Russian/English/Chinese text. No excessive purple neon, no global over-sharpening, no cartoon styling.

**Идентификатор/выход:** `shot_13_desktop.webp` и `shot_13_mobile.webp`; исходный внутренний ключ `assets/keyframes/gateway-desktop.webp`/`-mobile.webp`. Десктоп 16:9, mobile reframe 2:3. Для замены обновить одноимённый WebP в проекте, не менять сценарий.

**Слои при наличии исходников:** foreground архитектурный элемент; главный объект; средний план; дальняя архитектура; отдельно свет/частицы. Если нет масок, использовать только умеренный программный сдвиг целого изображения.

## SCENE_14 — Открыто (`outcome`)

**Production prompt (English):** First light of dawn above the previously established future city, the same bronze orbital ring now traced by one fresh thin green luminous line stretching toward the horizon. Observer appears quietly small at left railing. Foreground condensation; distant sunlit towers and low clouds. 28mm lens looking outward, a slow reverse dolly from the observer, generous horizon. Warm natural sunrise and desaturated teal shadows; dark low-left space for closing line. Materials: aged graphite alloy, matte basalt stone, bronze micro-details, photorealistic wet textures, restrained filmic grain, atmospheric depth. Cinematic sci-fi world continuity with a split upper-right orbital ring and the same archive complex where visible. Render as a SINGLE photo-realistic film still, true 16:9, no embedded type, no captions, no UI, no watermark, no collage. Do not crop focal subjects. Reserve 35–45 percent uncluttered darkness on the LEFT for code-rendered Russian/English/Chinese text. No excessive purple neon, no global over-sharpening, no cartoon styling.

**Идентификатор/выход:** `shot_14_desktop.webp` и `shot_14_mobile.webp`; исходный внутренний ключ `assets/keyframes/outcome-desktop.webp`/`-mobile.webp`. Десктоп 16:9, mobile reframe 2:3. Для замены обновить одноимённый WebP в проекте, не менять сценарий.

**Слои при наличии исходников:** foreground архитектурный элемент; главный объект; средний план; дальняя архитектура; отдельно свет/частицы. Если нет масок, использовать только умеренный программный сдвиг целого изображения.

## SCENE_15 — Запечатано (`vault`)

**Production prompt (English):** The same archive vault after a deliberate shutdown: sealed dark glass case containing a dormant unmarked campaign seed, seven faint steel doors retreating into darkness, a small silent bronze triangular insignia near foreground. No destruction, no threat, deliberate controlled pause. 50mm static, camera perpendicular to archive shelf, controlled centered framing. Cool low-key service light and a single soft amber standby LED, open dark left side for final sentence. Materials: aged graphite alloy, matte basalt stone, bronze micro-details, photorealistic wet textures, restrained filmic grain, atmospheric depth. Cinematic sci-fi world continuity with a split upper-right orbital ring and the same archive complex where visible. Render as a SINGLE photo-realistic film still, true 16:9, no embedded type, no captions, no UI, no watermark, no collage. Do not crop focal subjects. Reserve 35–45 percent uncluttered darkness on the LEFT for code-rendered Russian/English/Chinese text. No excessive purple neon, no global over-sharpening, no cartoon styling.

**Идентификатор/выход:** `shot_15_desktop.webp` и `shot_15_mobile.webp`; исходный внутренний ключ `assets/keyframes/vault-desktop.webp`/`-mobile.webp`. Десктоп 16:9, mobile reframe 2:3. Для замены обновить одноимённый WebP в проекте, не менять сценарий.

**Слои при наличии исходников:** foreground архитектурный элемент; главный объект; средний план; дальняя архитектура; отдельно свет/частицы. Если нет масок, использовать только умеренный программный сдвиг целого изображения.

