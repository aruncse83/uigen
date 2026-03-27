// @vitest-environment node
// jose's crypto primitives require the Node environment — jsdom's Uint8Array
// differs enough to cause "payload must be an instance of Uint8Array" errors.
import { test, expect, vi, beforeEach } from "vitest";
import { jwtVerify } from "jose";

// Mock "server-only" so vitest doesn't throw when importing auth.ts
vi.mock("server-only", () => ({}));

// Capture the value passed to cookieStore.set so we can assert on it
const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      set: mockCookieSet,
    }),
}));

// Import after mocks are in place
const { createSession } = await import("@/lib/auth");

// JWT secret must match the default used in auth.ts
const JWT_SECRET = new TextEncoder().encode("development-secret-key");

beforeEach(() => {
  // Reset call history before each test
  mockCookieSet.mockClear();
});

test("createSession sets an httpOnly cookie named auth-token", async () => {
  // Arrange
  await createSession("user-1", "test@example.com");

  // Assert the cookie name is correct
  expect(mockCookieSet).toHaveBeenCalledOnce();
  const [cookieName] = mockCookieSet.mock.calls[0];
  expect(cookieName).toBe("auth-token");
});

test("createSession cookie has correct security options", async () => {
  // Arrange
  await createSession("user-1", "test@example.com");

  // Assert httpOnly, sameSite, path options
  const [, , options] = mockCookieSet.mock.calls[0];
  expect(options.httpOnly).toBe(true);
  expect(options.sameSite).toBe("lax");
  expect(options.path).toBe("/");
});

test("createSession cookie is not secure outside production", async () => {
  // NODE_ENV is 'test' in vitest, so secure should be false
  await createSession("user-1", "test@example.com");

  const [, , options] = mockCookieSet.mock.calls[0];
  expect(options.secure).toBe(false);
});

test("createSession cookie expires approximately 7 days from now", async () => {
  // Arrange
  const before = Date.now();
  await createSession("user-1", "test@example.com");
  const after = Date.now();

  const [, , options] = mockCookieSet.mock.calls[0];
  const expiresMs = options.expires.getTime();

  // Allow ±1 second tolerance around the expected 7-day expiry
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDays - 1000);
  expect(expiresMs).toBeLessThanOrEqual(after + sevenDays + 1000);
});

test("createSession token contains correct userId and email in payload", async () => {
  // Arrange
  await createSession("user-42", "hello@world.com");

  // Extract the signed token from the cookie call and verify it
  const [, token] = mockCookieSet.mock.calls[0];
  const { payload } = await jwtVerify(token, JWT_SECRET);

  expect(payload.userId).toBe("user-42");
  expect(payload.email).toBe("hello@world.com");
});

test("createSession token uses HS256 algorithm", async () => {
  // The header of a JWT is base64url-encoded JSON
  await createSession("user-1", "test@example.com");

  const [, token] = mockCookieSet.mock.calls[0];
  const headerB64 = token.split(".")[0];
  const header = JSON.parse(atob(headerB64.replace(/-/g, "+").replace(/_/g, "/")));

  expect(header.alg).toBe("HS256");
});
