import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
describe("registration surface", () => { it("does not expose signup pages or APIs", () => { for (const path of ["app/signup/page.tsx", "app/register/page.tsx", "app/api/auth/signup/route.ts", "app/api/auth/register/route.ts"]) expect(existsSync(resolve(path))).toBe(false); }); });
