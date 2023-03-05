import * as PIXI from "pixi.js";
import * as _ from "underscore";

import * as entity from "../src/entity";

function makeEntityConfig(): entity.EntityConfig {
  return {};
}

function makeFrameInfo(): entity.FrameInfo {
  return {
    timeSinceLastFrame: 1 / 60,
  };
}

function makeTransition(): entity.Transition {
  return entity.makeTransition();
}

// For help mocking, the methods here are public and replaced with mocks
class MockEntity extends entity.EntityBase {
  constructor() {
    super();
    this._onActivate = jest.fn();
    this._onUpdate = jest.fn();
    this._onDeactivate = jest.fn();
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
  public _onActivate() {}
  public _onUpdate() {}
  public _onDeactivate() {}
  public _onSignal() {}
}

describe("Entity", () => {
  let e: MockEntity;

  beforeEach(() => {
    e = new MockEntity();
  });

  test("allows normal execution", () => {
    for (let i = 0; i < 5; i++) {
      e.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());
      e.update(makeFrameInfo());
      e.onSignal(makeFrameInfo(), "signal");
      e.deactivate(makeFrameInfo());
    }

    expect(e._onActivate).toBeCalledTimes(5);
    expect(e._onUpdate).toBeCalledTimes(5);
    expect(e._onDeactivate).toBeCalledTimes(5);
    expect(e._onSignal).toBeCalledTimes(5);
  });

  test("throws on multiple activate", () => {
    expect(() => {
      e.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());
      e.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());
    }).toThrow();
  });

  test("throws on update before activate", () => {
    expect(() => {
      e.update(makeFrameInfo());
    }).toThrow();
  });

  test("throws on deactivate before activate", () => {
    expect(() => {
      e.deactivate(makeFrameInfo());
    }).toThrow();
  });

  test("throws on onSignal before activate", () => {
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

      _onActivate() {
        this._subscribe(sender, "a", this.receiveA);
        this._subscribeOnce(sender, "b", this.receiveB);
      }

      receiveA() {}
      receiveB() {}
    })();

    // Setup the receiver and send one event
    receiver.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());
    sender.emit("a", 1, 2, 3);
    sender.emit("a", 1, 2, 3);
    sender.emit("b", 1, 2, 3);
    sender.emit("b", 1, 2, 3);

    expect(receiver.receiveA).toBeCalledWith(1, 2, 3);
    expect(receiver.receiveB).toBeCalledWith(1, 2, 3);

    // Teardown the receiver and send more events that should not be recieved
    receiver.deactivate(makeFrameInfo());
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
      _onActivate() {
        for (let i = 0; i < 3; i++) this._activateChildEntity(children[i]);
      }
    })();
  });

  test("runs children", () => {
    for (let i = 0; i < 5; i++) {
      parent.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());
      parent.update(makeFrameInfo());
      parent.onSignal(makeFrameInfo(), "signal");
      parent.deactivate(makeFrameInfo());
    }

    for (const child of children) {
      expect(child._onActivate).toBeCalledTimes(5);
      expect(child._onUpdate).toBeCalledTimes(5);
      expect(child._onSignal).toBeCalledTimes(5);
      expect(child._onDeactivate).toBeCalledTimes(5);
    }
  });

  test("deactivates children", () => {
    // Have middle child request transition on 2nd call
    let requestTransition = false;
    children[1]._onUpdate = jest.fn(() => {
      if (requestTransition) children[1].transition = entity.makeTransition();
    });

    // Run once
    parent.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());
    parent.update(makeFrameInfo());

    // Run again, this time have middle child request transition
    requestTransition = true;
    parent.update(makeFrameInfo());
    parent.update(makeFrameInfo());

    expect(children[1]._onActivate).toBeCalledTimes(1);
    expect(children[1]._onDeactivate).toBeCalledTimes(1);
    expect(children[1]._onUpdate).toBeCalledTimes(2);

    expect(children[2]._onActivate).toBeCalledTimes(1);
    expect(children[2]._onDeactivate).toBeCalledTimes(0);
    expect(children[2]._onUpdate).toBeCalledTimes(3);
  });

  test("send activation events", () => {
    const deactivatedCallback = jest.fn();
    parent.on("deactivatedChildEntity", deactivatedCallback);

    // Run once
    parent.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());
    children[1].transition = entity.makeTransition();
    parent.update(makeFrameInfo());

    expect(deactivatedCallback).toBeCalledTimes(1);

    // Teardown and activate again
    parent.deactivate(makeFrameInfo());

    expect(deactivatedCallback).toBeCalledTimes(3);

    const activatedCallback = jest.fn();
    parent.on("activatedChildEntity", activatedCallback);

    parent.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());

    expect(activatedCallback).toBeCalledTimes(3);
  });
});

