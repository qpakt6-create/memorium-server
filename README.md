# memorium launcher server

## Deploy на Railway

1. Залей эту папку в GitHub репозиторий
2. Зайди на railway.app → New Project → Deploy from GitHub → выбери репо
3. В Railway → Variables добавь:
   - `ADMIN_KEY` = придумай секретный ключ (например: `mySecretKey123`)
   - `PORT` = Railway подставит сам автоматически
4. После деплоя Railway даст тебе URL типа `https://memorium-server-xxx.railway.app`

## Панель управления

Открой в браузере: `https://твой-url.railway.app/admin`

- Вставь URL сервера и ADMIN_KEY
- Добавляй/редактируй/удаляй клиенты
- Скопируй публичный URL (`/clients.json`) — вставь в лаунчер

## Настройка лаунчера

В файле `electron/main.js` замени:
```js
clientsJsonUrl: "YOUR_URL_TO_CLIENTS_JSON"
```
На:
```js
clientsJsonUrl: "https://твой-url.railway.app/clients.json"
```

Или в `.env` лаунчера:
```
VITE_CLIENTS_JSON_URL=https://твой-url.railway.app/clients.json
```

## API эндпоинты

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/clients.json` | Публичный список клиентов (для лаунчера) |
| GET | `/admin/clients` | Список (с ключом) |
| POST | `/admin/clients` | Добавить клиент |
| PUT | `/admin/clients/:id` | Обновить клиент |
| DELETE | `/admin/clients/:id` | Удалить клиент |

Заголовок для защищённых запросов: `x-admin-key: ВАШ_КЛЮЧ`

## Структура clients.json

```json
[
  {
    "id": 1,
    "name": "memorium 1.21.4",
    "type": "Fabric",
    "status": "Стабильная",
    "title": "MEMORIUM",
    "description": "Описание сборки",
    "folder": "memorium_1.21.4",
    "downloadUrl": "https://ссылка-на-zip-файл",
    "exePath": "launcher.jar"
  }
]
```
