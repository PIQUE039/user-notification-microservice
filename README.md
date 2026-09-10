# Microservices Assignment - User Service, Notification Service, API Gateway

A small microservices system: an **API Gateway**, a **User Service**, and a
**Notification Service**, where the two backend services communicate
exclusively through **NATS JetStream** (never REST, never WebSockets).

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for diagrams and design
rationale, and [`docs/API.md`](docs/API.md) for full endpoint documentation.

## Stack

- **Runtime**: Node.js 20, Express
- **Message broker**: NATS JetStream (TLS + username/password auth)
- **Databases**: PostgreSQL 16, one per service
- **Auth**: JWT (HS256), bcrypt password hashing
- **Containerization**: Docker + Docker Compose

## Project structure

```
.
├── api-gateway/            # Public entry point: JWT auth, rate limiting, proxying
├── user-service/           # Registration, login, profile. Publishes events to NATS.
├── notification-service/   # Consumes NATS events, stores/serves notifications.
├── nats/
│   └── nats-server.conf    # JetStream + TLS + auth config
├── scripts/
│   └── generate-certs.sh   # Local self-signed TLS certs for NATS
├── docs/
│   ├── ARCHITECTURE.md
│   └── API.md
├── docker-compose.yml
└── .env.example
```

---

## Prerequisites

- Docker and Docker Compose
- OpenSSL (for generating local TLS certs - preinstalled on macOS/Linux; on
  Windows use Git Bash or WSL)
- `curl` (or Postman) to test the API

## Setup - step by step

### 1. Clone and configure environment

```bash
git clone <your-repo-url>
cd <repo-name>
cp .env.example .env
```

Open `.env` and replace every `replace_with_*` placeholder with your own
values. At minimum, set real values for:
- `JWT_SECRET` - any long random string (32+ chars)
- `USER_DB_PASSWORD`, `NOTIF_DB_PASSWORD`
- `NATS_USER`, `NATS_PASSWORD`

### 2. Generate local TLS certificates for NATS

```bash
bash scripts/generate-certs.sh
```

