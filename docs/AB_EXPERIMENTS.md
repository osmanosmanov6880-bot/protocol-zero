# A/B Experiment Lab — интеграционный контракт

## Порядок работы

1. Компания подаёт бриф через `/submit`; оператор проверяет доказательства и публикует его.
2. Участники создают разные публичные версии рекламного текста. Владелец брифа выбирает контроль A и эксперимент B на `/lab/<BRF-ID>`; заполняет гипотезу (15–400 символов) и **одну** основную метрику: `lead`, `signup`, `purchase`.
3. Без live-платформы создаётся `draft`, но **нулевые статистические метрики**. Экспорт JSON-кита содержит неизменяемые снимки A и B.
4. Чтобы принимать реальные события, оператор заранее подключает один проверенный сервер рекламного сайта в `PZ_PLATFORMS_FILE`: корректный HTTPS-домен, `mode:"live"`, отдельный секрет окружения от 32 символов. Владелец активирует свой план, закрепляя единственную платформу.
5. Сам партнёр решает, где ему хранить псевдонимный `visitorKey` (случайный стабильный токен 16–128 символов; **никаких email/IP/телефонов**), и вызывает SDK **на backend**.

## SDK Node.js — пример

```js
const crypto = require('node:crypto');
const {createNodePartner} = require('./sdk/node-partner');
const partner = createNodePartner({
  portalUrl: process.env.PZ_PORTAL_URL, // https://domain.example/
  platformKey: process.env.PZ_PLATFORM_KEY,
  secret: process.env.PZ_PLATFORM_SECRET
});

// На backend партнёра: создавать и хранить стабильный псевдонимный ключ участника.
const visitorKey = crypto.randomBytes(24).toString('base64url');
const assignment = await partner.assignExperiment({experimentId, visitorKey});
// Показать ТОЛЬКО assignment.creative, соответствующий assignment.arm.
// После подтверждённого рендера/показа:
await partner.recordExperiment({
  experimentId, visitorKey,
  eventId: 'imp_' + crypto.randomUUID(), kind: 'impression'
});
// После фактического наступления согласованной цели (один раз на участника):
await partner.recordExperiment({
  experimentId, visitorKey,
  eventId: 'goal_' + crypto.randomUUID(), kind: 'goal'
});
```

**Внимание:** пример генерации visitorKey иллюстрирует формат, но в реальном продукте ключ нужно сохранять на стороне партнёра между посещениями и не создавать заново на каждый вызов. `crypto.randomUUID()` содержит дефисы и подходит для event ID. Не копируйте `sdk/node-partner.js` и секрет в клиентский JavaScript.

## Прямые signed API

Оба запроса `POST`, `Content-Type: application/json`, HMAC `X-PZ-Platform`, `X-PZ-Timestamp`, `X-PZ-Signature` по правилам `docs/BRIDGE.md`:

- `/api/integrations/v2/experiment-assign`: `{"experimentId":"EXP-...","visitorKey":"random-stable-opaque-key"}`. Ответ содержит `arm` (`A`/`B`) и snapshot `creative`. **Назначение не равно показу**.
- `/api/integrations/v2/experiment-event`: `{"experimentId":"EXP-...","visitorKey":"same-key","eventId":"unique-event-id","kind":"impression"}` либо `"goal"`. Goal до impression отвергается. События дедуплицируются по ID и одному учтённому действию на участника.

Партнёр не может менять зафиксированный креатив во время плана, а `/api/experiments/:id/pause` прекращает новые назначения. Существующие назначения и статистика остаются для аудита.

## Интерпретация

Показы считаются только по подписанным заявлениям подключённого backend. Это **не независимая проверка реальных продаж**. Процент goal/impressions в интерфейсе — описательное отношение, не утверждение о lift. Нет доверительных интервалов, p-value, power calculator, стратификации трафика, одновременного контроля ботов и доказанной корректности серверной рандомизации. Не принимайте бюджетные решения без полноценного анализа и эксперимента на реальном трафике.
