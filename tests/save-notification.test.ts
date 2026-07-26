import { describe, expect, it } from "vitest";
import { shouldShowSaveSuccess } from "../lib/client/save-notification";

describe("global save success notifications", () => {
  it("shows for updates on every API page", () => {
    expect(shouldShowSaveSuccess("/api/kpis/123", "PATCH")).toBe(true);
    expect(shouldShowSaveSuccess("/api/profile", "PUT")).toBe(true);
  });

  it("shows for resource creation", () => {
    expect(shouldShowSaveSuccess("/api/kpis", "POST")).toBe(true);
    expect(shouldShowSaveSuccess("/api/business-context-models/123/business-objects", "POST")).toBe(true);
    expect(shouldShowSaveSuccess("/api/dashboards/123/blocks", "POST")).toBe(true);
    expect(shouldShowSaveSuccess("/api/business-fields/123/describe", "POST")).toBe(true);
    expect(shouldShowSaveSuccess("/api/business-context-models/123/generate-kpis", "POST")).toBe(true);
  });

  it("does not show for reads or background actions", () => {
    expect(shouldShowSaveSuccess("/api/kpis", "GET")).toBe(false);
    expect(shouldShowSaveSuccess("/api/kpis/123/validate", "POST")).toBe(false);
    expect(shouldShowSaveSuccess("/api/published-dashboards/x/view", "POST")).toBe(false);
  });
});