**Windows / Git Bash users:** Git Bash auto-converts leading-slash arguments
(like OpenSSL's `-subj "/CN=..."`) into Windows paths, which silently
breaks this script. Run it with path conversion disabled instead:

```bash
MSYS_NO_PATHCONV=1 bash scripts/generate-certs.sh
```

Either way, verify all four files were actually created before moving on:

```bash
ls nats/certs
# expect: ca-key.pem  ca.pem  server-cert.pem  server-key.pem
```

If any are missing, `docker compose up` will fail with `nats-server`
unable to find its cert/key pair - regenerate rather than debugging further
down the stack.

This creates `nats/certs/{ca.pem, ca-key.pem, server-cert.pem, server-key.pem}`.
These are self-signed and for local development only - `nats/certs/` is
gitignored, never commit them.

### 3. Start everything

```bash
docker compose up --build
```

This starts, in order: `nats`, `user-postgres`, `notification-postgres`,
then `user-service`, `notification-service`, and finally `api-gateway`
(Compose's `depends_on` + healthchecks handle the ordering).

First run takes a minute or two while images build and Postgres
initializes. You'll know it's ready when you see:

```
api-gateway_1  | [api-gateway] listening on port 8080
user-service_1 | [user-service] connected to Postgres
user-service_1 | [user-service] connected to NATS JetStream
notification-service_1 | [notification-service] subscribed to "user.>" as durable consumer "notification-worker"
```

### 4. Try it

```bash
curl -X POST http://localhost:8080/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Priya Sharma","email":"priya@example.com","password":"password123"}'
```

**Windows PowerShell users:** plain `curl` is aliased to `Invoke-WebRequest`
and doesn't accept the flags above. Either call `curl.exe` explicitly with
escaped quotes, or use the PowerShell-native equivalent:

```powershell
$response = Invoke-RestMethod -Uri "http://localhost:8080/api/users/register" `
  -Method POST -ContentType "application/json" `
  -Body '{"name":"Priya Sharma","email":"priya@example.com","password":"password123"}'
$token = $response.token
```

Copy the `token` from the response, then:

```bash
TOKEN="<paste token here>"
curl http://localhost:8080/api/users/profile -H "Authorization: Bearer $TOKEN"

# give the event a moment to travel over NATS, then:
curl http://localhost:8080/api/notifications -H "Authorization: Bearer $TOKEN"
```

PowerShell equivalent:
```powershell
Invoke-RestMethod -Uri "http://localhost:8080/api/users/profile" -Method GET -Headers @{ Authorization = "Bearer $token" }
Start-Sleep -Seconds 2
Invoke-RestMethod -Uri "http://localhost:8080/api/notifications" -Method GET -Headers @{ Authorization = "Bearer $token" }
```

You should see a "welcome" notification that was created by the
Notification Service after consuming the `user.created` event - proof the
two services never talked to each other directly.

Full endpoint reference: [`docs/API.md`](docs/API.md).

### 5. Shut down

```bash
docker compose down          # stop containers, keep data
docker compose down -v       # stop containers and wipe volumes (fresh start)
```

---

## Running without Docker (local dev)

Useful for iterating on one service at a time.

1. Install Postgres 16 and NATS Server locally (or run just those two via
   `docker compose up nats user-postgres notification-postgres`).
2. Run `scripts/generate-certs.sh` and point `NATS_CA_CERT_PATH` in each
   service's `.env` at the generated `ca.pem`.
3. Create the databases and run each service's `db/init.sql` against them.
4. In each of `api-gateway/`, `user-service/`, `notification-service/`:
   ```bash
   npm install
   cp ../.env.example .env   # then adjust hosts to 127.0.0.1 / localhost
   npm run dev
   ```

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `nats-server` fails to start: `no such file or directory` for a cert | Run `scripts/generate-certs.sh` before `docker compose up`. On Windows/Git Bash, run it as `MSYS_NO_PATHCONV=1 bash scripts/generate-certs.sh` - without that, Git Bash mangles OpenSSL's `-subj` argument and the script fails silently partway through. Verify with `ls nats/certs` before proceeding either way |
| Services can't reach Postgres | Wait for the healthcheck - Compose won't start app services until Postgres reports healthy. Check `docker compose logs user-postgres` |
| `401 unauthorized` on a route you think should work | Token expired (`JWT_EXPIRES_IN`), or you're calling a downstream service's own port instead of the Gateway - the Gateway is what enforces auth first |
| Notification never shows up | Check `docker compose logs notification-service` - if you see repeated redelivery errors, the consumer is nak'ing; also confirm you waited a moment after registering, since delivery is asynchronous by design |
| `permission denied for table` errors | Only relevant if you manually ran `init.sql` outside the Postgres container as a different user than `POSTGRES_USER` - the Docker image's `docker-entrypoint-initdb.d` handles this correctly on its own |

---

## Design notes for anyone reviewing this

- **Why NATS JetStream and not core NATS**: core NATS pub/sub doesn't
  persist messages - if the Notification Service is momentarily down, the
  event is lost. JetStream persists to disk and redelivers to a durable
  consumer until it's explicitly acknowledged, which is what makes this
  "reliable" rather than just "asynchronous."
- **Why database-per-service**: neither service can read or write the
  other's tables, even by accident. The only contract between them is the
  event schema on the NATS subject, not a shared schema.
- **Idempotency**: JetStream guarantees *at-least-once* delivery, not
  exactly-once. A unique constraint on the event id in the Notification
  Service's table (`ON CONFLICT ... DO NOTHING`) makes redelivery safe -
  this was actually caught by testing the full flow end-to-end rather than
  assumed to work.

Full rationale, diagrams, and the security/reliability breakdown are in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).