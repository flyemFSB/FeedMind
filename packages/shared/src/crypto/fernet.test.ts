import { describe, expect, it } from "vitest";
import { decryptValue, encryptValue } from "./fernet.js";

describe("Fernet-compatible encryption", () => {
  it("round-trips stored model API keys", () => {
    const token = encryptValue("sk-feedmind", "feedmind-test-key");

    expect(token).not.toContain("sk-feedmind");
    expect(decryptValue(token, "feedmind-test-key")).toBe("sk-feedmind");
  });

  it("decrypts legacy Python Fernet tokens", () => {
    const pythonToken =
      "gAAAAABqGRsUJAOu31-uWyQEgFlwc5OBp3I60su32yROV7mRXB4s8OWPvrLjwGVSQUCaStK3HdyWE9xxhFMhMk7OfxrwYGuZNAycbLw_XXN2MtJBV-L8jI4=";

    expect(decryptValue(pythonToken, "feedmind-test-key")).toBe("sk-feedmind-python");
  });

  it("keeps empty values empty", () => {
    expect(encryptValue("", "feedmind-test-key")).toBe("");
    expect(decryptValue("", "feedmind-test-key")).toBe("");
  });
});
