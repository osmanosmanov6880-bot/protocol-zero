# API PROTOCOL ZERO v1.1.0

Все публичные браузерные запросы — JSON, один origin. Анонимный session cookie `pz_session` устанавливается автоматически. Кроме платформенного webhook, изменения требуют `Content-Type: application/json` и проверки `Origin` / `Sec-Fetch-Site`.

## Публичные маршруты

| Маршрут | Метод | Действие |
|---|---|---|
| `/api/health` | GET | Готовность процесса, версия |
| `/api/bootstrap` | GET | Корневые примеры, последние доступные ветви, свои ветви, настройки и агрегированные счётчики |
| `/api/stats` | GET | Только агрегированные продуктовые показатели |
| `/api/branches/:id` | GET | Публичная версия, если не скрыта |
| `/api/branches/:id/lineage` | GET | Предки, прямые потомки и общая глубина |
| `/api/mutations` | POST | Создать неизменяемого потомка |
| `/api/branches/:id/invites` | POST | Создать одноразовую ссылку (только автор) |
| `/api/invites/:token` | GET | Прочесть статус приглашения |
| `/api/branches/:id/workspace` | GET, PUT | Сохранённый частный рабочий черновик (только автор) |
| `/api/branches/:id/report` | POST | Пожаловаться на чужую публичную ветвь |
| `/api/branches/:id/action/report` | POST | Самоотчёт автора об использовании брифа; **не верификация** |
| `/api/events` | POST | Ограниченный список клиентских событий |
| `/api/privacy/export` | GET | Экспорт данных текущего анонимного браузера |
| `/api/privacy/delete` | POST | Удалить анонимную сессию и частные материалы |
| `/api/integrations/verified` | POST | Подписанный серверный webhook от рекламного сервиса |
| `/cards/:id.svg` | GET | Социальная карточка, SVG, только разрешённые ветви |
| `/b/:id`, `/i/:token`, `/w/:id` | GET | Клиентские страницы / deep links |

## Запись потомка

```json
POST /api/mutations
{
  "parentId": "7F-001-ROOT",
  "gene": "hook",
  "value": "Проекту нужна ясная система решений"
}
```

`gene` ∈ `hook`, `tone`, `cta`; `tone` строго из предложенного списка. Для персонального приглашения передайте дополнительное поле `inviteToken`. **Только одно** поле в снимке меняется; аудитория и фактические ограничения наследуются.

## Частная мастерская

```json
PUT /api/branches/7F-001-CHILD_ID/workspace
{
  "headline": "Прозрачный план для небольшой команды",
  "tone": "Спокойный, без пустых обещаний",
  "cta": "Посмотреть рабочий пример",
  "notes": "Проверить содержание до публикации"
}
```

Рабочая копия привязана к **автору конкретной ветви** и не доступна другому анонимному участнику. Изменение не создаёт публичного потомка и не меняет `branches.hook/cta/tone`.

## Жалоба

```json
POST /api/branches/7F-001-CHILD_ID/report
{"reason":"misleading","details":"Требуется проверить факты"}
```

Причины: `spam`, `offensive`, `personal_data`, `misleading`, `other`. Жалоба доступна **только локальному оператору через CLI**, автоматически публикация не блокируется. Повторная жалоба с тем же анонимным session ID на эту ветвь не удваивает счётчик.

## Достоверные действия рекламной платформы

```http
POST /api/integrations/verified
Content-Type: application/json
X-PZ-Signature: sha256=<64 lowercase hex>

{"event_id":"provider-object-0001","branch_id":"7F-001-CHILD_ID","action_type":"artifact_created"}
```

`action_type` может быть `artifact_created` или `campaign_saved`. Подпись:

```
hex(hmac_sha256(PLATFORM_WEBHOOK_SECRET, utf8(raw_HTTP_request_body)))
```

Одинаковый `event_id` с идентичными полями безопасно переотправить; другой `branch_id` или `action_type` при повторном `event_id` вызывает HTTP 409. Подпись должна вычисляться **на backend сторонней рекламной платформы**. Нельзя отправлять `PLATFORM_WEBHOOK_SECRET` или подписывать события на стороне браузера.

