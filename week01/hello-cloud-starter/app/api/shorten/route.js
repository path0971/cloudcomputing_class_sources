import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { saveUrl } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_URL_LENGTH = 2048;

const ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/*
 * createShortCode()
 *
 * 원본 URL을 입력받아 SHA-256 해시를 생성하고,
 * 그 값을 이용해 6자리 short code를 만듭니다.
 *
 * 같은 URL은 항상 같은 short code가 되므로
 * 같은 URL을 다시 요청해도 동일한 shortCode를 돌려줄 수 있습니다.
 */
function createShortCode(originalUrl, length = 6) {
  const hex = createHash("sha256")
    .update(originalUrl)
    .digest("hex");

  let code = "";

  for (let i = 0; i < length; i++) {
    const value = parseInt(
      hex.slice(i * 2, i * 2 + 2),
      16
    );

    code += ALPHABET[value % ALPHABET.length];
  }

  return code;
}

function errorResponse(status, code, message) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function normalizeHost(value) {
  if (!value) {
    return null;
  }

  // "host:port" 또는 "https://host" 형태 모두 hostname만 추출합니다.
  try {
    const withScheme = value.includes("://") ? value : `http://${value}`;
    return new URL(withScheme).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

/*
 * getServiceOrigin()
 *
 * 사용자가 실제로 접속한 서비스 주소(예: https://my-app.vercel.app)를 구합니다.
 * Vercel에서는 x-forwarded-host / x-forwarded-proto 헤더에 원래 요청 주소가 들어 있습니다.
 */
function getServiceOrigin(request) {
  const requestUrl = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0].trim() ||
    request.headers.get("host") ||
    requestUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
    requestUrl.protocol.replace(":", "");

  return `${proto}://${host}`;
}

/*
 * getServiceHosts()
 *
 * 이 서비스 자신을 가리키는 hostname 목록입니다.
 * 현재 요청의 host와 Vercel이 제공하는 배포 주소 환경변수를 모두 포함합니다.
 */
function getServiceHosts(request) {
  const candidates = [
    new URL(request.url).host,
    request.headers.get("host"),
    request.headers.get("x-forwarded-host")?.split(",")[0].trim(),
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ];

  return new Set(candidates.map(normalizeHost).filter(Boolean));
}

/*
 * POST()
 *
 * 클라이언트가 보낸 URL을 검사하고,
 * 문제가 없으면 short URL을 생성하여 반환합니다.
 */
export async function POST(request) {
  try {

    /*
     * 1. 요청 body 읽기
     */
    const body = await request.json().catch(() => null);

    const raw = body?.originalUrl;
    const originalUrl =
      typeof raw === "string" ? raw.trim() : "";


    /*
     * 2. URL이 입력되지 않은 경우 → 400 Bad Request
     */
    if (!originalUrl) {
      return errorResponse(400, "MISSING_URL", "Original URL is required.");
    }


    /*
     * 3. URL이 너무 긴 경우 → 400 Bad Request
     */
    if (originalUrl.length > MAX_URL_LENGTH) {
      return errorResponse(
        400,
        "URL_TOO_LONG",
        `URL must be ${MAX_URL_LENGTH} characters or fewer.`
      );
    }


    /*
     * 4. URL 형식 검사 → 형식이 잘못되면 400 Bad Request
     */
    let parsedUrl;

    try {
      parsedUrl = new URL(originalUrl);
    } catch {
      return errorResponse(
        400,
        "INVALID_URL",
        "URL must start with http:// or https://."
      );
    }


    /*
     * 5. 프로토콜 검사 (javascript:, ftp: 등 차단) → 400 Bad Request
     */
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return errorResponse(
        400,
        "INVALID_URL",
        "URL must start with http:// or https://."
      );
    }


    /*
     * 6. 자기 서비스 URL 차단 → 400 Bad Request
     *
     * 이 서비스의 short URL을 다시 단축하면
     * 리다이렉트가 서비스 내부에서 반복될 수 있으므로 거부합니다.
     * 경로·프로토콜(http/https)과 관계없이 hostname이 같으면 차단합니다.
     */
    const targetHost = normalizeHost(parsedUrl.hostname);

    if (getServiceHosts(request).has(targetHost)) {
      return errorResponse(
        400,
        "SELF_REFERENCE_URL",
        "URLs pointing to this service cannot be shortened."
      );
    }


    /*
     * 7. Short URL 생성 및 DB 저장
     *
     * 같은 URL은 같은 shortCode가 되므로,
     * 이미 저장된 URL이면 새로 저장하지 않고 기존 shortCode를 200으로 반환합니다.
     */
    const shortCode = createShortCode(originalUrl);
    const saved = await saveUrl(shortCode, originalUrl);

    if (!saved.created && saved.originalUrl !== originalUrl) {
      // 해시 충돌: 다른 URL이 이미 같은 shortCode를 사용 중입니다.
      return errorResponse(
        409,
        "SHORT_CODE_CONFLICT",
        "Failed to create a unique short URL."
      );
    }

    const baseUrl = getServiceOrigin(request);

    return NextResponse.json(
      {
        shortCode,
        shortUrl: `${baseUrl}/${shortCode}`,
        originalUrl,
      },
      { status: saved.created ? 201 : 200 }
    );

  } catch (error) {
    console.error("Failed to create short URL", error);

    /*
     * 8. 서버 내부 오류 → 500 Internal Server Error
     */
    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "Failed to create short URL."
    );
  }
}
