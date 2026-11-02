import { neon } from "@neondatabase/serverless";

// 모듈을 불러오는 시점이 아니라 실제로 DB를 사용할 때 연결 객체를 만듭니다.
// DATABASE_URL이 없는 환경(빌드 단계 등)에서도 모듈 import 자체는 실패하지 않습니다.
let client = null;
let schemaReady = null;

// urls 테이블이 없으면 만듭니다. (db/schema.sql과 같은 내용)
// 함수 인스턴스마다 처음 한 번만 실행되며, 이미 있으면 아무것도 바꾸지 않습니다.
async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS urls (
      short_code VARCHAR(6) PRIMARY KEY,
      original_url VARCHAR(2048) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    ALTER TABLE urls
    ADD COLUMN IF NOT EXISTS click_count BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_clicked_at TIMESTAMPTZ
  `;
}

export async function getSql() {
  if (!client) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set.");
    }
    client = neon(process.env.DATABASE_URL);
  }
  if (!schemaReady) {
    schemaReady = ensureSchema(client).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
  return client;
}

/*
 * saveUrl()
 *
 * shortCode와 originalUrl을 저장합니다.
 * 같은 shortCode가 이미 있으면 새로 저장하지 않고 기존 행을 그대로 둡니다.
 *
 * 반환값
 * → { created: true,  originalUrl } : 새로 저장됨
 * → { created: false, originalUrl } : 이미 저장된 shortCode (기존 originalUrl 반환)
 */
export async function saveUrl(shortCode, originalUrl) {
  const sql = await getSql();

  const inserted = await sql`
    INSERT INTO urls (short_code, original_url)
    VALUES (${shortCode}, ${originalUrl})
    ON CONFLICT (short_code) DO NOTHING
    RETURNING original_url
  `;

  if (inserted.length > 0) {
    return { created: true, originalUrl: inserted[0].original_url };
  }

  const existing = await findUrlByShortCode(shortCode);
  return { created: false, originalUrl: existing };
}

export async function findUrlByShortCode(shortCode) {
  const sql = await getSql();

  const rows = await sql`
    SELECT original_url
    FROM urls
    WHERE short_code = ${shortCode}
    LIMIT 1
  `;

  return rows[0]?.original_url ?? null;
}
