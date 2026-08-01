# Meta API: реестр отказов и план защиты

Дата: 28 июля 2026.

## Назначение

Этот документ фиксирует проблемы, которые повторяются в официальной документации, Meta Community, отчётах разработчиков и статусах сервисов публикации. Он не гарантирует отсутствие блокировок или сбоев Meta. Его задача — не превращать внешний сбой в дубль, потерю контента, утечку токена или незаметно пропущенную публикацию.

## Базовый принцип

Любой API-вызов может завершиться одним из четырёх способов:

1. подтверждённый успех;
2. подтверждённая безопасная ошибка;
3. временная ошибка, которую можно повторить;
4. неизвестный результат — запрос мог пройти, но ответ потерян.

Четвёртый случай нельзя автоматически повторять как обычную ошибку. Сначала нужно проверить platform post ID, container status или последние публикации аккаунта по idempotency fingerprint.

## A. Активы, роли и permissions

### A1. Page не появляется в OAuth или `/me/accounts`

Симптомы:

- список Pages пустой;
- нужная Page отсутствует;
- `instagram_business_account` не возвращается.

Частые причины:

- пользователь имеет неполный task access, а не нужную роль;
- актив принадлежит другому Business Portfolio;
- OAuth проходил другой Facebook-пользователь;
- Instagram связан с другой Page;
- выдан старый токен до изменения ролей.

Защита:

- onboarding-check до сохранения аккаунта;
- сохранять Page ID, tasks и IG User ID, а не только название;
- после OAuth показывать фактически возвращённые активы;
- не разрешать ручной ввод Page ID как обход проверки;
- повторная авторизация после изменения ролей.

### A2. Instagram consumer вместо Professional

Симптомы:

- IG User ID отсутствует;
- publishing endpoint недоступен;
- разрешения выданы, но публикация невозможна.

Защита:

- preflight проверяет тип аккаунта;
- Facebook Login flow допускает только связанный Professional account;
- Stories включать только после проверки, что аккаунт Business, если это требуется выбранным API flow;
- UI не показывает Instagram как подключённый до успешного read-only preflight.

### A3. Перепутаны Instagram API with Facebook Login и Instagram Login

Симптомы:

- используются не те host, app credentials или permissions;
- OAuth успешен, но endpoint возвращает permission error;
- разработчик видит разные permission names в документации и Dashboard.

Защита:

- выбрать один flow до разработки;
- зафиксировать flow в Architecture Decision Record;
- не смешивать Graph hosts, token types и permissions;
- integration tests запускаются отдельно для выбранного flow;
- список permissions хранится в конфигурации и документации одной версии.

### A4. Advanced Access работает только у testers/admins

Симптомы:

- у разработчика всё работает;
- у обычного production-пользователя Pages пустые или ошибка `#100`;
- app остаётся фактически в development mode.

Защита:

- отдельный тест пользователем без роли в App;
- smoke test после каждого изменения App Review/Live Mode;
- production readiness нельзя подтверждать тестом только владельца App;
- хранить снимок одобренных permissions и access level.

### A5. Permission отозван или scope исчез

Причины:

- пользователь отозвал доступ;
- изменились роли, пароль или security settings;
- permission не прошёл review или приложение переключило режим;
- токен создан для другого App ID.

Защита:

- token introspection перед постановкой первой задачи дня и после auth error;
- auth errors никогда не повторять бесконечно;
- перевод интеграции в `reauth_required`;
- остановить очередь конкретного аккаунта, не всей системы;
- уведомить владельца без вывода токена в лог.

## B. App Review и Business Verification

### B1. Review отклонён из-за screencast

Повторяющиеся жалобы:

- видео не показывает полный сценарий;
- permission описан общими словами;
- reviewer не может войти или воспроизвести шаги;
- в видео нет фактического API-результата.

Защита:

- отдельный review build со стабильными тестовыми данными;
- короткий сценарий: login → выбор Page → создание → ручное подтверждение → публикация → результат;
- на экране должны быть видны причина permission и пользовательское действие;
- инструкции reviewer проверяет человек, который не участвовал в разработке;
- тестовые credentials проверяются непосредственно перед submission;
- не запрашивать permissions, которые нельзя продемонстрировать.

### B2. Review завис или длится дольше ожиданий

Защита:

