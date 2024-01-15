import * as _ from "underscore";
import { jest, describe, expect, test, beforeEach } from "@jest/globals";

import * as chip from "../src/chip";

function makeChipContext(): chip.ChipContext {
  return { rootValue: 1 };
}

function makeFrameInfo(): chip.TickInfo {
  return {
    timeSinceLastTick: 1 / 60,
  };
}

function makeSignal(): chip.Signal {
  return chip.makeSignal();
}

// For help mocking, the methods here are public and replaced with mocks
class MockChip extends chip.ChipBase {
  constructor() {
    super();
    this._onActivate = jest.fn();
    this._onTick = jest.fn();
    this._onTerminate = jest.fn();
    this._onPause = jest.fn();
    this._onResume = jest.fn();
  }

  // Make the methods public so that they can be tested with the mock
  public _onActivate() {
    /* no op */
  }
  public _onTick() {
    /* no op */
  }
  public _onTerminate() {
    /* no op */
  }
  public _onPause() {
    /* no op */
  }
  public _onResume() {
    /* no op */
  }
}

class MockComposite extends chip.Composite {
  private _defaultChildChipContext: chip.ChipContext;

  get defaultChildChipContext(): chip.ChipContext {
    return this._defaultChildChipContext;
  }

  set defaultChildChipContext(value: chip.ChipContext) {
    this._defaultChildChipContext = value;
  }
}

describe("Chip", () => {
  let e: MockChip;

  beforeEach(() => {
    e = new MockChip();
  });

  test("allows normal execution", () => {
    for (let i = 0; i < 5; i++) {
      e.activate(makeFrameInfo(), makeChipContext(), makeSignal());
      e.tick(makeFrameInfo());
      e.pause(makeFrameInfo());
      e.resume(makeFrameInfo());
      e.terminate();
    }

    expect(e._onActivate).toBeCalledTimes(5);
    expect(e._onTick).toBeCalledTimes(5);
    expect(e._onTerminate).toBeCalledTimes(5);
    expect(e._onPause).toBeCalledTimes(5);
    expect(e._onResume).toBeCalledTimes(5);
  });

  test("throws on multiple activate", () => {
    expect(() => {
      e.activate(makeFrameInfo(), makeChipContext(), makeSignal());
      e.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    }).toThrow();
  });

  test("throws on tick before activate", () => {
    expect(() => {
      e.tick(makeFrameInfo());
    }).toThrow();
  });

  test("throws on terminate before activate", () => {
    expect(() => {
      e.terminate();
    }).toThrow();
  });

  test("throws on pause before activate", () => {
    expect(() => {
      e.pause(makeFrameInfo());
    }).toThrow();
  });

  test("throws on resume before activate", () => {
    expect(() => {
      e.resume(makeFrameInfo());
    }).toThrow();
  });

  test("throws on multiple pause", () => {
    expect(() => {
      e.activate(makeFrameInfo(), makeChipContext(), makeSignal());

      e.pause(makeFrameInfo());
      e.pause(makeFrameInfo());
    }).toThrow();
  });

  test("throws on multiple resume", () => {
    expect(() => {
      e.activate(makeFrameInfo(), makeChipContext(), makeSignal());
      e.pause(makeFrameInfo());

      e.resume(makeFrameInfo());
      e.resume(makeFrameInfo());
    }).toThrow();
  });

  test("creates default output signal", () => {
    e.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    expect(e.outputSignal).not.toBeDefined();

    e.terminate();
    expect(e.outputSignal).toBeDefined();
  });
});