describe("ParallelEntity", () => {
  test("runs children", () => {
    const children = [new MockEntity(), new MockEntity(), new MockEntity()];
    const parent = new entity.ParallelEntity(children);

    for (let i = 0; i < 5; i++) {
      parent.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());
      parent.update(makeFrameInfo());
      parent.onSignal(makeFrameInfo(), "signal");
      parent.deactivate(makeFrameInfo());
    }

    for (const child of children) {
      expect(child._onActivate).toBeCalledTimes(5);
      expect(child._onUpdate).toBeCalledTimes(5);
      expect(child._onSignal).toBeCalledTimes(5);
      expect(child._onDeactivate).toBeCalledTimes(5);
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
    parent.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());
    parent.update(makeFrameInfo());

    expect(middleChildContext.entity._onActivate).not.toBeCalled();
    expect((parent.children[0] as MockEntity)._onActivate).toBeCalled();
  });

  test("can activate and deactivate children", () => {
    const children = [new MockEntity(), new MockEntity(), new MockEntity()];
    const parent = new entity.ParallelEntity(children);

    // Run once
    parent.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());
    parent.update(makeFrameInfo());

    // Deactivate middle child and run
    parent.deactivateChildEntity(1);
    parent.update(makeFrameInfo());

    // Reactivate middle child, deactivate third child, and run
    parent.activateChildEntity(1);
    parent.deactivateChildEntity(2);
    parent.update(makeFrameInfo());

    expect(children[0]._onUpdate).toBeCalledTimes(3);
    expect(children[1]._onUpdate).toBeCalledTimes(2);
    expect(children[2]._onUpdate).toBeCalledTimes(2);
  });
});

describe("EntitySequence", () => {
  test("runs only one child at a time", () => {
    const children = [new MockEntity(), new MockEntity(), new MockEntity()];
    const parent = new entity.EntitySequence(children);

    for (let i = 0; i < 5; i++) {
      parent.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());
      parent.update(makeFrameInfo());
      parent.onSignal(makeFrameInfo(), "signal");
      parent.deactivate(makeFrameInfo());
    }

    // First child should be called
    expect(children[0]._onActivate).toBeCalledTimes(5);
    expect(children[0]._onUpdate).toBeCalledTimes(5);
    expect(children[0]._onSignal).toBeCalledTimes(5);
    expect(children[0]._onDeactivate).toBeCalledTimes(5);

    // The others not
    for (const child of _.rest(children)) {
      expect(child._onActivate).toBeCalledTimes(0);
      expect(child._onUpdate).toBeCalledTimes(0);
      expect(child._onSignal).toBeCalledTimes(0);
      expect(child._onDeactivate).toBeCalledTimes(0);
    }
  });

  test("runs only one child after another", () => {
    const children = [new MockEntity(), new MockEntity(), new MockEntity()];
    const parent = new entity.EntitySequence(children);

    parent.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());

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
      expect(child._onActivate).toBeCalledTimes(1);
      expect(child._onUpdate).toBeCalledTimes(3);
      expect(child._onDeactivate).toBeCalledTimes(1);
    }

    // Final transition should be that of the 3rd child
    expect(parent.transition.name).toBe("third");
  });

  test("loops", () => {
    const children = [new MockEntity(), new MockEntity()];
    const parent = new entity.EntitySequence(children, { loop: true });

    parent.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());

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

    // The first child should be activate twice
    expect(children[0]._onActivate).toBeCalledTimes(2);
    expect(children[0]._onUpdate).toBeCalledTimes(3);
    expect(children[0]._onDeactivate).toBeCalledTimes(1);

    // The second child should be activate once
    expect(children[1]._onActivate).toBeCalledTimes(1);
    expect(children[1]._onUpdate).toBeCalledTimes(2);
    expect(children[1]._onDeactivate).toBeCalledTimes(1);

    // There should be no requested transition
    expect(parent.transition).toBeFalsy();
  });

  test("skips", () => {
    const children = [new MockEntity(), new MockEntity()];
    const parent = new entity.EntitySequence(children);

    parent.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());

    // Run 1st child, then skip
    parent.update(makeFrameInfo());
    parent.skip();
    parent.update(makeFrameInfo());
    parent.skip();

    // The first child should be activate and torn down
    expect(children[0]._onActivate).toBeCalledTimes(1);
    expect(children[0]._onUpdate).toBeCalledTimes(1);
    expect(children[0]._onDeactivate).toBeCalledTimes(1);

    // The second child should be activate and torn down
    expect(children[1]._onActivate).toBeCalledTimes(1);
    expect(children[1]._onUpdate).toBeCalledTimes(1);
    expect(children[0]._onDeactivate).toBeCalledTimes(1);

    // There should be a skipped transition
    expect(parent.transition.name).toBe("skip");
  });
});

