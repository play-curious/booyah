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

function makeMockEntity(): entity.Entity {
  const e = new entity.NullEntity();
  e._setup = jest.fn();
  e._update = jest.fn();
  e._teardown = jest.fn();
  e._onSignal = jest.fn();
  return e;
}

describe("Entity", () => {
  let e: entity.Entity;

  beforeEach(() => {
    e = makeMockEntity();
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

describe("CompositeEntity", () => {
  let parent: entity.CompositeEntity;
  let children: entity.Entity[];

  beforeEach(() => {
    children = [makeMockEntity(), makeMockEntity(), makeMockEntity()];

    // Anonymous subclass
    parent = new (class extends entity.CompositeEntity {
      _setup() {
        for (let i = 0; i < 3; i++) this._activateChildEntity(children[i]);
      }
    })();
  });

  test("runs children", () => {
    for (let i = 0; i < 5; i++) {
      parent.setup(makeFrameInfo(), makeEntityConfig());
      parent.update(makeFrameInfo());
      parent.onSignal(makeFrameInfo(), "signal");
      parent.teardown(makeFrameInfo());
    }

    for (const child of children) {
      expect(child._setup).toBeCalledTimes(5);
      expect(child._update).toBeCalledTimes(5);
      expect(child._onSignal).toBeCalledTimes(5);
      expect(child._teardown).toBeCalledTimes(5);
    }
  });

  test("deactivates children", () => {
    // Have middle child request transition on 2nd call
    let requestTransition = false;
    children[1]._update = jest.fn(() => {
      if (requestTransition) children[1].transition = entity.makeTransition();
    });

    // Run once
    parent.setup(makeFrameInfo(), makeEntityConfig());
    parent.update(makeFrameInfo());

    // Run again, this time have middle child request transition
    requestTransition = true;
    parent.update(makeFrameInfo());

    expect(children[1]._setup).toBeCalledTimes(1);
    expect(children[1]._teardown).toBeCalledTimes(1);
    expect(children[1]._update).toBeCalledTimes(2);

    expect(children[2]._setup).toBeCalledTimes(1);
    expect(children[2]._teardown).toBeCalledTimes(0);
    expect(children[2]._update).toBeCalledTimes(2);
  });
});