describe("Events", () => {
  test("receives Node-style events", () => {
    const sender = new MockChip();
    const receiver = new (class extends chip.ChipBase {
      constructor() {
        super();

        this.receiveA = jest.fn();
        this.receiveB = jest.fn();
      }

      _onActivate() {
        this._subscribe(sender, "a", this.receiveA);
        this._subscribeOnce(sender, "b", this.receiveB);
      }

      receiveA() {
        /* no op */
      }
      receiveB() {
        /* no op */
      }
    })();

    // Setup the receiver and send one event
    receiver.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    sender.emit("a", 1, 2, 3);
    sender.emit("a", 1, 2, 3);
    sender.emit("b", 1, 2, 3);
    sender.emit("b", 1, 2, 3);

    expect(receiver.receiveA).toBeCalledWith(1, 2, 3);
    expect(receiver.receiveB).toBeCalledWith(1, 2, 3);

    // Teardown the receiver and send more events that should not be received
    receiver.terminate();
    sender.emit("a");
    sender.emit("b");

    expect(receiver.receiveA).toBeCalledTimes(2);
    expect(receiver.receiveB).toBeCalledTimes(1);
  });

  test("receives DOM-style events", () => {
    class CustomEvent extends Event {
      constructor(name: string, public readonly value: number) {
        super(name);
      }
    }

    const sender = new EventTarget();

    const receiver = new (class extends chip.ChipBase {
      _onActivate() {
        this._subscribe(sender, "a", this.receiveA);
        this._subscribeOnce(sender, "b", this.receiveB);
      }

      receiveA() {
        /* no op */
      }
      receiveB() {
        /* no op */
      }
    })();

    const spyA = jest.spyOn(receiver, "receiveA");
    const spyB = jest.spyOn(receiver, "receiveB");

    // Setup the receiver and send one event
    receiver.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    sender.dispatchEvent(new CustomEvent("a", 1));
    sender.dispatchEvent(new CustomEvent("a", 1));
    sender.dispatchEvent(new CustomEvent("b", 2));
    sender.dispatchEvent(new CustomEvent("b", 2));

    // @ts-ignore
    expect(spyA.mock.calls?.[0][0].value).toBe(1);
    // @ts-ignore
    expect(spyB.mock.calls?.[0][0].value).toBe(2);

    // Teardown the receiver and send more events that should not be received
    receiver.terminate();
    sender.dispatchEvent(new CustomEvent("a", 1));
    sender.dispatchEvent(new CustomEvent("b", 2));

    expect(spyA).toBeCalledTimes(2);
    expect(spyB).toBeCalledTimes(1);
  });

  test("receives custom-style events", () => {
    const subscriptionHandlerA: chip.SubscriptionHandler = {
      subscribe: jest.fn(),
      subscribeOnce: jest.fn(),
      unsubscribe: jest.fn(),
    };
    const subscriptionHandlerB: chip.SubscriptionHandler = {
      subscribe: jest.fn(),
      subscribeOnce: jest.fn(),
      unsubscribe: jest.fn(),
    };

    const sender = {};

    const receiver = new (class extends chip.ChipBase {
      _onActivate() {
        this._subscribe(sender, "a", this.receiveA, subscriptionHandlerA);
        this._subscribeOnce(sender, "b", this.receiveB, subscriptionHandlerB);
      }

      receiveA() {
        /* no op */
      }
      receiveB() {
        /* no op */
      }
    })();

    // Setup the receiver
    receiver.activate(makeFrameInfo(), makeChipContext(), makeSignal());

    // Check that the subscription handler was called
    // @ts-ignore
    expect(subscriptionHandlerA.subscribe.mock.calls[0][0]).toBe(sender);
    // @ts-ignore
    expect(subscriptionHandlerA.subscribe.mock.calls[0][1]).toBe("a");

    // @ts-ignore
    expect(subscriptionHandlerB.subscribeOnce.mock.calls[0][0]).toBe(sender);
    // @ts-ignore
    expect(subscriptionHandlerB.subscribeOnce.mock.calls[0][1]).toBe("b");

    // Teardown the receiver and check that unsubscribe() was called
    receiver.terminate();

    // @ts-ignore
    expect(subscriptionHandlerA.unsubscribe.mock.calls[0][0]).toBe(sender);
    // @ts-ignore
    expect(subscriptionHandlerA.unsubscribe.mock.calls[0][1]).toBe("a");

    // @ts-ignore
    expect(subscriptionHandlerB.unsubscribe.mock.calls[0][0]).toBe(sender);
    // @ts-ignore
    expect(subscriptionHandlerB.unsubscribe.mock.calls[0][1]).toBe("b");
  });
});

