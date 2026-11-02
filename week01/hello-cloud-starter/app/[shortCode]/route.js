import { findUrlByShortCode } from "../../lib/db";
import { recordClick } from "../../lib/stats";

export const dynamic = "force-dynamic";

// /api/shorten이 만드는 shortCode는 항상 6자리 영숫자입니다.
const SHORT_CODE_PATTERN = /^[A-Za-z0-9]{6}$/;

function notFoundResponse() {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request, { params }) {
  const { shortCode } = await params;

  // 형식이 맞지 않는 값은 DB를 조회하지 않고 바로 404를 반환합니다.
  if (!SHORT_CODE_PATTERN.test(shortCode)) {
    console.warn("Short URL not found", { shortCode });
    return notFoundResponse();
  }

  const originalUrl = await findUrlByShortCode(shortCode);

  if (!originalUrl) {
    console.warn("Short URL not found", { shortCode });
    return notFoundResponse();
  }

  // 통계 기록에 실패해도 핵심 기능인 Redirect는 계속 수행합니다.
  try {
    await recordClick(shortCode);
  } catch (error) {
    console.error("Failed to record click", { shortCode });
  }

  return new Response(null, {
    status: 307,
    headers: {
      Location: originalUrl,
      "Cache-Control": "no-store",
    },
  });
}
