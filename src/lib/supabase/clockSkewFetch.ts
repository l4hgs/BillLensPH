/**
 * Clock-Skew Tolerant Fetch & Cookie Normalizer for Supabase Auth
 *
 * Why this is needed:
 * If the local machine's system clock is ahead of real-world UTC time (e.g., set to Oct 2026
 * while Supabase's cloud servers are in April 2026), Supabase Auth responses return an
 * `expires_at` Unix timestamp anchored to the server's clock.
 *
 * `@supabase/auth-js` compares `session.expires_at * 1000` against local `Date.now()`.
 * When the local clock is ahead of the server clock, `@supabase/auth-js` immediately treats
 * a brand-new 1-second-old token as expired, triggers concurrent refresh token collisions
 * between middleware and browser clients, and calls `_removeSession()` — logging the user out!
 *
 * This wrapper normalizes `expires_at` in Supabase Auth responses to `Math.floor(Date.now() / 1000) + expires_in`
 * so client/SSR expiry checks always measure elapsed time relative to the local clock, while
 * leaving the signed `access_token` JWT completely untouched for Supabase server verification.
 */

const ONE_HOUR_SECONDS = 3600;
const CLOCK_SKEW_THRESHOLD_SECONDS = 7200; // 2 hours difference indicates clock skew
const MAX_CHUNK_SIZE = 3180;

function normalizeSessionObject(obj: Record<string, unknown>): boolean {
  let modified = false;

  if (
    typeof obj.access_token === "string" &&
    typeof obj.expires_in === "number" &&
    obj.expires_in > 0
  ) {
    const localNowSec = Math.floor(Date.now() / 1000);
    const expectedLocalExpiresAt = localNowSec + obj.expires_in;

    // Always anchor fresh token responses to local clock + expires_in
    if (
      typeof obj.expires_at !== "number" ||
      Math.abs(expectedLocalExpiresAt - obj.expires_at) > 60
    ) {
      obj.expires_at = expectedLocalExpiresAt;
      modified = true;
    }
  }

  // Handle nested `{ session: { access_token, expires_in, expires_at } }`
  if (obj.session && typeof obj.session === "object") {
    const nestedModified = normalizeSessionObject(
      obj.session as Record<string, unknown>
    );
    if (nestedModified) modified = true;
  }

  return modified;
}

/**
 * Custom `fetch` wrapper passed to `createBrowserClient` / `createServerClient`.
 * Rebases `expires_at` on `/auth/v1/` token responses to the local machine clock.
 */
export const clockSkewSafeFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);

  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

  // Only inspect successful JSON responses from Supabase Auth endpoints
  if (!response.ok || !url.includes("/auth/v1/")) {
    return response;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return response;
  }

  try {
    const cloned = response.clone();
    const data = await cloned.json();

    if (data && typeof data === "object") {
      const wasModified = normalizeSessionObject(
        data as Record<string, unknown>
      );
      if (wasModified) {
        const headers = new Headers(response.headers);
        headers.delete("content-length");
        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
    }
  } catch {
    // If JSON parsing fails, return original response untouched
  }

  return response;
};

function decodeBase64UrlUtf8(base64Url: string): string {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "===".slice((base64.length + 3) % 4);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf8");
  }
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64UrlUtf8(str: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Normalizes an array of `{ name, value }` cookies (used in server.ts and middleware.ts)
 * so any skewed `expires_at` in `sb-*-auth-token` cookies is rebased to the local clock.
 */
export function repairSkewedCookieArray(
  cookies: { name: string; value: string }[]
): { name: string; value: string }[] {
  try {
    const cookieMap = new Map<string, string>();
    for (const c of cookies) {
      cookieMap.set(c.name, c.value);
    }

    const baseKeys = new Set<string>();
    for (const name of cookieMap.keys()) {
      const match = name.match(/^(sb-[a-z0-9]+-auth-token)(?:\.\d+)?$/);
      if (match) baseKeys.add(match[1]);
    }

    if (baseKeys.size === 0) return cookies;

    const localNowSec = Math.floor(Date.now() / 1000);
    const updatedMap = new Map(cookieMap);

    for (const baseKey of baseKeys) {
      const isChunked = cookieMap.has(`${baseKey}.0`);
      let combined = "";

      if (isChunked) {
        let idx = 0;
        while (cookieMap.has(`${baseKey}.${idx}`)) {
          combined += cookieMap.get(`${baseKey}.${idx}`) ?? "";
          idx++;
        }
      } else {
        combined = cookieMap.get(baseKey) ?? "";
      }

      if (!combined.startsWith("base64-")) continue;

      const jsonStr = decodeBase64UrlUtf8(combined.slice("base64-".length));
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

      if (
        typeof parsed.expires_at === "number" &&
        localNowSec - parsed.expires_at > CLOCK_SKEW_THRESHOLD_SECONDS
      ) {
        const expiresIn =
          typeof parsed.expires_in === "number" && parsed.expires_in > 0
            ? parsed.expires_in
            : ONE_HOUR_SECONDS;
        parsed.expires_at = localNowSec + expiresIn;

        const updatedEncoded =
          "base64-" + encodeBase64UrlUtf8(JSON.stringify(parsed));

        if (!isChunked && updatedEncoded.length <= MAX_CHUNK_SIZE) {
          updatedMap.set(baseKey, updatedEncoded);
        } else {
          for (let i = 0; i * MAX_CHUNK_SIZE < updatedEncoded.length; i++) {
            const chunk = updatedEncoded.slice(
              i * MAX_CHUNK_SIZE,
              (i + 1) * MAX_CHUNK_SIZE
            );
            updatedMap.set(`${baseKey}.${i}`, chunk);
          }
        }
      }
    }

    return Array.from(updatedMap.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  } catch {
    return cookies;
  }
}

/**
 * Repairs an existing base64url-encoded Supabase auth cookie in `document.cookie`
 * (both single and chunked `.0`, `.1` cookies) if its `expires_at` is skewed into the past.
 */
export function repairSkewedBrowserAuthCookies(): void {
  if (typeof document === "undefined" || !document.cookie) return;

  try {
    const rawEntries = document.cookie.split("; ");
    const inputCookies: { name: string; value: string }[] = [];

    for (const entry of rawEntries) {
      const eqIdx = entry.indexOf("=");
      if (eqIdx === -1) continue;
      const name = entry.slice(0, eqIdx).trim();
      const value = decodeURIComponent(entry.slice(eqIdx + 1));
      inputCookies.push({ name, value });
    }

    const repaired = repairSkewedCookieArray(inputCookies);
    for (let i = 0; i < repaired.length; i++) {
      const { name, value } = repaired[i];
      const original = inputCookies.find((c) => c.name === name);
      if (!original || original.value !== value) {
        document.cookie = `${name}=${value}; path=/; max-age=${
          60 * 60 * 24 * 400
        }; SameSite=Lax`;
      }
    }
  } catch {
    // Ignore malformed cookies
  }
}