- не привязывать дату запуска бизнеса к предполагаемому сроку review;
- иметь ручной процесс публикации;
- подавать минимальный permission set;
- вести журнал submission ID, дат, ответов и изменений;
- не пересоздавать App без анализа: это сбрасывает накопленный контекст.

### B3. Business Verification и домен не совпадают

Защита:

- юридическое название, домен, email и документы проверяются заранее;
- Privacy Policy и Data Deletion доступны без авторизации;
- production redirect URI использует подтверждённый HTTPS-домен;
- development и production URI не смешиваются.

## C. OAuth и токены

### C1. Redirect URI mismatch

Причины:

- различаются scheme, host, port, path или завершающий slash;
- используется localhost URI в production App;
- callback проходит через неожиданный proxy/redirect.

Защита:

- URI генерируется из allowlist конфигурации;
- exact-match тест в CI;
- запрет open redirect;
- `state` одноразовый, с TTL и привязкой к сессии;
- authorization code обменивается только сервером.

### C2. Токен истёк, отозван или относится не к тому App

Защита:

- хранить app ID, user ID, issuedAt, expiresAt, scopes и lastValidatedAt;
- шифровать токен отдельным ключом;
- никогда не показывать токен целиком в UI и логах;
- proactive warning до истечения;
- один контролируемый refresh/exchange flow;
- после invalid token — reauth, а не бесконечный retry.

### C3. Токен попал в URL или лог

Риск:

- query string сохраняется в proxy, browser history, analytics и error tracking.

Защита:

- Authorization header там, где endpoint поддерживает;
- централизованный redaction `access_token`, `appsecret_proof`, `code`, cookies;
- запрет логирования request body/URL без sanitizer;
- secret scanning в репозитории и CI;
- немедленный revoke при подозрении на утечку.

### C4. Несколько пользователей переподключают один актив

Риск:

- активный токен неожиданно заменяется;
- очередь публикует от другой авторизации.

Защита:

- connection owner и история ротаций;
- optimistic lock при обновлении connection;
- подтверждение перед заменой действующего подключения;
- тест read-only перед активацией нового токена.

## D. Медиа и Instagram containers

### D1. Meta не может скачать media URL

Причины:

- URL приватный, требует cookies/header или IP allowlist;
- URL истёк до скачивания;
- несколько redirect;
- CDN блокирует Meta user agent;
- неверный Content-Type/Content-Length;
- TLS/DNS проблема;
- сервер отдаёт HTML-ошибку с кодом 200.

Защита:

- отдельный media preflight без авторизации;
- HEAD и GET с внешней сети;
- content sniffing, MIME и checksum;
- signed URL живёт с запасом дольше максимального processing window;
- не удалять файл до terminal container state;
- минимизировать redirect;
- журналировать asset ID и безопасные response metadata.

### D2. Файл не соответствует ограничениям

Типовые проблемы:

- неподдерживаемый codec/container;
- неправильный aspect ratio;
- слишком большой файл, bitrate, разрешение или duration;
- переменный frame rate или повреждённый moov atom;
- carousel items имеют несовместимые параметры.

Защита:

- `ffprobe` до загрузки;
- нормализация через `ffmpeg` в утверждённый профиль;
- отдельные валидаторы image/video/reel/carousel;
- UI показывает точную причину и исправление;
- исходник сохраняется отдельно от нормализованной версии;
- спецификации версионируются вместе с Graph API.

### D3. Публикация вызывается до готовности контейнера

Симптомы:

- container остаётся `IN_PROGRESS`;
- `/media_publish` возвращает ошибку;
- видео иногда проходит, иногда нет.

Защита:

- state machine polling: `IN_PROGRESS` → `FINISHED` → publish;
- bounded exponential backoff с jitter;
- terminal states `ERROR`/`EXPIRED` не повторять тем же container ID;
- таймаут обработки не считать доказанным провалом публикации;
- хранить container ID и raw status отдельно от publish job.

### D4. Container истёк

Защита:

- создавать container ближе к фактической отправке;
- не использовать container как долгосрочное расписание;
- при expiry создавать новый container с тем же asset/version и новым attempt;
- старый container сохранять в audit history.

### D5. Carousel опубликован частично или в неверном порядке

Защита:

- immutable ordered list child assets;
- каждый child должен быть `FINISHED` до parent container;
- checksum и ordinal каждого элемента;
- запрет редактирования carousel после approval без новой версии;
- preview повторяет точный порядок API payload.

### D6. Reel опубликован, но отображается не так