Это подтверждает факт, что доверенная платформа отправила событие, **а не фактический рост продаж или качество рекламы**.

## Ограничения

- Длина заголовка/призыва игровой мутации: 7–110 символов.
- 20 мутаций / анонимный участник / час; 12 приглашений / час; максимум три одновременно незавершённых приглашения на ветвь.
- Жалобы: 8 / день / анонимная сессия.
- Размер JSON до 12 KB.
- Глубина lineage до 40 поколений, затем новая мутация блокируется.
- Не предусмотрены массовая выгрузка чужих пользователей, приватные кампании организаций или публичное администрирование.

## Новый API v1.2.0

Для нового интеграционного протокола используйте `docs/BRIDGE.md`: `/api/platforms`, `/api/handoffs`, `/api/handoffs/:id`, `/api/handoffs/:id/revoke`, `/api/branches/:id/brief?source=public|workspace`, `/out/:id`, `/api/integrations/v2/resolve` и `/api/integrations/v2/confirm`.

Старый `/api/integrations/verified` сохранён ради обратной совместимости v1.1 и использует отдельную переменную `PLATFORM_WEBHOOK_SECRET`, если вы сами её установили. **Для нового партнёра используйте v2:** только v2 требует фактический открытый handoff + импорт брифа, отдельный ключ партнёра и проверку актуальности подписи.

Новый отчёт `npm run ops -- funnel` разделяет сформированную передачу, переход, получение брифа, подтверждение песочницы и подписанное live-подтверждение. Это разные этапы и разные доказательства.


## v1.3 / Рекламодатели, ручное рассмотрение и варианты

Новые маршруты (все под той же анонимной подписанной браузерной сессией):

- `POST /api/business-briefs` — согласие на публичный бриф, ответ `201 pending`. Опциональные `contactEmail` и `contactConsent` не идут в публичную кампанию. Пример тела — `docs/BUSINESS_INTAKE.md`.
- `GET /api/business-briefs` — записи **только автора текущего браузера**, включая review status и его необязательный контактный email.
- `POST /api/business-briefs/:id/withdraw` — отзыв, только пока `pending`.
- `GET /api/business-briefs/:id/variants` — до 500 публичных продолжений одобренной кампании, **только для исходного заявителя**. Не выдаёт личные заметки других пользователей. При скрытии корня оператором отвечает 403.
- `GET /api/bootstrap` — динамический каталог включает одобренные и видимые бренды с `origin:community`. Демо по-прежнему имеют `origin:demo`.
- `GET /api/privacy/export` и `POST /api/privacy/delete` — теперь включают также данные собственных заявок.

Операторских HTTP API **нет** — одобрение, отказ и снятие публикации выполняются только локальной командой `npm run ops -- ...`, см. `docs/BUSINESS_INTAKE.md`.

Не воспринимайте факт ручного одобрения как юридически установленное владение товарным знаком или независимый аудит рекламных обещаний.

---

## Новые API пяти волн (v1.8.0)

Сервер сохраняет существующие маршруты v1.3.0. Все перечисленные ниже owner-endpoints требуют анонимной cookie-сессии владельца исходной B2B-заявки (простая передача ID не даёт право чтения).

| Метод | Маршрут | Назначение |
|---|---|---|
| POST | `/api/preflight` | Детерминированный анализ рекламных текстов; не юридическая проверка |
| GET | `/api/branches/:id/preflight` | Анализ опубликованной видимой ветви |
| GET / PUT | `/api/business-briefs/:id/reviews` | Приватные статусы и заметки рекламодателя |
| GET | `/api/business-briefs/:id/insights` | Участие в эволюции кампании без приватных заметок |
| GET / POST | `/api/business-briefs/:id/experiments` | Просмотр и создание A/B планов |
| GET | `/api/experiments/:id` | Детали своего A/B плана |
| GET | `/api/experiments/:id/kit` | Иммутабельные рекламные снимки в JSON |
| POST | `/api/experiments/:id/activate` | Связать draft с настроенным live-партнёром |
| POST | `/api/experiments/:id/pause` | Остановить новые назначения |
| POST | `/api/integrations/v2/experiment-assign` | Server-to-server HMAC назначение A/B |
| POST | `/api/integrations/v2/experiment-event` | Server-to-server HMAC показ или действие |
| GET | `/api/ready` | Readiness базы SQLite и версия сервера |

