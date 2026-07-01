const defaultAllowedOrigins = [
  "http://localhost:7999",
  "http://127.0.0.1:7999",
  "https://demo-experiment.vercel.app",
];

function configuredAllowedOrigins() {
  const configured = process.env.PALMPAY_PALM_ALLOWED_ORIGINS?.trim();
  if (!configured) return defaultAllowedOrigins;

  return configured
    .split(/[,\s;]+/)
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function isLocalOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export function palmCorsHeaders(request: Request) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "") ?? "";
  const allowedOrigins = configuredAllowedOrigins();
  const allowOrigin =
    origin && (allowedOrigins.includes(origin) || isLocalOrigin(origin)) ? origin : "";

  return {
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin } : {}),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
    Vary: "Origin",
  };
}

export function palmOptionsResponse(request: Request) {
  return new Response(null, {
    headers: palmCorsHeaders(request),
    status: 204,
  });
}