describe("Composite", () => {
  let parent: MockComposite;
  let children: MockChip[];

  beforeEach(() => {
    children = [new MockChip(), new MockChip(), new MockChip()];

    // Anonymous subclass
    parent = new (class extends MockComposite {
      _onActivate() {
        for (const child of children) this._activateChildChip(child);
      }
    })();
  });

  test("runs children", () => {
    for (let i = 0; i < 5; i++) {
      parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());
      parent.tick(makeFrameInfo());
      parent.pause(makeFrameInfo());
      parent.resume(makeFrameInfo());
      parent.terminate();
    }

    for (const child of children) {
      expect(child._onActivate).toBeCalledTimes(5);
      expect(child._onTick).toBeCalledTimes(5);
      expect(child._onPause).toBeCalledTimes(5);
      expect(child._onResume).toBeCalledTimes(5);
      expect(child._onTerminate).toBeCalledTimes(5);
    }
  });

  test("removes children", () => {
    // Run once
    parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    parent.tick(makeFrameInfo());

    // Deactivate middle child
    children[1].terminate();

    // Run two more times
    parent.tick(makeFrameInfo());
    parent.tick(makeFrameInfo());

    // Just two children should be active
    expect(Object.keys(parent.children).length).toBe(2);

    expect(children[1]._onActivate).toBeCalledTimes(1);
    expect(children[1]._onTerminate).toBeCalledTimes(1);
    expect(children[1]._onTick).toBeCalledTimes(1);

    expect(children[2]._onActivate).toBeCalledTimes(1);
    expect(children[2]._onTerminate).toBeCalledTimes(0);
    expect(children[2]._onTick).toBeCalledTimes(3);
  });

  test("sends activation events", () => {
    const terminatedCallback = jest.fn();
    parent.on("terminatedChildChip", terminatedCallback);

    // Run once
    parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());

    // Terminate child
    children[1].terminate();

    // Run again
    parent.tick(makeFrameInfo());

    expect(terminatedCallback).toBeCalledTimes(1);

    // Teardown and activate again
    parent.terminate();

    expect(terminatedCallback).toBeCalledTimes(3);

    const activatedCallback = jest.fn();
    parent.on("activatedChildChip", activatedCallback);

    parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());

    expect(activatedCallback).toBeCalledTimes(3);
  });

  test("merges default context", () => {
    parent.defaultChildChipContext = { defaultValue: 2 };

    parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());

    expect(children[0].chipContext.rootValue).toBe(1);
    expect(children[0].chipContext.defaultValue).toBe(2);
  });

  test("creates and deletes attributes", () => {
    // Activate parent
    parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());

    const childChip = new MockChip();

    // @ts-ignore
    parent._activateChildChip(childChip, { attribute: "attr" });
    // @ts-ignore
    expect(parent.attr).toBe(childChip);

    childChip.terminate();

    // @ts-ignore
    expect(parent.attr).toBeUndefined();
  });

  test("adds children to the context", () => {
    // Activate parent
    parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());

    const childChipA = new MockChip();
    // @ts-ignore
    parent._activateChildChip(childChipA, {
      // @ts-ignore
      attribute: "attr",
      includeInChildContext: true,
    });

    const childChipB = new MockChip();
    // @ts-ignore
    parent._activateChildChip(childChipB);
    // @ts-ignore
    expect(childChipB.chipContext.attr).toBe(childChipA);
  });

  test("defers termination during tick", () => {
    // @ts-ignore
    children = [new chip.Lambda(() => parent.terminate())];
    parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());
  });

  test("creates default output signal", () => {
    parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    expect(parent.outputSignal).not.toBeDefined();

    parent.terminate();
    expect(parent.outputSignal).toBeDefined();
  });
});

