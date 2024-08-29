/**
 * @jest-environment jsdom
 */

import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import * as _ from "underscore";

import * as chip from "../src/chip";
import * as running from "../src/running";

const frameTime = 16;

async function wait(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

describe("Running", () => {
  test("runs a chip once", async () => {
    let ranCount = 0;
    const rootChip = new chip.Lambda(() => ranCount++);
    const runner = new running.Runner(rootChip);

    expect(runner.runningStatus).toBe("stopped");

    runner.start();

    // Short wait
    await wait(frameTime * 5);

    expect(ranCount).toBe(1);
    expect(runner.runningStatus).toBe("stopped");
  });

  test("runs a chip multiple times", async () => {
    let ranCount = 0;
    const rootChip = new chip.Functional({
      tick: () => ranCount++,
      shouldTerminate: () => ranCount >= 3,
    });

    const runner = new running.Runner(rootChip);

    runner.start();

    // Short wait
    await wait(frameTime * 5);

    expect(ranCount).toBe(3);
    expect(rootChip.chipState === "inactive");
    expect(runner.runningStatus).toBe("stopped");
  });

  test("stops on demand", async () => {
    let ranCount = 0;
    const rootChip = new chip.Functional({
      tick: () => ranCount++,
    });

    const runner = new running.Runner(rootChip);

    runner.start();

    // Short wait
    await wait(frameTime * 5);

    expect(runner.runningStatus).toBe("running");

    runner.stop();

    expect(ranCount).toBeGreaterThan(0);
    expect(rootChip.chipState === "inactive");
    expect(runner.runningStatus).toBe("stopped");
  });

  test("pauses and resumes based on visibility", async () => {
    // Override the visibilityState property to test it
    type VisibilityValue = "hidden" | "visible";
    let visibility: VisibilityValue = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    const changeVisibility = (value: VisibilityValue) => {
      visibility = value;
      document.dispatchEvent(new Event("visibilitychange"));
    };

    let ranCount = 0;
    const rootChip = new chip.Functional({
      tick: () => ranCount++,
    });

    const runner = new running.Runner(rootChip);

    runner.start();

    // Short wait
    await wait(frameTime * 5);

    expect(ranCount).toBeGreaterThan(0);
    expect(runner.runningStatus).toBe("running");
    expect(rootChip.chipState).toBe("active");

    changeVisibility("hidden");
    ranCount = 0;

    // Short wait
    await wait(frameTime * 5);

    expect(ranCount).toBe(0);
    expect(runner.runningStatus).toBe("paused");
    expect(rootChip.chipState).toBe("paused");

    changeVisibility("visible");

    // Short wait
    await wait(frameTime * 5);

    expect(ranCount).toBeGreaterThan(0);
    expect(runner.runningStatus).toBe("running");

    runner.stop();

    expect(rootChip.chipState).toBe("inactive");
    expect(runner.runningStatus).toBe("stopped");
  });
});
