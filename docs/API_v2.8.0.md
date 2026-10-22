# Новые маршруты API — v2.8.0

Общие правила: существующая анонимная cookie-сессия обязательна, владелец одобренного брифа может обращаться только к своим объектам. Все методы возвращают JSON. Нет ни одного публичного операторского POST-метода. Для старых контрактов см. `docs/API.md`.

| Метод | Маршрут | Кому доступен | Результат |
|---|---|---|---|
| GET | `/api/business-briefs/:id/control` | Автор | `open`/`paused` и журнал |
| PUT | `/api/business-briefs/:id/control` | Автор | Изменение состояния; `{status,reason}` |
| GET | `/api/business-briefs/:id/overview` | Автор | Агрегат реальных записей; без финансовых предположений |
| GET | `/api/business-briefs/:id/packs` | Автор | Список пакетов |
| POST | `/api/business-briefs/:id/packs` | Автор | `{label,purpose,branchIds:[...]}` (1–8 публичных потомков) |
| GET | `/api/packs/:packId` | Автор | Неизменяемый JSON пакета с SHA-256 |
| POST | `/api/experiments/:id/close` | Автор плана | `{reason}`; закрыть и зафиксировать снимок |
| GET | `/api/experiments/:id/closure` | Автор плана | Снимок и SHA-256; 404 пока не закрыт |
| GET | `/api/pilots/:pilotId/milestones` | Автор пилота | Этапы и пояснение статусов |
| PUT | `/api/pilots/:pilotId/milestones/:milestoneId/review` | Автор пилота | `{decision:"acknowledged"|"changes_requested",note}` |
| GET | `/command/:briefId` | Автор в UI | SPA с доступом по действующей cookie-сессии |

### Примеры ответов ошибок

- `403` — отсутствуют права на объект.
- `409 CAMPAIGN_PAUSED` — нельзя продолжать остановленную кампанию.
- `409 EXPERIMENT_CLOSED` — в закрытый эксперимент нельзя отправить события.
- `409 PACK_TAMPERED` / `CLOSURE_TAMPERED` — контроль целостности сохранённого JSON не прошёл.
- `409` — недопустимый переход этапа или повторное закрытие A/B.
- `429` — лимит пакетов или частоты создания.

### Операторский CLI (не HTTP)

```bash
npm run ops -- campaign-pause BRF-ID "Рекламные данные требуют дополнительной проверки"
npm run ops -- campaign-resume BRF-ID "Данные перепроверены и публикация снова разрешена"
npm run ops -- milestones PIL-ID
npm run ops -- milestone-add PIL-ID "Подготовка кампании" "Оператор сформировал исходные креативы и передал материалы на обсуждение"
npm run ops -- milestone-submit PIL-ID MS-ID "Материалы доступны клиенту для просмотра и комментариев"
```

CLI требует локального доступа к серверным файлам и базе, поэтому следует ограничить доступ к машине. Команды не заменяют платёжный или юридический документооборот.
