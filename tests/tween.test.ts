/**
 * @jest-environment jsdom
 */

import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import * as _ from "underscore";

import * as chip from "../src/chip";
import * as tween from "../src/tween";

// To keep the math simple, we will imagine that each frame takes 10 ms
const frameTime = 10;

function makeChipContext(): chip.ChipContext {
  return { rootValue: 1 };
}

function makeTickInfo(): chip.TickInfo {
  return {
    timeSinceLastTick: frameTime,
  };
}

function makeSignal(): chip.Signal {
  return chip.makeSignal();
}

describe("Tween", () => {
  test("updates and waits for the right amount of time", async () => {
    const t = new tween.Tween({ from: 0, to: 10, duration: frameTime * 10 });

    t.activate(makeTickInfo(), makeChipContext(), makeSignal());
    expect(t.value === 0);

    // It should run 10 times and then stop
    for (let i = 0; i < 10; i++) {
      t.tick(makeTickInfo());
      expect(t.value).toBeCloseTo(i + 1, 0.1);
    }
    expect(t.chipState).toBe("requestedTermination");

    t.terminate(makeTickInfo());
    expect(t.chipState).toBe("inactive");
  });
});