Причины:

- неверный `share_to_feed`;
- cover/crop не соответствует ожиданию;
- API возвращает media type `VIDEO`, хотя продукт — Reel.

Защита:

- явно хранить `mediaProductType` и `shareToFeed`;
- превью feed/reels отдельно;
- после публикации читать `media_product_type`, permalink и thumbnail;
- UI не определяет Reel только по `media_type`.

## E. Очередь, дубли и неизвестный результат

### E1. Timeout после успешной публикации

Риск:

- worker не получил ответ и повторяет POST;
- возникает дубль.

Защита:

- attempt переходит в `unknown_result`;
- перед повтором reconciliation по container ID/platform post ID;
- fingerprint: account + platform + materialVersion + asset checksum;
- один active publish lock на fingerprint;
- ручное решение, если API не позволяет надёжно подтвердить результат.

### E2. Два worker одновременно забрали задачу

Защита:

- transactional outbox;
- row lock/lease с owner и expiry;
- unique constraint на idempotency key;
- heartbeat для долгой обработки видео;
- второй worker не публикует, пока lease не истёк и reconciliation не выполнен.

### E3. Пользователь дважды нажал «Опубликовать»

Защита:

- серверный idempotency key, а не только disabled button;
- UI сразу показывает существующую job;
- повторный запрос возвращает тот же job ID;
- кнопка недоступна для уже queued/publishing/published версии.

### E4. Материал изменился после постановки в очередь

Защита:

- job хранит immutable material version snapshot;
- редактирование создаёт новую версию и отменяет старую job, если отправка ещё не началась;
- если publishing начался, показывать конфликт и не скрывать результат;
- approval всегда относится к точной версии.

### E5. Системное время, DST или timezone

Защита:

- хранить UTC instant и IANA timezone;
- UI показывает Asia/Tbilisi и UTC в диагностике;
- server clock sync;
- задачи выбираются по UTC;
- тесты на смену даты, конец месяца, високосный год и ручное изменение времени.

## F. Rate limits, outages и нестабильность Meta

### F1. Rate limit раньше ожидаемого

Защита:

- читать usage headers, если доступны;
- лимиты на account/app/endpoint отдельно;
- token bucket в своей очереди;
- не публиковать burst после восстановления;
- `429` и соответствующие Graph errors переводить в retryable с `Retry-After`, если он есть;
- ручной лимит первой версии ниже официального.

### F2. Meta возвращает `500` или снижает success rate

Реальные сервисы публикации сообщают о периодических деградациях и повторяющихся `500` для image posts.

Защита:

- circuit breaker по платформе и типу медиа;
- не считать массовые одинаковые ошибки проблемой контента;
- сверяться с Meta Status и своей метрикой success rate;
- пауза очереди без потери задач;
- ручной fallback с выгрузкой caption и файла;
- после восстановления выпускать очередь постепенно.

### F3. Документация и API-версия расходятся

Защита:

- Graph version закреплена в конфигурации;
- contract tests на development App;
- календарь deprecation;
- обновление версии только отдельным rollout;
- release notes проверяются до обновления;
- старую и новую версию не смешивать в одной job.

## G. Webhooks и наблюдаемость

### G1. Дубли и неправильный порядок webhook events

Защита:

- webhook delivery ID/event fingerprint;
- inbox table с unique constraint;
- обработка идемпотентная;
- события могут приходить повторно и не по порядку;
- webhook не является единственным источником истины: нужен reconciliation.

### G2. Webhook signature не проверяется

Защита:

- проверять подпись по raw body до JSON parse;
- отклонять неверную подпись;
- secret не логировать;
- replay window и event deduplication;
- endpoint отвечает быстро, тяжёлая работа уходит в очередь.

### G3. Нет данных для диагностики

Каждый attempt должен хранить:

- internal request ID;
- job ID, material ID/version, account ID;
- Graph API version и endpoint name;
- безопасный error code/subcode/type;
- Meta trace/request ID из ответа, если доступен;
- HTTP status и latency;
- container ID и platform post ID;
- timestamps каждого перехода;
- redacted payload hash, но не токены.

## H. Контент, модерация и аккаунтные ограничения

### H1. Технически валидный пост отклонён политикой или ограничениями аккаунта

Защита:

- различать API validation, account restriction и content policy;
- terminal error не повторять автоматически;
- показывать владельцу исходный код/подкод и ссылку на ручную проверку;
- не пытаться обходить restriction другим токеном или личным профилем;
- ручной fallback не должен нарушать policy.

