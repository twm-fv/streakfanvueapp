import { describe, expect, it } from "vitest";
import { coalesce, inFlightCount } from "./coalesce";

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

describe("coalesce", () => {
  it("runs the operation once for concurrent callers on the same key", async () => {
    let runs = 0;
    const op = async () => {
      runs++;
      await tick();
      return "token";
    };

    const results = await Promise.all([
      coalesce("session-1", op),
      coalesce("session-1", op),
      coalesce("session-1", op),
    ]);

    expect(runs).toBe(1);
    expect(results).toEqual(["token", "token", "token"]);
  });

  it("keeps different keys independent", async () => {
    let runs = 0;
    const op = async () => {
      runs++;
      await tick();
      return runs;
    };
    await Promise.all([coalesce("a", op), coalesce("b", op)]);
    expect(runs).toBe(2);
  });

  it("releases the key so a later call runs again", async () => {
    let runs = 0;
    const op = async () => {
      runs++;
      return runs;
    };
    await coalesce("k", op);
    await coalesce("k", op);
    expect(runs).toBe(2);
    expect(inFlightCount()).toBe(0);
  });

  it("releases the key when the operation rejects", async () => {
    const boom = async () => {
      throw new Error("refresh rejected");
    };
    await expect(coalesce("k2", boom)).rejects.toThrow("refresh rejected");
    expect(inFlightCount()).toBe(0);

    // A failed refresh must not wedge the session forever.
    await expect(coalesce("k2", async () => "recovered")).resolves.toBe("recovered");
  });

  it("gives a rejection to every concurrent caller", async () => {
    const boom = async () => {
      await tick();
      throw new Error("nope");
    };
    const results = await Promise.allSettled([coalesce("k3", boom), coalesce("k3", boom)]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
  });
});
