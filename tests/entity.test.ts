import * as PIXI from "pixi.js";
import * as _ from "underscore";

import * as entity from "../src/entity";

function makeEntityConfig(): entity.EntityConfig {
  return {};
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

function makeTransition(): entity.Transition {
  return entity.makeTransition();
}

// For help mocking, the methods here are public and replaced with mocks
class MockEntity extends entity.EntityBase {
  constructor() {
    super();
    this._setup = jest.fn();
    this._update = jest.fn();
    this._teardown = jest.fn();
    this._onSignal = jest.fn();
  }

  // Allow the tests to set the transition directly
  // Need to rewrite the getter as well to make TypeScript happy
  public get transition(): entity.Transition {
    return this._transition;
  }
  public set transition(transition: entity.Transition) {
    this._transition = transition;
  }

  // Make the methods public so that they can be tested with the mock
  public _setup() {}
  public _update() {}
  public _teardown() {}
  public _onSignal() {}
}

describe("Entity", () => {
  let e: MockEntity;

  beforeEach(() => {
    e = new MockEntity();
  });

  test("allows normal execution", () => {
    for (let i = 0; i < 5; i++) {
      e.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
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
      e.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
      e.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
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

  test("receives events", () => {
    const sender = new MockEntity();
    const receiver = new (class extends entity.EntityBase {
      constructor() {
        super();

        this.receiveA = jest.fn();
        this.receiveB = jest.fn();
      }

      _setup() {
        this._on(sender, "a", this.receiveA);
        this._once(sender, "b", this.receiveB);
      }

      receiveA() {}
      receiveB() {}
    })();

    // Setup the receiver and send one event
    receiver.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
    sender.emit("a", 1, 2, 3);
    sender.emit("a", 1, 2, 3);
    sender.emit("b", 1, 2, 3);
    sender.emit("b", 1, 2, 3);

    expect(receiver.receiveA).toBeCalledWith(1, 2, 3);
    expect(receiver.receiveB).toBeCalledWith(1, 2, 3);

    // Teardown the receiver and send more events that should not be recieved
    receiver.teardown(makeFrameInfo());
    sender.emit("a");
    sender.emit("b");

    expect(receiver.receiveA).toBeCalledTimes(2);
    expect(receiver.receiveB).toBeCalledTimes(1);
  });
});

describe("CompositeEntity", () => {
  let parent: entity.CompositeEntity;
  let children: MockEntity[];

  beforeEach(() => {
    children = [new MockEntity(), new MockEntity(), new MockEntity()];

    // Anonymous subclass
    parent = new (class extends entity.CompositeEntity {
      _setup() {
        for (let i = 0; i < 3; i++) this._activateChildEntity(children[i]);
      }
    })();
  });

  test("runs children", () => {
    for (let i = 0; i < 5; i++) {
      parent.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
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
    parent.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
    parent.update(makeFrameInfo());

    // Run again, this time have middle child request transition
    requestTransition = true;
    parent.update(makeFrameInfo());
    parent.update(makeFrameInfo());

    expect(children[1]._setup).toBeCalledTimes(1);
    expect(children[1]._teardown).toBeCalledTimes(1);
    expect(children[1]._update).toBeCalledTimes(2);

    expect(children[2]._setup).toBeCalledTimes(1);
    expect(children[2]._teardown).toBeCalledTimes(0);
    expect(children[2]._update).toBeCalledTimes(3);
  });

  test("send activation events", () => {
    const deactivatedCallback = jest.fn();
    parent.on("deactivatedChildEntity", deactivatedCallback);

    // Run once
    parent.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
    children[1].transition = entity.makeTransition();
    parent.update(makeFrameInfo());

    expect(deactivatedCallback).toBeCalledTimes(1);

    // Teardown and setup again
    parent.teardown(makeFrameInfo());

    expect(deactivatedCallback).toBeCalledTimes(3);

    const activatedCallback = jest.fn();
    parent.on("activatedChildEntity", activatedCallback);

    parent.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());

    expect(activatedCallback).toBeCalledTimes(3);
  });
});

describe("ParallelEntity", () => {
  test("runs children", () => {
    const children = [new MockEntity(), new MockEntity(), new MockEntity()];
    const parent = new entity.ParallelEntity(children);

    for (let i = 0; i < 5; i++) {
      parent.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
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

  test("children can be inactive at start", () => {
    const middleChildContext = {
      entity: new MockEntity(),
      activated: false,
    };
    const parent = new entity.ParallelEntity([
      new MockEntity(),
      middleChildContext,
      new MockEntity(),
    ]);

    // Run once
    parent.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
    parent.update(makeFrameInfo());

    expect(middleChildContext.entity._setup).not.toBeCalled();
    expect((parent.children[0] as MockEntity)._setup).toBeCalled();
  });

  test("can activate and deactivate children", () => {
    const children = [new MockEntity(), new MockEntity(), new MockEntity()];
    const parent = new entity.ParallelEntity(children);

    // Run once
    parent.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
    parent.update(makeFrameInfo());

    // Deactivate middle child and run
    parent.deactivateChildEntity(1);
    parent.update(makeFrameInfo());

    // Reactivate middle child, deactivate third child, and run
    parent.activateChildEntity(1);
    parent.deactivateChildEntity(2);
    parent.update(makeFrameInfo());

    expect(children[0]._update).toBeCalledTimes(3);
    expect(children[1]._update).toBeCalledTimes(2);
    expect(children[2]._update).toBeCalledTimes(2);
  });
});

describe("EntitySequence", () => {
  test("runs only one child at a time", () => {
    const children = [new MockEntity(), new MockEntity(), new MockEntity()];
    const parent = new entity.EntitySequence(children);

    for (let i = 0; i < 5; i++) {
      parent.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
      parent.update(makeFrameInfo());
      parent.onSignal(makeFrameInfo(), "signal");
      parent.teardown(makeFrameInfo());
    }

    // First child should be called
    expect(children[0]._setup).toBeCalledTimes(5);
    expect(children[0]._update).toBeCalledTimes(5);
    expect(children[0]._onSignal).toBeCalledTimes(5);
    expect(children[0]._teardown).toBeCalledTimes(5);

    // The others not
    for (const child of _.rest(children)) {
      expect(child._setup).toBeCalledTimes(0);
      expect(child._update).toBeCalledTimes(0);
      expect(child._onSignal).toBeCalledTimes(0);
      expect(child._teardown).toBeCalledTimes(0);
    }
  });

  test("runs only one child after another", () => {
    const children = [new MockEntity(), new MockEntity(), new MockEntity()];
    const parent = new entity.EntitySequence(children);

    parent.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());

    // Run 1st child twice, then request transition
    parent.update(makeFrameInfo());
    parent.update(makeFrameInfo());
    children[0].transition = entity.makeTransition();
    parent.update(makeFrameInfo());

    // Run 2nd child twice, then request transition
    parent.update(makeFrameInfo());
    parent.update(makeFrameInfo());
    children[1].transition = entity.makeTransition();
    parent.update(makeFrameInfo());

    // Run 3rd child twice, then request transition
    parent.update(makeFrameInfo());
    parent.update(makeFrameInfo());
    children[2].transition = entity.makeTransition("third");
    parent.update(makeFrameInfo());

    // Each child should be updated three times
    for (const child of _.rest(children)) {
      expect(child._setup).toBeCalledTimes(1);
      expect(child._update).toBeCalledTimes(3);
      expect(child._teardown).toBeCalledTimes(1);
    }

    // Final transition should be that of the 3rd child
    expect(parent.transition.name).toBe("third");
  });

  test("loops", () => {
    const children = [new MockEntity(), new MockEntity()];
    const parent = new entity.EntitySequence(children, { loop: true });

    parent.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());

    // Run 1st child, then request transition
    parent.update(makeFrameInfo());
    children[0].transition = entity.makeTransition();
    parent.update(makeFrameInfo());

    // Run 2nd child, then request transition
    parent.update(makeFrameInfo());
    children[1].transition = entity.makeTransition();
    parent.update(makeFrameInfo());

    // Run 1st child again
    parent.update(makeFrameInfo());

    // The first child should be setup twice
    expect(children[0]._setup).toBeCalledTimes(2);
    expect(children[0]._update).toBeCalledTimes(3);
    expect(children[0]._teardown).toBeCalledTimes(1);

    // The second child should be setup once
    expect(children[1]._setup).toBeCalledTimes(1);
    expect(children[1]._update).toBeCalledTimes(2);
    expect(children[1]._teardown).toBeCalledTimes(1);

    // There should be no requested transition
    expect(parent.transition).toBeFalsy();
  });

  test("skips", () => {
    const children = [new MockEntity(), new MockEntity()];
    const parent = new entity.EntitySequence(children);

    parent.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());

    // Run 1st child, then skip
    parent.update(makeFrameInfo());
    parent.skip();
    parent.update(makeFrameInfo());
    parent.skip();

    // The first child should be setup and torn down
    expect(children[0]._setup).toBeCalledTimes(1);
    expect(children[0]._update).toBeCalledTimes(1);
    expect(children[0]._teardown).toBeCalledTimes(1);

    // The second child should be setup and torn down
    expect(children[1]._setup).toBeCalledTimes(1);
    expect(children[1]._update).toBeCalledTimes(1);
    expect(children[0]._teardown).toBeCalledTimes(1);

    // There should be a skipped transition
    expect(parent.transition.name).toBe("skip");
  });
});

describe("StateMachine", () => {
  test("runs start state", () => {
    const states = { start: new MockEntity() };
    const stateMachine = new entity.StateMachine(states);

    for (let i = 0; i < 5; i++) {
      stateMachine.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
      stateMachine.update(makeFrameInfo());
      stateMachine.onSignal(makeFrameInfo(), "signal");
      stateMachine.teardown(makeFrameInfo());
    }

    // First child should be called 5 times
    expect(states.start._setup).toBeCalledTimes(5);
    expect(states.start._update).toBeCalledTimes(5);
    expect(states.start._onSignal).toBeCalledTimes(5);
    expect(states.start._teardown).toBeCalledTimes(5);
  });

  test("goes from start to end", () => {
    const states = { start: new MockEntity() };
    const stateMachine = new entity.StateMachine(states);

    // Run once, then request transition
    stateMachine.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
    stateMachine.update(makeFrameInfo());
    states.start.transition = entity.makeTransition("end");
    stateMachine.update(makeFrameInfo());

    expect(states.start._setup).toBeCalledTimes(1);
    expect(states.start._update).toBeCalledTimes(1);
    expect(states.start._teardown).toBeCalledTimes(1);

    expect(stateMachine.transition.name).toBe("end");
    expect(stateMachine.visitedStates).toContainEqual(
      entity.makeTransition("start")
    );
  });

  test("transitions without state table", () => {
    const states = { a: new MockEntity(), b: new MockEntity() };
    const stateMachine = new entity.StateMachine(states, {
      startingState: entity.makeTransition("a"),
    });

    // Run once, then request transition
    stateMachine.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
    stateMachine.update(makeFrameInfo());
    states.a.transition = entity.makeTransition("b");
    stateMachine.update(makeFrameInfo());

    expect(states.a._setup).toBeCalledTimes(1);
    expect(states.a._update).toBeCalledTimes(1);
    expect(states.a._teardown).toBeCalledTimes(1);

    expect(states.b._setup).toBeCalledTimes(1);
  });

  test("transitions with state table", () => {
    const states = { a: new MockEntity(), b: new MockEntity() };
    const stateMachine = new entity.StateMachine(states, {
      startingState: entity.makeTransition("a"),
      transitions: {
        a: "b",
        b: "a",
      },
    });

    // Run once, then request transition
    stateMachine.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
    stateMachine.update(makeFrameInfo());
    states.a.transition = entity.makeTransition();
    stateMachine.update(makeFrameInfo());

    // Transition back again
    states.b.transition = entity.makeTransition();
    stateMachine.update(makeFrameInfo());

    expect(states.a._setup).toBeCalledTimes(2);
    expect(states.a._teardown).toBeCalledTimes(1);

    expect(states.b._setup).toBeCalledTimes(1);
    expect(states.b._teardown).toBeCalledTimes(1);
  });

  test("manual transitions", () => {
    const states = { a: new MockEntity(), b: new MockEntity() };
    const stateMachine = new entity.StateMachine(states, {
      startingState: entity.makeTransition("a"),
    });

    // Run once, then request transition
    stateMachine.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
    stateMachine.update(makeFrameInfo());

    stateMachine.changeState("b");

    stateMachine.update(makeFrameInfo());

    expect(states.a._setup).toBeCalledTimes(1);
    expect(states.a._update).toBeCalledTimes(1);
    expect(states.a._teardown).toBeCalledTimes(1);

    expect(states.b._setup).toBeCalledTimes(1);
  });

  test("transitions with functions", () => {
    const states = { a: new MockEntity(), b: new MockEntity() };
    const stateMachine = new entity.StateMachine(states, {
      startingState: entity.makeTransition("a"),
      transitions: {
        a: jest.fn(() => entity.makeTransition("b")),
      },
    });

    // Run once, then request transition
    stateMachine.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
    stateMachine.update(makeFrameInfo());

    const transition = entity.makeTransition("done", { x: "y" });
    states.a.transition = transition;

    stateMachine.update(makeFrameInfo());

    expect(states.a._setup).toBeCalledTimes(1);
    expect(states.a._update).toBeCalledTimes(1);
    expect(states.a._teardown).toBeCalledTimes(1);

    expect(states.b._setup).toBeCalledTimes(1);

    expect(stateMachine.options.transitions.a).toBeCalledTimes(1);
    expect(stateMachine.options.transitions.a).toBeCalledWith(transition);
  });
});

//// Test hot reload features

class ReloadingEntity extends entity.EntityBase {
  private _value: number;

  constructor(public readonly defaultValue: number) {
    super();
  }

  _setup() {
    // Either take the provided value in the memento, or use the default
    if (this._reloadMemento)
      this._value = this._reloadMemento.data["value"] as number;
    else this._value = this.defaultValue;
  }

  protected _makeReloadMementoData(): entity.ReloadMementoData {
    return {
      value: this._value,
    };
  }

  get value() {
    return this._value;
  }
  set value(value: number) {
    this._value = value;
  }
}

class ReloadingCompositeEntity extends entity.CompositeEntity {
  constructor(private _child: ReloadingEntity) {
    super();
  }

  _setup() {
    this._activateChildEntity(this._child, { id: "a" });
  }
}

describe("Hot reloading", () => {
  test("Base entity doesn't provide memento", () => {
    const e = new entity.NullEntity();
    e.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
    expect(e.makeReloadMemento().data).toBeUndefined();
  });

  test("Custom entity provides memento", () => {
    // Provide a default value
    const e1 = new ReloadingEntity(77);
    e1.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
    expect(e1.makeReloadMemento().data.value).toBe(77);

    // Update the value, it should get in the new memento
    e1.value = 88;
    expect(e1.makeReloadMemento().data.value).toBe(88);

    // Create a new entity from the previous entities memento. It should have the newer value
    const e2 = new ReloadingEntity(77);
    e2.setup(
      makeFrameInfo(),
      makeEntityConfig(),
      makeTransition(),
      e1.makeReloadMemento()
    );
    expect(e2.value).toBe(88);
  });

  test("Entities check for mismatched class names", () => {
    class ReloadingEntity2 extends ReloadingEntity {}

    const e1 = new ReloadingEntity(77);
    e1.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());

    const e2 = new ReloadingEntity2(88);
    e2.setup(
      makeFrameInfo(),
      makeEntityConfig(),
      makeTransition(),
      e1.makeReloadMemento()
    );

    expect(e2.value).toBe(88);
  });

  test("Composite entities will reload their children", () => {
    const child1 = new ReloadingEntity(77);
    const parent1 = new ReloadingCompositeEntity(child1);

    parent1.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
    expect(child1.value).toBe(77);

    // Change the value
    child1.value = 88;

    const memento = parent1.makeReloadMemento();
    expect(_.size(memento.children)).toBe(1);

    // Reload the entity
    const child2 = new ReloadingEntity(77);
    const parent2 = new ReloadingCompositeEntity(child2);
    parent2.setup(
      makeFrameInfo(),
      makeEntityConfig(),
      makeTransition(),
      memento
    );

    expect(child2.value).toBe(88);
  });

  test("works with ParallelEntity", () => {
    const child1V1 = new ReloadingEntity(1);
    const child2V1 = new ReloadingEntity(2);
    const parentV1 = new entity.ParallelEntity([child1V1, child2V1]);

    parentV1.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());
    expect(child1V1.value).toBe(1);
    expect(child2V1.value).toBe(2);

    // Change the values
    child1V1.value = 88;
    child2V1.value = 99;

    const memento = parentV1.makeReloadMemento();
    expect(_.size(memento.children)).toBe(2);

    // Reload the entity
    const child1V2 = new ReloadingEntity(1);
    const child2V2 = new ReloadingEntity(2);
    const parent2 = new entity.ParallelEntity([child1V2, child2V2]);
    parent2.setup(
      makeFrameInfo(),
      makeEntityConfig(),
      makeTransition(),
      memento
    );

    expect(child1V2.value).toBe(88);
    expect(child2V2.value).toBe(99);
  });

  test("works with EntitySequence", () => {
    const child1V1 = new ReloadingEntity(1);
    const child2V1 = new ReloadingEntity(2);
    const parentV1 = new entity.EntitySequence([child1V1, child2V1]);

    parentV1.setup(makeFrameInfo(), makeEntityConfig(), makeTransition());

    // Change the values
    child1V1.value = 99;

    let memento = parentV1.makeReloadMemento();
    // Only the activated child will be in the memento
    expect(_.size(memento.children)).toBe(1);

    // Reload the entity
    const child1V2 = new ReloadingEntity(1);
    const child2V2 = new ReloadingEntity(2);
    const parentV2 = new entity.EntitySequence([child1V2, child2V2]);
    parentV2.setup(
      makeFrameInfo(),
      makeEntityConfig(),
      makeTransition(),
      memento
    );

    expect(child1V2.value).toBe(99);

    // Skip to the next entity and change its value
    parentV2.skip();
    parentV2.update(makeFrameInfo());
    child2V2.value = 77;

    // Reload
    memento = parentV2.makeReloadMemento();
    const child1V3 = new ReloadingEntity(1);
    const child2V3 = new ReloadingEntity(2);
    const parentV3 = new entity.EntitySequence([child1V3, child2V3]);
    parentV3.setup(
      makeFrameInfo(),
      makeEntityConfig(),
      makeTransition(),
      memento
    );

    // The 2nd child should be setup and have the correct value
    expect(child2V3.isSetup).toBe(true);
    expect(child2V3.value).toBe(77);
  });
});
