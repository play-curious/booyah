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
  let e: entity.Entity;

  beforeEach(() => {
    e = new entity.NullEntity();
    e._setup = jest.fn();
    e._update = jest.fn();
    e._teardown = jest.fn();
    e._onSignal = jest.fn();
  });

  test("allows normal execution", () => {
    for (let i = 0; i < 5; i++) {
      e.setup(makeFrameInfo(), makeEntityConfig());
      e.update(makeFrameInfo());
      e.onSignal(makeFrameInfo(), "signal");
      e.teardown(makeFrameInfo());
    }

    expect(e._setup).toBeCalledTimes(5);
    expect(e._update).toBeCalledTimes(5);
    expect(e._teardown).toBeCalledTimes(5);
    expect(e._onSignal).toBeCalledTimes(5);
  });

  test("throws on multiple setup", () => {
    expect(() => {
      e.setup(makeFrameInfo(), makeEntityConfig());
      e.setup(makeFrameInfo(), makeEntityConfig());
    }).toThrow();
  });

  test("throws on update before setup", () => {
    expect(() => {
      e.update(makeFrameInfo());
    }).toThrow();
  });

  test("throws on teardown before setup", () => {
    expect(() => {
      e.teardown(makeFrameInfo());
    }).toThrow();
  });

  test("throws on onSignal before setup", () => {
    expect(() => {
      e.onSignal(makeFrameInfo(), "signal");
    }).toThrow();
  });
});
