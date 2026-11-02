# URL Shortener (클라우드 컴퓨팅 1–7주차 과제)

Next.js(App Router) + Neon Postgres + Vercel로 만든 URL 단축 서비스입니다.
1–7주차 실습 내용을 하나의 프로젝트로 통합했습니다.

## 기능 요약

| 기능 | 경로 | 주차 |
|---|---|---|
| URL 입력 화면 / 클라이언트 입력값 검증 | `GET /` | 1–2 |
| 단축 URL 생성 API (HTTP status code, 오류 코드) | `POST /api/shorten` | 3 |
| Neon Postgres 저장, 같은 URL 중복 요청 시 동일 shortCode | `lib/db.js` | 4 |
| 단축 URL 접속 시 307 Redirect, 없는 코드는 404 | `GET /{shortCode}` | 5 |
| 클릭 수 기록, 통계 API, 관리자 화면 | `GET /api/stats`, `GET /admin` | 6 |
| Basic 인증 + 역할 기반 인가로 관리자 기능 보호 | `proxy.js`, `lib/auth.js`, `lib/authorization.js` | 7 |
| 자기 서비스 도메인 URL 단축 거부 | `POST /api/shorten` | 과제 |

## 프로젝트 구조

```text
app/
├─ page.js                 메인 화면 (입력값 검증 + /api/shorten 호출)
├─ layout.js, globals.css
├─ [shortCode]/route.js    307 Redirect / 404, 클릭 기록
├─ admin/page.js           관리자 통계 화면
└─ api/
   ├─ shorten/route.js     단축 URL 생성
   └─ stats/route.js       통계 JSON (인증·인가 필요)
lib/
├─ db.js                   Neon 연결, URL 저장/조회
├─ stats.js                클릭 기록, 통계 집계
├─ auth.js                 인증: 누구인가?
└─ authorization.js        인가: 이 기능을 사용할 권한이 있는가?
proxy.js                   /admin 요청 보호 (Next.js 16 Proxy)
db/schema.sql              urls 테이블 생성 SQL
.env.example               환경변수 예시
```

## API

### `POST /api/shorten`

요청:

```json
{ "originalUrl": "https://www.google.com" }
```

| 상황 | Status | 응답 |
|---|---|---|
| 새 URL 단축 성공 | `201` | `{ shortCode, shortUrl, originalUrl }` |
| 이미 단축된 URL (같은 shortCode 반환) | `200` | `{ shortCode, shortUrl, originalUrl }` |
| `originalUrl` 누락·빈 문자열 | `400` | `error.code = "MISSING_URL"` |
| 2048자 초과 | `400` | `error.code = "URL_TOO_LONG"` |
| URL 형식 오류, `http`/`https` 이외 프로토콜(`javascript:` 등) | `400` | `error.code = "INVALID_URL"` |
| 이 서비스 자신의 도메인 URL (경로·http/https 무관) | `400` | `error.code = "SELF_REFERENCE_URL"` |
| 해시 충돌 (다른 URL이 같은 shortCode 사용 중) | `409` | `error.code = "SHORT_CODE_CONFLICT"` |
| 서버 내부 오류 | `500` | `error.code = "INTERNAL_ERROR"` |

- shortCode는 원본 URL의 SHA-256 해시로 만든 6자리 영숫자이므로, 같은 URL은 항상 같은 shortCode가 됩니다.
  DB에는 `ON CONFLICT DO NOTHING`으로 저장하여 중복 행이 생기지 않습니다.
- 자기 서비스 판별: 현재 요청의 host(`Host`, `X-Forwarded-Host`)와 Vercel 시스템 환경변수
  (`VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_BRANCH_URL`, `VERCEL_URL`)의 hostname을 비교합니다.
  다른 `*.vercel.app` 서비스의 URL은 정상적으로 단축됩니다.

### `GET /{shortCode}`

- 존재하면 `307` + `Location: 원본 URL` + `Cache-Control: no-store`, 클릭 수 기록
  (클릭 기록이 실패해도 Redirect는 수행)
- 존재하지 않거나 6자리 영숫자 형식이 아니면 `404` (Runtime Logs에 `Short URL not found` 경고)

### `GET /api/stats`, `GET /admin`

- 인증 정보가 없거나 틀리면 `401` + `WWW-Authenticate: Basic realm="Admin"`
- 권한이 없으면 `403`
- 사용자 이름 `admin`, 비밀번호는 환경변수 `ADMIN_PASSWORD`

## 실행 방법

### 1. DB 준비 (Neon)

Neon SQL Editor에서 [`db/schema.sql`](db/schema.sql)을 실행합니다.

### 2. 환경변수

`.env.example`을 `.env.local`로 복사하고 값을 채웁니다. (`.env.local`은 commit하지 않습니다.)

```env
DATABASE_URL=Neon Pooled Connection URL
ADMIN_PASSWORD=관리자 비밀번호
```

### 3. 로컬 실행

```bash
npm install
npm run dev
```

## Vercel 배포 설정

- **Root Directory**: `week01/hello-cloud-starter`
- **Environment Variables**: `DATABASE_URL`, `ADMIN_PASSWORD` (Production에 등록 후 Redeploy)
- **Firewall → Rate Limit**: `Request Path = /api/shorten` AND `Method = POST`, IP 기준 60초 10회
  - 자동 점검은 1회 실행에 POST를 10번 보내므로 한도를 10회보다 낮게 잡으면 `REVIEW(429)`가 나올 수 있습니다.
    이 경우 `--interval 8`로 다시 실행합니다.

## 자동 점검

```bash
python iscu_url_shortener_check.py --url https://내프로젝트.vercel.app
# 로컬
python iscu_url_shortener_check.py --url http://localhost:3000 --allow-local
```

| ID | 항목 | 구현 위치 |
|---|---|---|
| T01 | `GET /` → 200 | `app/page.js` |
| T02 | 단축 성공 201, 6자리 shortCode/shortUrl/originalUrl | `app/api/shorten/route.js` |
| T03 | 누락·빈 문자열 → 400 `MISSING_URL` | `app/api/shorten/route.js` |
| T04 | 잘못된 URL·`javascript:` → 400 `INVALID_URL` | `app/api/shorten/route.js` |
| T05 | 같은 URL → 같은 shortCode | `createShortCode()` + `saveUrl()` |
| T06 | `GET /{shortCode}` → 307, Location 일치 | `app/[shortCode]/route.js` |
| T07 | 없는 shortCode → 404 | `app/[shortCode]/route.js` |
| T08 | Redirect `Cache-Control: no-store` | `app/[shortCode]/route.js` |
| T09 | 인증 없는 `/admin`, `/api/stats` → 401 | `proxy.js`, `app/api/stats/route.js` |
| T10 | 자기 서비스 URL → 400 | `app/api/shorten/route.js` |
| T11 | 다른 Vercel 서비스 URL → 201 | `app/api/shorten/route.js` |
