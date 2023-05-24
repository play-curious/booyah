/**
 * @jest-environment jsdom
 */

import * as _ from "underscore";
import { jest, describe, expect, test, beforeEach } from "@jest/globals";

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

    expect(runner.isRunning).toBe(false);

    runner.start();

    // Short wait
    await wait(frameTime * 5);

    expect(ranCount).toBe(1);
    expect(runner.isRunning).toBe(false);
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
    expect(rootChip.state === "inactive");
    expect(runner.isRunning).toBe(false);
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

    expect(runner.isRunning).toBe(true);

    runner.stop();

    expect(ranCount).toBeGreaterThan(0);
    expect(rootChip.state === "inactive");
    expect(runner.isRunning).toBe(false);
  });
});
