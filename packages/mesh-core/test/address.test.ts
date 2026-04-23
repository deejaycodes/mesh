import { describe, it, expect } from "vitest";
import { parseAddress } from "../src/address.js";

describe("parseAddress", () => {
  it("parses tenant/role addresses", () => {
    expect(parseAddress("safevoice/triage")).toEqual({
      tenant: "safevoice",
      role: "triage",
    });
  });

  it("parses tenant/role/instance addresses", () => {
    expect(parseAddress("safevoice/caseworker/alice")).toEqual({
      tenant: "safevoice",
      role: "caseworker",
      instance: "alice",
    });
  });

  it("rejects single-segment values", () => {
    expect(parseAddress("safevoice")).toBeNull();
  });

  it("rejects four-segment values", () => {
    expect(parseAddress("a/b/c/d")).toBeNull();
  });

  it("rejects empty segments", () => {
    expect(parseAddress("safevoice//triage")).toBeNull();
    expect(parseAddress("/triage")).toBeNull();
    expect(parseAddress("safevoice/")).toBeNull();
  });
});