describe("StateMachine", () => {
  test("runs start state", () => {
    const states = { start: new MockEntity() };
    const stateMachine = new entity.StateMachine(states);

    for (let i = 0; i < 5; i++) {
      stateMachine.activate(
        makeFrameInfo(),
        makeEntityConfig(),
        makeTransition()
      );
      stateMachine.update(makeFrameInfo());
      stateMachine.onSignal(makeFrameInfo(), "signal");
      stateMachine.deactivate(makeFrameInfo());
    }

    // First child should be called 5 times
    expect(states.start._onActivate).toBeCalledTimes(5);
    expect(states.start._onUpdate).toBeCalledTimes(5);
    expect(states.start._onSignal).toBeCalledTimes(5);
    expect(states.start._onDeactivate).toBeCalledTimes(5);
  });

  test("goes from start to end", () => {
    const states = { start: new MockEntity() };
    const stateMachine = new entity.StateMachine(states);

    // Run once, then request transition
    stateMachine.activate(
      makeFrameInfo(),
      makeEntityConfig(),
      makeTransition()
    );
    stateMachine.update(makeFrameInfo());
    states.start.transition = entity.makeTransition("end");
    stateMachine.update(makeFrameInfo());

    expect(states.start._onActivate).toBeCalledTimes(1);
    expect(states.start._onUpdate).toBeCalledTimes(1);
    expect(states.start._onDeactivate).toBeCalledTimes(1);

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
    stateMachine.activate(
      makeFrameInfo(),
      makeEntityConfig(),
      makeTransition()
    );
    stateMachine.update(makeFrameInfo());
    states.a.transition = entity.makeTransition("b");
    stateMachine.update(makeFrameInfo());

    expect(states.a._onActivate).toBeCalledTimes(1);
    expect(states.a._onUpdate).toBeCalledTimes(1);
    expect(states.a._onDeactivate).toBeCalledTimes(1);

    expect(states.b._onActivate).toBeCalledTimes(1);
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
    stateMachine.activate(
      makeFrameInfo(),
      makeEntityConfig(),
      makeTransition()
    );
    stateMachine.update(makeFrameInfo());
    states.a.transition = entity.makeTransition();
    stateMachine.update(makeFrameInfo());

    // Transition back again
    states.b.transition = entity.makeTransition();
    stateMachine.update(makeFrameInfo());

    expect(states.a._onActivate).toBeCalledTimes(2);
    expect(states.a._onDeactivate).toBeCalledTimes(1);

    expect(states.b._onActivate).toBeCalledTimes(1);
    expect(states.b._onDeactivate).toBeCalledTimes(1);
  });

  test("manual transitions", () => {
    const states = { a: new MockEntity(), b: new MockEntity() };
    const stateMachine = new entity.StateMachine(states, {
      startingState: entity.makeTransition("a"),
    });

    // Run once, then request transition
    stateMachine.activate(
      makeFrameInfo(),
      makeEntityConfig(),
      makeTransition()
    );
    stateMachine.update(makeFrameInfo());

    stateMachine.changeState("b");

    stateMachine.update(makeFrameInfo());

    expect(states.a._onActivate).toBeCalledTimes(1);
    expect(states.a._onUpdate).toBeCalledTimes(1);
    expect(states.a._onDeactivate).toBeCalledTimes(1);

    expect(states.b._onActivate).toBeCalledTimes(1);
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
    stateMachine.activate(
      makeFrameInfo(),
      makeEntityConfig(),
      makeTransition()
    );
    stateMachine.update(makeFrameInfo());

    const transition = entity.makeTransition("done", { x: "y" });
    states.a.transition = transition;

    stateMachine.update(makeFrameInfo());

    expect(states.a._onActivate).toBeCalledTimes(1);
    expect(states.a._onUpdate).toBeCalledTimes(1);
    expect(states.a._onDeactivate).toBeCalledTimes(1);

    expect(states.b._onActivate).toBeCalledTimes(1);

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

  _onActivate() {
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

  _onActivate() {
    this._activateChildEntity(this._child, { id: "a" });
  }
}

describe("Hot reloading", () => {
  test("Base entity doesn't provide memento", () => {
    const e = new entity.NullEntity();
    e.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());
    expect(e.makeReloadMemento().data).toBeUndefined();
  });

  test("Custom entity provides memento", () => {
    // Provide a default value
    const e1 = new ReloadingEntity(77);
    e1.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());
    expect(e1.makeReloadMemento().data.value).toBe(77);

    // Update the value, it should get in the new memento
    e1.value = 88;
    expect(e1.makeReloadMemento().data.value).toBe(88);

    // Create a new entity from the previous entities memento. It should have the newer value
    const e2 = new ReloadingEntity(77);
    e2.activate(
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
    e1.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());

    const e2 = new ReloadingEntity2(88);
    e2.activate(
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

    parent1.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());
    expect(child1.value).toBe(77);

    // Change the value
    child1.value = 88;

    const memento = parent1.makeReloadMemento();
    expect(_.size(memento.children)).toBe(1);

    // Reload the entity
    const child2 = new ReloadingEntity(77);
    const parent2 = new ReloadingCompositeEntity(child2);
    parent2.activate(
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

    parentV1.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());
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
    parent2.activate(
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

    parentV1.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());

    // Change the values
    child1V1.value = 99;

    let memento = parentV1.makeReloadMemento();
    // Only the activated child will be in the memento
    expect(_.size(memento.children)).toBe(1);

    // Reload the entity
    const child1V2 = new ReloadingEntity(1);
    const child2V2 = new ReloadingEntity(2);
    const parentV2 = new entity.EntitySequence([child1V2, child2V2]);
    parentV2.activate(
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
    parentV3.activate(
      makeFrameInfo(),
      makeEntityConfig(),
      makeTransition(),
      memento
    );

    // The 2nd child should be activate and have the correct value
    expect(child2V3.isSetup).toBe(true);
    expect(child2V3.value).toBe(77);
  });

  test("works with StateMachine", () => {
    const child1V1 = new ReloadingEntity(1);
    const child2V1 = new ReloadingEntity(2);
    const parentV1 = new entity.StateMachine({
      start: child1V1,
      middle: child2V1,
    });

    parentV1.activate(makeFrameInfo(), makeEntityConfig(), makeTransition());

    // Skip to another state
    parentV1.changeState("middle");

    parentV1.update(makeFrameInfo());

    // Change the values
    child1V1.value = 11;
    child2V1.value = 22;

    debugger;

    // Reload
    const child1V2 = new ReloadingEntity(1);
    const child2V2 = new ReloadingEntity(2);
    const parentV2 = new entity.StateMachine({
      start: child1V2,
      middle: child2V2,
    });
    parentV2.activate(
      makeFrameInfo(),
      makeEntityConfig(),
      makeTransition(),
      parentV1.makeReloadMemento()
    );

    // Only 2nd child should be activate and have the new value
    expect(child1V1.isSetup).toBe(false);

    expect(child2V2.isSetup).toBe(true);
    expect(child2V2.value).toBe(22);
  });
});
