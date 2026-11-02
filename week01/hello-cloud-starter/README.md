# Snip: App

Snip의 Next.js 앱입니다. 전체 소개와 아키텍처는 [루트 README](../../README.md)를 참고하세요.

## 실행

```bash
cp .env.example .env.local   # DATABASE_URL, ADMIN_PASSWORD 입력
npm install
npm run dev                  # http://localhost:3000
```

`urls` 테이블은 첫 DB 접근 시 자동으로 생성됩니다(`lib/db.js`의 `ensureSchema()`).
같은 SQL이 [`db/schema.sql`](db/schema.sql)에 있으므로 직접 실행해도 됩니다.

## API

### `POST /api/shorten`

```json
{ "originalUrl": "https://www.google.com" }
```

| 상황 | Status | 응답 |
|---|---|---|
| 새 URL 단축 성공 | `201` | `{ shortCode, shortUrl, originalUrl }` |
| 이미 단축된 URL (같은 shortCode 반환) | `200` | `{ shortCode, shortUrl, originalUrl }` |
| `originalUrl` 누락·빈 문자열 | `400` | `error.code = "MISSING_URL"` |
| 2048자 초과 | `400` | `error.code = "URL_TOO_LONG"` |
| URL 형식 오류, `http`/`https` 이외 스킴 | `400` | `error.code = "INVALID_URL"` |
| 이 서비스 자신의 도메인 URL | `400` | `error.code = "SELF_REFERENCE_URL"` |
| 해시 충돌 | `409` | `error.code = "SHORT_CODE_CONFLICT"` |
| 서버 내부 오류 | `500` | `error.code = "INTERNAL_ERROR"` |

- shortCode는 원본 URL의 SHA-256 해시로 만든 6자리 영숫자입니다. `ON CONFLICT DO NOTHING`으로 저장해 중복 행이 생기지 않습니다.
- 자기 도메인 판별: 요청 host(`Host`, `X-Forwarded-Host`)와 Vercel 시스템 환경변수
  (`VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_BRANCH_URL`, `VERCEL_URL`)의 hostname을 비교합니다.

### `GET /{shortCode}`

- 존재하면 `307` + `Location` + `Cache-Control: no-store`, 클릭 수 기록 (기록 실패와 무관하게 리다이렉트)
- 없거나 형식이 맞지 않으면 `404` (로그에 `Short URL not found`)

### `GET /api/stats`, `GET /admin`

- 인증 실패 시 `401` + `WWW-Authenticate: Basic realm="Admin"`, 권한 부족 시 `403`
- 사용자 이름 `admin`, 비밀번호는 `ADMIN_PASSWORD`