describe("Parallel", () => {
  test("runs children", () => {
    const children = [new MockChip(), new MockChip(), new MockChip()];
    const parent = new chip.Parallel(children);

    for (let i = 0; i < 5; i++) {
      parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());
      parent.tick(makeFrameInfo());
      parent.pause(makeFrameInfo());
      parent.resume(makeFrameInfo());
      parent.terminate();
    }

    for (const child of children) {
      expect(child._onActivate).toBeCalledTimes(5);
      expect(child._onTick).toBeCalledTimes(5);
      expect(child._onPause).toBeCalledTimes(5);
      expect(child._onResume).toBeCalledTimes(5);
      expect(child._onTerminate).toBeCalledTimes(5);
    }
  });

  test("can activate and terminate children", () => {
    const children = [new MockChip(), new MockChip(), new MockChip()];
    const parent = new chip.Parallel(children);

    // Run once
    parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    parent.tick(makeFrameInfo());

    expect(children[0]._onTick).toBeCalledTimes(1);
    expect(children[1]._onTick).toBeCalledTimes(1);
    expect(children[2]._onTick).toBeCalledTimes(1);

    // Terminate middle child and run
    parent.removeChildChip(1);
    parent.tick(makeFrameInfo());

    expect(children[0]._onTick).toBeCalledTimes(2);
    expect(children[1]._onTick).toBeCalledTimes(1);
    expect(children[2]._onTick).toBeCalledTimes(2);

    // Reactivate middle child, terminate third child, and run
    parent.addChildChip(children[1]);
    parent.removeChildChip(children[2]);
    parent.tick(makeFrameInfo());

    expect(children[0]._onTick).toBeCalledTimes(3);
    expect(children[1]._onTick).toBeCalledTimes(2);
    expect(children[2]._onTick).toBeCalledTimes(2);
  });

  test("terminates when children complete", () => {
    const children = [new MockChip(), new MockChip()];
    const parent = new chip.Parallel(children);

    // Run once
    parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    parent.tick(makeFrameInfo());

    // Terminate one child
    children[0].terminate();
    parent.tick(makeFrameInfo());
    expect(parent.state === "active");

    // Terminate second child
    children[1].terminate();
    parent.tick(makeFrameInfo());

    expect(parent.state === "inactive");
  });

  test("can remove children", () => {
    const children = [new MockChip(), new MockChip(), new MockChip()];
    const parent = new chip.Parallel(children);

    // Run once
    parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    parent.tick(makeFrameInfo());

    // Remove middle child
    parent.removeChildChip(children[1]);
    parent.tick(makeFrameInfo());

    expect(children[1].state).toBe("inactive");
    // @ts-ignore
    expect(parent._chipActivationInfos.length).toBe(2);
    // @ts-ignore
    expect(parent._infoToChip.size).toBe(2);

    // Run again
    parent.tick(makeFrameInfo());

    expect(children[0]._onTick).toBeCalledTimes(3);
    expect(children[1]._onTick).toBeCalledTimes(1);
    expect(children[2]._onTick).toBeCalledTimes(3);
  });
});

