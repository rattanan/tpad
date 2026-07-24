import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isSameOrigin } from "../lib/auth/request";

describe("same-origin request validation", () => {
  it("accepts the public origin forwarded by a reverse proxy", () => {
    const request = new NextRequest("http://127.0.0.1:3000/api/auth/login", {
      method: "POST",
      headers: {
        origin: "https://tpad.rattanan.dev",
        host: "127.0.0.1:3000",
        "x-forwarded-host": "tpad.rattanan.dev",
        "x-forwarded-proto": "https",
      },
    });

    expect(isSameOrigin(request)).toBe(true);
  });

  it("rejects a cross-site origin even when routed through a proxy", () => {
    const request = new NextRequest("http://127.0.0.1:3000/api/auth/login", {
      method: "POST",
      headers: {
        origin: "https://malicious.example",
        host: "127.0.0.1:3000",
        "x-forwarded-host": "tpad.rattanan.dev",
        "x-forwarded-proto": "https",
      },
    });

    expect(isSameOrigin(request)).toBe(false);
  });
});
