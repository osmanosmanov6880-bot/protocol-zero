# PROTOCOL ZERO v1.3 / Node.js SDK для реальной рекламной платформы

В `sdk/node-partner.js` теперь есть **беззависимостный server-side клиент**, который использует существующий протокол Conversion Bridge v2. Он умеет подписывать вызовы получения брифа и подтверждения сохранённого рекламного результата.

Это готовая **часть интеграции**, а не доказательство работы с семью сайтами. Пока у нас нет их подтверждённых URL/API, эти подключения не считаются выполненными.

## Установить SDK в backend рекламного продукта

Скопируйте `sdk/node-partner.js` в ваш **серверный** проект (не во фронтенд). Настройте переменные окружения:

```text
PZ_PORTAL_URL=https://public-verified-portal.example
PZ_PLATFORM_KEY=your_partner_key
PZ_PARTNER_SECRET=<random-secret-of-at-least-32-characters>
```

Портал должен иметь точно такое же имя партнёра и секрет в приватной `PZ_PLATFORMS_FILE` конфигурации. В рабочем окружении URL портала — HTTPS. `allowLocalHttp:true` допустим **только** при локальной разработке на localhost.

```js
'use strict';
const crypto=require('node:crypto');
const {createNodePartner}=require('./sdk/node-partner');
const partner=createNodePartner({
  portalUrl:process.env.PZ_PORTAL_URL,
  platformKey:process.env.PZ_PLATFORM_KEY,
  secret:process.env.PZ_PARTNER_SECRET
});

// GET page?pz_handoff=... -> SERVER SIDE ONLY
async function importPzBrief(handoffId) {
  const {brief,mode}=await partner.resolve(handoffId);
  // Validate the schema; show the user exactly what arrived.
  // This does NOT save any material by itself.
  return {brief,mode};
}

// Call ONLY after the product actually saved a persistent creative/campaign object:
async function confirmSavedObject(handoffId,savedObject) {
  // Keep eventId stable across retries to avoid creating duplicate conversion events.
  const eventId='ad-object-'+savedObject.id;
  return partner.confirm({
    handoffId,eventId,
    actionType:'artifact_created',
    objectId:savedObject.id
  });
}
```

`savedObject.id` должен быть **реальным ID** вашей рекламной платформы, а не временным текстом, набором полей формы или случайным фиктивным ID. SDK ничего не сохраняет и не продаёт: это должен сделать backend реального продукта после действия пользователя.

## Защиты клиента

- Секрет не возвращается в объекте клиента и не передаётся в браузер.
- HMAC-SHA256 подписывает `timestamp + '.' + rawJSON`; одноразовый 5-минутный интервал проверки выполняется порталом.
- Преднастроенный `portalUrl` разрешает HTTPS; для локального HTTP нужен явный `allowLocalHttp` и loopback-адрес. В URL нельзя передавать имя/пароль, путь или произвольный query.
- HTTP redirects отключены (`redirect:'error'`), чтобы не отправить HMAC-секрет другому хосту.
- Таймаут по умолчанию 8 секунд, ограничение JSON-ответа 512 КБ; поддерживаемые события `artifact_created` и `campaign_saved`.
- Повтор одного и того же `eventId` идемпотентен, повтор с другим объектом получает 409.

Если запрос не прошёл, не сообщайте пользователю, что «конверсия подтверждена». Сохранение макета на вашей стороне и подтверждение события на стороне портала — два различных факта. Логика повторных отправок должна использовать **тот же** `eventId`.

`examples/partner-sandbox.js` с версии 1.3 использует **этот же SDK**. Он проверяется интеграционными тестами, но работает в sandbox и **не** подтверждает коммерческий результат.

## Что нужно от вас, чтобы подключить первый реальный сайт

1. Название и URL настоящей платформы, доступный с сервера PROTOCOL ZERO.
2. Путь страницы/endpoint, который принимает `pz_handoff` и показывает импортированный материал.
3. Что платформа **в действительности** сохраняет как объект и откуда взять его стабильный ID.
4. Доступ к серверному исходному коду платформы или её документация API; отдельный HMAC-секрет для каждого сайта.
5. Тестовый пользователь, который сможет действительно сохранить объект, затем проверить подпись и запись статуса в отчёте.

Без этих данных не следует произвольно настраивать `mode:'live'` или делать вид, что тестовая песочница является вашими реальными компаниями.

## v1.8.0 — эксперименты на сервере партнёра

SDK `createNodePartner()` теперь предоставляет:

```js
const result = await partner.assignExperiment({ experimentId, visitorKey });
// результат: { experimentId, arm, metric, creative };
await partner.recordExperiment({ experimentId, visitorKey, eventId, kind: 'impression' });
await partner.recordExperiment({ experimentId, visitorKey, eventId: anotherId, kind: 'goal' });
```

`visitorKey` — случайный стабильный ID 16–128 символов, не контактная информация. Запросы HMAC-подписаны тем же серверным секретом, что и `resolve()` / `confirm()`. Метрики доступны только для real live-партнёра. Подробно: `docs/AB_EXPERIMENTS.md`.