describe("Sequence", () => {
  test("runs only one child at a time", () => {
    const children = [new MockChip(), new MockChip(), new MockChip()];
    const parent = new chip.Sequence(children);

    for (let i = 0; i < 5; i++) {
      parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());
      parent.tick(makeFrameInfo());
      parent.pause(makeFrameInfo());
      parent.resume(makeFrameInfo());
      parent.terminate();
    }

    // First child should be called
    expect(children[0]._onActivate).toBeCalledTimes(5);
    expect(children[0]._onTick).toBeCalledTimes(5);
    expect(children[0]._onPause).toBeCalledTimes(5);
    expect(children[0]._onResume).toBeCalledTimes(5);
    expect(children[0]._onTerminate).toBeCalledTimes(5);

    // The others not
    for (const child of _.rest(children)) {
      expect(child._onActivate).toBeCalledTimes(0);
      expect(child._onTick).toBeCalledTimes(0);
      expect(child._onPause).toBeCalledTimes(0);
      expect(child._onResume).toBeCalledTimes(0);
      expect(child._onTerminate).toBeCalledTimes(0);
    }
  });

  test("runs one child after another", () => {
    const children = [new MockChip(), new MockChip(), new MockChip()];
    const parent = new chip.Sequence(children);

    parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());

    // Run 1st child twice, then terminate it
    parent.tick(makeFrameInfo());
    parent.tick(makeFrameInfo());
    children[0].terminate();
    parent.tick(makeFrameInfo());

    // Run 2nd child twice, then terminate it
    parent.tick(makeFrameInfo());
    parent.tick(makeFrameInfo());
    children[1].terminate();
    parent.tick(makeFrameInfo());

    // Run 3rd child twice, then terminate
    parent.tick(makeFrameInfo());
    parent.tick(makeFrameInfo());
    children[2].terminate(chip.makeSignal("third"));
    parent.tick(makeFrameInfo());

    // Each child should be updated 2 times
    for (const child of _.rest(children)) {
      expect(child._onActivate).toBeCalledTimes(1);
      expect(child._onTick).toBeCalledTimes(2);
      expect(child._onTerminate).toBeCalledTimes(1);
    }

    // Final signal should be that of the 3rd child
    expect(parent.outputSignal.name).toBe("third");
  });

  test("loops", () => {
    const children = [new MockChip(), new MockChip()];
    const parent = new chip.Sequence(children, { loop: true });

    parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());

    // Run 1st child, then terminate
    parent.tick(makeFrameInfo());
    children[0].terminate();
    parent.tick(makeFrameInfo());

    // Run 2nd child, then terminate
    parent.tick(makeFrameInfo());
    children[1].terminate();
    parent.tick(makeFrameInfo());

    // Run 1st child again
    parent.tick(makeFrameInfo());

    // The first child should be activated twice
    expect(children[0]._onActivate).toBeCalledTimes(2);
    expect(children[0]._onTick).toBeCalledTimes(2);
    expect(children[0]._onTerminate).toBeCalledTimes(1);

    // The second child should be activated once
    expect(children[1]._onActivate).toBeCalledTimes(1);
    expect(children[1]._onTick).toBeCalledTimes(1);
    expect(children[1]._onTerminate).toBeCalledTimes(1);

    // There should be no output signal
    expect(parent.outputSignal).toBeFalsy();
  });

  test("skips", () => {
    const children = [new MockChip(), new MockChip()];
    const parent = new chip.Sequence(children);

    parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());

    // Run 1st child, then skip
    parent.tick(makeFrameInfo());
    parent.skip();
    parent.tick(makeFrameInfo());
    parent.skip();

    // The first child should be activate and torn down
    expect(children[0]._onActivate).toBeCalledTimes(1);
    expect(children[0]._onTick).toBeCalledTimes(1);
    expect(children[0]._onTerminate).toBeCalledTimes(1);

    // The second child should be activate and torn down
    expect(children[1]._onActivate).toBeCalledTimes(1);
    expect(children[1]._onTick).toBeCalledTimes(1);
    expect(children[0]._onTerminate).toBeCalledTimes(1);

    // There should be a skipped signal
    expect(parent.outputSignal.name).toBe("skip");
  });

  test("runs single child in loop", () => {
    let counter = 0;
    class TerminatingCounter extends chip.ChipBase {
      protected _onActivate(): void {
        counter++;
        this.terminate();
      }
    }

    const children = [new TerminatingCounter()];
    const parent = new chip.Sequence(children, { loop: true });

    parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    expect(counter).toBe(1);
    parent.tick(makeFrameInfo());
    expect(counter).toBe(2);
    parent.tick(makeFrameInfo());
    expect(counter).toBe(3);
  });

  test("can be used as a queue", () => {
    const children = [new MockChip()];
    const parent = new chip.Sequence(children, {
      terminateOnCompletion: false,
    });

    parent.activate(makeFrameInfo(), makeChipContext(), makeSignal());

    // Run 1st child, then terminate it
    parent.tick(makeFrameInfo());
    children[0].terminate();

    parent.tick(makeFrameInfo());

    // Add another child
    children.push(new MockChip());
    parent.addChildChip(children.at(-1)!);
    parent.tick(makeFrameInfo());

    // Both children should be ticked once
    expect(children[0]._onActivate).toBeCalledTimes(1);
    expect(children[0]._onTick).toBeCalledTimes(1);
    expect(children[0]._onTerminate).toBeCalledTimes(1);
    expect(children[1]._onActivate).toBeCalledTimes(1);
    expect(children[1]._onTick).toBeCalledTimes(1);
    expect(children[1]._onTerminate).toBeCalledTimes(0);
  });
});

