# API Documentation

All requests go through the **API Gateway** at `http://localhost:8080`.
Downstream services are never called directly by a client - only the
Gateway is exposed on the host in `docker-compose.yml`.

Auth: send `Authorization: Bearer <token>` on every route marked 🔒.
Tokens are issued by `/api/users/login` and `/api/users/register` and
expire after `JWT_EXPIRES_IN` (default 1h).

---

## POST /api/users/register

Creates a new user and asynchronously triggers a "welcome" notification.

**Body**
```json
{
  "name": "Priya Sharma",
  "email": "priya@example.com",
  "password": "password123"
}
```
`password` must be 8-128 characters.

**201 Created**
```json
{
  "user": {
    "id": "a13dd249-ded6-4c19-941e-b25668f97bef",
    "name": "Priya Sharma",
    "email": "priya@example.com",
    "created_at": "2026-09-09T11:40:09.847Z",
    "updated_at": "2026-09-09T11:40:09.847Z"
  },
  "token": "eyJhbGciOi..."
}
```

**Errors**: `400` validation error, `409` email already registered.

---

## POST /api/users/login

**Body**
```json
{ "email": "priya@example.com", "password": "password123" }
```

**200 OK** - same shape as register's response.

**Errors**: `401` invalid credentials.

---

## GET /api/users/profile 🔒

Returns the authenticated user's profile.

**200 OK**
```json
{ "user": { "id": "...", "name": "...", "email": "...", "created_at": "...", "updated_at": "..." } }
```

---

## PUT /api/users/profile 🔒

Updates the authenticated user's name. Publishes a `user.updated` event,
which the Notification Service turns into a "profile updated" notification.

**Body**
```json
{ "name": "Priya S." }
```

**200 OK** - updated user object.

---

## GET /api/notifications 🔒

Lists notifications for the authenticated user, newest first.

**Query params**: `limit` (default 50, max 100), `offset` (default 0).

**200 OK**
```json
{
  "notifications": [
    {
      "id": "945a2fca-cec4-4749-af23-547c1ac4ab2a",
      "user_id": "a13dd249-ded6-4c19-941e-b25668f97bef",
      "type": "welcome",
      "message": "Welcome, Priya Sharma! Your account has been created.",
      "is_read": false,
      "created_at": "2026-09-09T11:40:09.852Z"
    }
  ]
}
```

There is no way to pass someone else's user id here - `user_id` used in
the query always comes from the verified JWT `sub` claim, never from the
request.

---

## PUT /api/notifications/:id/read 🔒

Marks a single notification as read. Returns `404` if the notification
doesn't exist or doesn't belong to the authenticated user (these are
indistinguishable on purpose - never leak whether an id exists for
someone else's account).

**200 OK**
```json
{ "notification": { "id": "...", "is_read": true, "...": "..." } }
```

---

## GET /health

Exposed on all three services directly, and on the Gateway (Gateway's own
health check does not depend on downstream services being up).

**200 OK**: `{ "status": "ok", "service": "..." }`
**503**: `{ "status": "unhealthy", "service": "...", "error": "..." }`

---

## Error shape (all endpoints)

```json
{ "error": "machine_readable_code", "message": "human readable explanation" }
```

Common codes: `validation_error`, `unauthorized`, `not_found`, `email_taken`,
`invalid_credentials`, `rate_limited`, `bad_gateway`, `internal_error`.

---

## Trying it with curl

```bash
# Register
curl -X POST http://localhost:8080/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Priya Sharma","email":"priya@example.com","password":"password123"}'

# Save the "token" from the response, then:
TOKEN="paste_token_here"

curl http://localhost:8080/api/users/profile -H "Authorization: Bearer $TOKEN"

# Give the async event a second to be consumed, then:
curl http://localhost:8080/api/notifications -H "Authorization: Bearer $TOKEN"
```
