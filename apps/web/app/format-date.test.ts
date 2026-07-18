import { describe, expect, it } from "vitest";
import { formatLocalDateTime, localizeDateTimesInText } from "./format-date";

describe("date formatting", () => {
  it("formats an ISO timestamp for the user's locale and timezone", () => {
    const formatted = formatLocalDateTime("2026-07-18T01:29:45.024Z", "en-AU");

    expect(formatted).not.toBe("2026-07-18T01:29:45.024Z");
    expect(formatted).not.toContain(":45");
    expect(formatted).not.toContain("GMT");
  });

  it("localizes ISO timestamps embedded in answer copy", () => {
    const text = localizeDateTimesInText(
      "Oldest critical source time: 2026-07-18T01:29:45.024Z.",
      "en-AU",
    );

    expect(text).toContain("Oldest critical source time:");
    expect(text).not.toContain("2026-07-18T01:29:45.024Z");
  });

  it("leaves invalid values unchanged", () => {
    expect(formatLocalDateTime("not-a-date", "en-AU")).toBe("not-a-date");
  });
});