### H2. Одинаковый контент публикуется в несколько аккаунтов

Риск:

- неверный target account;
- дублирование или нежелательная идентичность контента.

Защита:

- финальный экран крупно показывает avatar, account name и Meta ID suffix;
- разные platform variants;
- account allowlist на уровне проекта;
- запрет cross-client публикации без отдельного подтверждения;
- Barmaglot исключён hard rule, а не только UI-флагом.

### H3. Ссылка или UTM неверны

Защита:

- URL parser и allowlist схем `https:`;
- preview финального URL;
- UTM builder без двойного кодирования;
- HEAD-проверка без раскрытия приватных URL;
- link version входит в approval hash.

## I. Локальное приложение и данные

### I1. Очистили Chrome data и потеряли контент-план

Защита до появления backend:

- versioned export;
- import с runtime-схемой и preview diff;
- автоматическое напоминание о backup;
- после backend `localStorage` не является source of truth.

### I2. Старая схема `localStorage` ломает новую версию

Защита:

- envelope `{schemaVersion, exportedAt, data}`;
- runtime validation;
- пошаговые migrations;
- quarantine повреждённых данных вместо silent reset;
- экспорт исходных данных перед миграцией.

### I3. Локальный preview открыт другим процессом или порт занят

Защита:

- PID/health check;
- проверить, что на 4173 отвечает именно Content OS;
- launcher не убивает неизвестный процесс автоматически;
- лог содержит безопасную диагностику;
- резервный свободный порт либо понятная ошибка.

## J. Что проверить перед первой реальной публикацией

1. Development App, test Page и отдельный Professional Instagram.
2. OAuth прошёл пользователь без роли в Meta App.
3. Read-only preflight вернул правильные Page ID, tasks и IG User ID.
4. Токен сохранён сервером и не появился в браузере/логах.
5. Media URL скачивается извне и проходит validator.
6. Approval hash совпадает с immutable material version.
7. Container дошёл до `FINISHED`.
8. Перед publish создан idempotency key и lock.
9. После publish сохранены platform post ID, permalink и request trace.
10. Повтор той же команды не создаёт второй пост.
11. Симулированы timeout, `429`, `500`, invalid token и container error.
12. Работает emergency stop и ручной fallback.
13. Владелец отдельно подтвердил тестовую публикацию.

## Источники наблюдений

Официальные:

- Meta Instagram API collection: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
- Instagram container status: https://www.postman.com/meta/instagram/request/munmruq/get-ig-container-status
- Meta Pages API: https://developers.facebook.com/docs/pages-api/posts/
- Instagram Content Publishing: https://developers.facebook.com/docs/instagram-platform/content-publishing/
- Meta App Development: https://developers.facebook.com/docs/development/create-an-app/

Отчёты разработчиков и сервисов — использовать как сигналы риска, а не как нормативную документацию:

- Page не появляется/token flow: https://www.reddit.com/r/facebook/comments/1n5k36a/struggling_with_instagram_api_page_not_showing_to/
- путаница permissions и Instagram Login: https://www.reddit.com/r/webdev/comments/1qtxlrj/anyone_have_experience_with_the_new_instagram_api/
- частые причины App Review rejection: https://www.reddit.com/r/MetaAppDevelopers/comments/1rux5y1/common_reasons_meta_app_review_gets_rejected_and/
- сообщения о неожиданном publishing rate limit: https://www.reddit.com/r/facebook/comments/12qv9bu/instagram_graph_api_content_publishing_rate_limit_glitch/
- деградация Instagram publishing: https://statuspage.incident.io/buffer/incidents/htd84bv1
- повторяющиеся Meta API `500` для image publishing: https://status.buffer.com/incidents/01KNJ12MRMSKTD7FYQKR8MCHAD/write-up

## Граница ответственности

Нельзя заранее исключить:

- outage или внутренний bug Meta;
- ручное ограничение Page/Instagram/App;
- изменение правил, permissions или App Review;
- ошибку модерации;
- задержку обработки медиа;
- отзыв доступа владельцем или Meta.

Поэтому обязательны наблюдаемость, остановка очереди, reconciliation и ручной сценарий публикации. Обещание «сбоев не будет» недопустимо; корректная цель — «сбой не создаст дубль, не потеряет материал и будет диагностируемым».