describe("StateMachine", () => {
  test("runs start state", () => {
    const states = { start: new MockChip() };
    const stateMachine = new chip.StateMachine(states);

    for (let i = 0; i < 5; i++) {
      stateMachine.activate(makeFrameInfo(), makeChipContext(), makeSignal());
      stateMachine.tick(makeFrameInfo());
      stateMachine.pause(makeFrameInfo());
      stateMachine.resume(makeFrameInfo());
      stateMachine.terminate();
    }

    // First child should be called 5 times
    expect(states.start._onActivate).toBeCalledTimes(5);
    expect(states.start._onTick).toBeCalledTimes(5);
    expect(states.start._onPause).toBeCalledTimes(5);
    expect(states.start._onResume).toBeCalledTimes(5);
    expect(states.start._onTerminate).toBeCalledTimes(5);
  });

  test("goes from start to end", () => {
    const states = { start: new MockChip() };
    const stateMachine = new chip.StateMachine(states);

    // Run once, then terminate
    stateMachine.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    stateMachine.tick(makeFrameInfo());
    states.start.terminate(chip.makeSignal("end"));
    stateMachine.tick(makeFrameInfo());

    expect(states.start._onActivate).toBeCalledTimes(1);
    expect(states.start._onTick).toBeCalledTimes(1);
    expect(states.start._onTerminate).toBeCalledTimes(1);

    expect(stateMachine.outputSignal.name).toBe("end");
    expect(stateMachine.visitedStates).toContainEqual(chip.makeSignal("start"));
  });

  test("signals without state table", () => {
    const states = { a: new MockChip(), b: new MockChip() };
    const stateMachine = new chip.StateMachine(states, {
      startingState: chip.makeSignal("a"),
    });

    // Run once, then terminate
    stateMachine.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    stateMachine.tick(makeFrameInfo());
    states.a.terminate(chip.makeSignal("b"));
    stateMachine.tick(makeFrameInfo());

    expect(states.a._onActivate).toBeCalledTimes(1);
    expect(states.a._onTick).toBeCalledTimes(1);
    expect(states.a._onTerminate).toBeCalledTimes(1);

    expect(states.b._onActivate).toBeCalledTimes(1);
  });

  test("signals with state table", () => {
    const states = { a: new MockChip(), b: new MockChip() };
    const stateMachine = new chip.StateMachine(states, {
      startingState: chip.makeSignal("a"),
      signals: {
        a: "b",
        b: "a",
      },
    });

    // Run once, then terminate
    stateMachine.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    stateMachine.tick(makeFrameInfo());
    states.a.terminate();
    stateMachine.tick(makeFrameInfo());

    // Signal back again
    states.b.terminate();
    stateMachine.tick(makeFrameInfo());

    expect(states.a._onActivate).toBeCalledTimes(2);
    expect(states.a._onTerminate).toBeCalledTimes(1);

    expect(states.b._onActivate).toBeCalledTimes(1);
    expect(states.b._onTerminate).toBeCalledTimes(1);
  });

  test("manual signals", () => {
    const states = { a: new MockChip(), b: new MockChip() };
    const stateMachine = new chip.StateMachine(states, {
      startingState: chip.makeSignal("a"),
    });

    // Run once, then change state
    stateMachine.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    stateMachine.tick(makeFrameInfo());

    stateMachine.changeState("b");

    stateMachine.tick(makeFrameInfo());

    expect(states.a._onActivate).toBeCalledTimes(1);
    expect(states.a._onTick).toBeCalledTimes(1);
    expect(states.a._onTerminate).toBeCalledTimes(1);

    expect(states.b._onActivate).toBeCalledTimes(1);
  });

  test("signals with functions", () => {
    const states = { a: new MockChip(), b: new MockChip() };
    const stateMachine = new chip.StateMachine(states, {
      startingState: chip.makeSignal("a"),
      signals: {
        a: jest.fn(() => chip.makeSignal("b")),
      },
    });

    // Run once, then terminate
    stateMachine.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    stateMachine.tick(makeFrameInfo());

    const signal = chip.makeSignal("done", { x: "y" });
    states.a.terminate(signal);

    stateMachine.tick(makeFrameInfo());

    expect(states.a._onActivate).toBeCalledTimes(1);
    expect(states.a._onTick).toBeCalledTimes(1);
    expect(states.a._onTerminate).toBeCalledTimes(1);

    expect(states.b._onActivate).toBeCalledTimes(1);

    expect(stateMachine.options.signals.a).toBeCalledTimes(1);
    expect(stateMachine.options.signals.a).toBeCalledWith(
      stateMachine.chipContext,
      signal
    );
  });
});

