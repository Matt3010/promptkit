import { describe, expect, it } from "vitest";
import type { PromptKitActionHandler } from "../src/actions.js";

const returnsUndefined: PromptKitActionHandler = () => undefined;
const returnsUndefinedAsync: PromptKitActionHandler = async () => undefined;

// @ts-expect-error Action handlers cannot return arbitrary strings.
const returnsString: PromptKitActionHandler = () => "ok";

// @ts-expect-error Action handlers cannot return objects outside PromptKitActionResult.
const returnsInventedObject: PromptKitActionHandler = () => ({ inventato: true });

describe("PromptKitActionHandler typing", () => {
  it("keeps undefined as the intentional no-result value", async () => {
    expect(returnsUndefined({ trigger: "manual" })).toBeUndefined();
    await expect(returnsUndefinedAsync({ trigger: "manual" })).resolves.toBeUndefined();
    expect(typeof returnsString).toBe("function");
    expect(typeof returnsInventedObject).toBe("function");
  });
});
