import * as entity from "../src/entity";
import * as PIXI from "pixi.js";

function makeEntityConfig(): entity.EntityConfig {
  return {
    container: new PIXI.Container(),
  };
}

function makeFrameInfo(): entity.FrameInfo {
  return {
    playTime: 1000,
    timeSinceStart: 9000,
    timeSinceLastFrame: 1 / 60,
    timeScale: 1,
    gameState: "playing",
  };
}

describe("Entity", () => {
  test("allows normal execution", () => {
    const e = new entity.NullEntity();

    for (let i = 0; i < 5; i++) {
      e.setup(makeFrameInfo(), makeEntityConfig());
      e.update(makeFrameInfo());
      e.onSignal(makeFrameInfo(), "signal");
      e.teardown(makeFrameInfo());
    }
  });

  test("throws on multiple setup", () => {
    expect(() => {
      const e = new entity.NullEntity();
      e.setup(makeFrameInfo(), makeEntityConfig());
      e.setup(makeFrameInfo(), makeEntityConfig());
    }).toThrow();
  });

  test("throws on update before setup", () => {
    expect(() => {
      const e = new entity.NullEntity();
      e.update(makeFrameInfo());
    }).toThrow();
  });

  test("throws on teardown before setup", () => {
    expect(() => {
      const e = new entity.NullEntity();
      e.teardown(makeFrameInfo());
    }).toThrow();
  });

  test("throws on onSignal before setup", () => {
    expect(() => {
      const e = new entity.NullEntity();
      e.onSignal(makeFrameInfo(), "signal");
    }).toThrow();
  });
});