describe("Alternative", () => {
  test("picks the first chip that terminates", () => {
    debugger;

    const children = [new MockChip(), new MockChip()];

    const alternative = new chip.Alternative(children);

    // Run once
    alternative.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    alternative.tick(makeFrameInfo());

    // Terminate second child
    children[1].terminate();

    // Alternative should terminate as well, with an output signal of the index of the child
    expect(alternative.state).toBe("inactive");
    expect(alternative.outputSignal.name).toBe("1");
  });

  test("can provide custom signal", () => {
    const children = [
      { chip: new MockChip(), signal: chip.makeSignal("hello") },
      new MockChip(),
    ];

    const alternative = new chip.Alternative(children);

    // Run once
    alternative.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    alternative.tick(makeFrameInfo());

    // Terminate first child
    // @ts-ignore
    children[0].chip.terminate();

    // Alternative should terminate as well, with an output signal of the index of the child
    expect(alternative.state).toBe("inactive");
    expect(alternative.outputSignal.name).toBe("hello");
  });
});

//// Test hot reload features

class ReloadingChip extends chip.ChipBase {
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

  protected _makeReloadMementoData(): chip.ReloadMementoData {
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

class ReloadingComposite extends chip.Composite {
  constructor(private _child: ReloadingChip) {
    super();
  }

  _onActivate() {
    this._activateChildChip(this._child, { id: "a" });
  }
}

describe("Hot reloading", () => {
  test("Base chip doesn't provide memento", () => {
    const e = new chip.Forever();
    e.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    expect(e.makeReloadMemento().data).toBeUndefined();
  });

  test("Custom chip provides memento", () => {
    // Provide a default value
    const e1 = new ReloadingChip(77);
    e1.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    expect(e1.makeReloadMemento().data.value).toBe(77);

    // Update the value, it should get in the new memento
    e1.value = 88;
    expect(e1.makeReloadMemento().data.value).toBe(88);

    // Create a new chip from the previous chips memento. It should have the newer value
    const e2 = new ReloadingChip(77);
    e2.activate(
      makeFrameInfo(),
      makeChipContext(),
      makeSignal(),
      e1.makeReloadMemento()
    );
    expect(e2.value).toBe(88);
  });

  test("Chips check for mismatched class names", () => {
    class ReloadingChip2 extends ReloadingChip {}

    const e1 = new ReloadingChip(77);
    e1.activate(makeFrameInfo(), makeChipContext(), makeSignal());

    const e2 = new ReloadingChip2(88);
    e2.activate(
      makeFrameInfo(),
      makeChipContext(),
      makeSignal(),
      e1.makeReloadMemento()
    );

    expect(e2.value).toBe(88);
  });

  test("Composite chips will reload their children", () => {
    const child1 = new ReloadingChip(77);
    const parent1 = new ReloadingComposite(child1);

    parent1.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    expect(child1.value).toBe(77);

    // Change the value
    child1.value = 88;

    const memento = parent1.makeReloadMemento();
    expect(_.size(memento.children)).toBe(1);

    // Reload the chip
    const child2 = new ReloadingChip(77);
    const parent2 = new ReloadingComposite(child2);
    parent2.activate(makeFrameInfo(), makeChipContext(), makeSignal(), memento);

    expect(child2.value).toBe(88);
  });

  test("works with Parallel", () => {
    const child1V1 = new ReloadingChip(1);
    const child2V1 = new ReloadingChip(2);
    const parentV1 = new chip.Parallel([child1V1, child2V1]);

    parentV1.activate(makeFrameInfo(), makeChipContext(), makeSignal());
    expect(child1V1.value).toBe(1);
    expect(child2V1.value).toBe(2);

    // Change the values
    child1V1.value = 88;
    child2V1.value = 99;

    const memento = parentV1.makeReloadMemento();
    expect(_.size(memento.children)).toBe(2);

    // Reload the chip
    const child1V2 = new ReloadingChip(1);
    const child2V2 = new ReloadingChip(2);
    const parent2 = new chip.Parallel([child1V2, child2V2]);
    parent2.activate(makeFrameInfo(), makeChipContext(), makeSignal(), memento);

    expect(child1V2.value).toBe(88);
    expect(child2V2.value).toBe(99);
  });

  test("works with Sequence", () => {
    const child1V1 = new ReloadingChip(1);
    const child2V1 = new ReloadingChip(2);
    const parentV1 = new chip.Sequence([child1V1, child2V1]);

    parentV1.activate(makeFrameInfo(), makeChipContext(), makeSignal());

    // Change the values
    child1V1.value = 99;

    let memento = parentV1.makeReloadMemento();
    // Only the activated child will be in the memento
    expect(_.size(memento.children)).toBe(1);

    // Reload the chip
    const child1V2 = new ReloadingChip(1);
    const child2V2 = new ReloadingChip(2);
    const parentV2 = new chip.Sequence([child1V2, child2V2]);
    parentV2.activate(
      makeFrameInfo(),
      makeChipContext(),
      makeSignal(),
      memento
    );

    expect(child1V2.value).toBe(99);

    // Skip to the next chip and change its value
    parentV2.skip();
    parentV2.tick(makeFrameInfo());
    child2V2.value = 77;

    // Reload
    memento = parentV2.makeReloadMemento();
    const child1V3 = new ReloadingChip(1);
    const child2V3 = new ReloadingChip(2);
    const parentV3 = new chip.Sequence([child1V3, child2V3]);
    parentV3.activate(
      makeFrameInfo(),
      makeChipContext(),
      makeSignal(),
      memento
    );

    // The 2nd child should be active and have the correct value
    expect(child2V3.state).toBe("active");
    expect(child2V3.value).toBe(77);
  });

  test("works with StateMachine", () => {
    const child1V1 = new ReloadingChip(1);
    const child2V1 = new ReloadingChip(2);
    const parentV1 = new chip.StateMachine({
      start: child1V1,
      middle: child2V1,
    });

    parentV1.activate(makeFrameInfo(), makeChipContext(), makeSignal());

    // Skip to another state
    parentV1.changeState("middle");

    parentV1.tick(makeFrameInfo());

    // Change the values
    child1V1.value = 11;
    child2V1.value = 22;

    // Reload
    const child1V2 = new ReloadingChip(1);
    const child2V2 = new ReloadingChip(2);
    const parentV2 = new chip.StateMachine({
      start: child1V2,
      middle: child2V2,
    });
    parentV2.activate(
      makeFrameInfo(),
      makeChipContext(),
      makeSignal(),
      parentV1.makeReloadMemento()
    );

    // Only 2nd child should be activate and have the new value
    expect(child1V1.state).toBe("inactive");

    expect(child2V2.state).toBe("active");
    expect(child2V2.value).toBe(22);
  });
});
