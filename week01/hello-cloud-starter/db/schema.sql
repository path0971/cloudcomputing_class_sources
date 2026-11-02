-- URL Shortener 테이블 (Neon SQL Editor에서 실행)
-- 4주차: URL 매핑 저장
CREATE TABLE IF NOT EXISTS urls (
    short_code VARCHAR(6) PRIMARY KEY,
    original_url VARCHAR(2048) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6주차: 클릭 사용량 컬럼
ALTER TABLE urls
ADD COLUMN IF NOT EXISTS click_count BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_clicked_at TIMESTAMPTZ;