Схема A/B, правила безопасности и пример вызовов SDK — `docs/AB_EXPERIMENTS.md`. Полное описание пяти волн — `docs/WAVES_v1.8.0.md`. Результаты `goal` — утверждение доверенного партнёра о наступлении заданной цели, а не независимая проверка оплаты. Тестовый демопартнёр не создаёт live A/B метрики.

---

## Новые маршруты v2.3.0 / WAVES 06–10

Все POST/PUT ожидают `Content-Type: application/json`, связаны с защищённой анонимной cookie-сессией, наследуют origin/rate-limit и отдают JSON. Исключение: гостевой доступ использует секретный review token в пути; он **не** даёт прав на бизнес-кабинет.

| Метод | Маршрут | Роль и результат |
|---|---|---|
| POST | `/api/business-briefs/BRF-ID/review-rooms` | Владелец: `{ "branchIds":["BR-...-ROOT"], "expiresInDays":7 }`; одноразово возвращает `token`, `path` |
| GET | `/api/business-briefs/BRF-ID/review-rooms` | Владелец: список комнат, сроки, статусы, числа отзывов; **без секретных токенов** |
| GET | `/api/business-briefs/BRF-ID/review-rooms/ROOM-ID` | Владелец: неизменяемые творческие снимки, приватные отзывы и решения |
| POST | `/api/business-briefs/BRF-ID/review-rooms/ROOM-ID/revoke` | Владелец: немедленно закрыть гостевую ссылку |
| PUT | `/api/business-briefs/BRF-ID/review-rooms/ROOM-ID/feedback/FDB-ID` | Владелец: `{ "decision":"considered", "note":"..." }` |
| GET | `/api/review-access/TOKEN` | Гость с токеном: выбранные публичные снимки и **только собственные** ответы |
| POST | `/api/review-access/TOKEN/feedback` | Гость с токеном: `{ "branchId":"...", "score":4, "comment":"Минимум 10 символов" }` |
| GET | `/api/experiments/EXP-ID/integrity` | Владелец: Wilson 95%, баланс назначений, SRM, диагностические флаги, без авто-победителя |
| GET | `/api/business-briefs/BRF-ID/pilots` | Владелец: приватные запросы и статусы коммерческого интереса |
| POST | `/api/business-briefs/BRF-ID/pilots` | Владелец: `{ "objective":"...", "budgetBand":"500_2000" }` |
| POST | `/api/pilots/PIL-ID/accept` | Владелец: выразить интерес к письменному предложению, **не оплата** |
| POST | `/api/pilots/PIL-ID/decline` | Владелец: отказаться от предложения |
| POST | `/api/pilots/PIL-ID/withdraw` | Владелец: отозвать ещё не согласованный запрос |

Новые страницы SPA: `/reviews/BRF-ID`, `/review/TOKEN`, `/pilots/BRF-ID`. `GET /api/privacy/export` включает приватные комнаты текущего владельца, собственные отзывы гостя и пилоты. `POST /api/privacy/delete` удаляет связанные приватные записи и анонимизирует публичную родословную. Для клиентов с отдельным браузером нужна собственная cookie; обычный публичный пользователь не может прочитать чужие ответы или коммерческие запросы.

Операторское управление пилотами вынесено только в CLI `npm run ops -- pilots|pilot-view|pilot-review|pilot-offer|pilot-decline|commercial-prune|doctor`. **Нет** публичного `admin` API.

Структура ответа на `/integrity`: `arms.{A,B}.{assignments,impressions,goals,goalRate,exposureRate}`, `balance.{chiSquare,expectedSplit,warning,checked}`, `flags[]`, `decision`, `interpretation`. `goalRate` — процент целей среди уникальных подписанных экспозиций, а не реальный платёж или независимый audit.
