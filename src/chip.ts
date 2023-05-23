import { EventEmitter } from "eventemitter3";
import * as _ from "underscore";

/**
 * Fills in the mising options from the provided defaults
 * @param options Options provided by the caller
 * @param defaults Defaults provided by the author
 */
// @es-li
export function fillInOptions<T>(
  options: Partial<T> | unknown,
  defaults: T
): T {
  if (options) return { ...defaults, ...(options as object) };
  else return defaults;
}

/** Deep clone of JSON-serializable objects */
export function cloneData<T = unknown>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}

/**
 * Event source that uses a Node.js-like interface using `on()` and `off()`.
 */
export interface NodeEventSource {
  on(type: string, listener: () => void): void;
  once(type: string, listener: () => void): void;
  off(type: string, listener: () => void): void;
  emit(type: string, ...args: unknown[]): void;
}

export function isNodeEventSource(emitter: object): emitter is NodeEventSource {
  return typeof (emitter as NodeEventSource).on === "function";
}

export function isEventTarget(emitter: object): emitter is EventTarget {
  return typeof (emitter as EventTarget).addEventListener === "function";
}

export type UnsubscribeFunction = (
  emitter: object,
  event: string,
  cb: () => void
) => void;

export interface SubscriptionHandler {
  subscribe(emitter: object, event: string, cb: () => void): void;
  subscribeOnce(emitter: object, event: string, cb: () => void): void;
  unsubscribe(emitter: object, event: string, cb: () => void): void;
}

class NodeEventSourceSubscriptionHandler implements SubscriptionHandler {
  subscribe(emitter: NodeEventSource, event: string, cb: () => void): void {
    emitter.on(event, cb);
  }

  subscribeOnce(emitter: NodeEventSource, event: string, cb: () => void): void {
    emitter.once(event, cb);
  }

  unsubscribe(emitter: NodeEventSource, event: string, cb: () => void): void {
    emitter.off(event, cb);
  }
}

class EventTargetSubscriptionHandler implements SubscriptionHandler {
  subscribe(emitter: EventTarget, event: string, cb: () => void): void {
    emitter.addEventListener(event, cb);
  }

  subscribeOnce(emitter: EventTarget, event: string, cb: () => void): void {
    emitter.addEventListener(event, cb, { once: true });
  }

  unsubscribe(emitter: EventTarget, event: string, cb: () => void): void {
    emitter.removeEventListener(event, cb);
  }
}

export interface IEventListener {
  emitter: object;
  event: string;
  cb: () => void;
  subscriptionHandler: SubscriptionHandler;
}

/**
 * A `Signal` represents a immutable message that is provided to a chip when it activates,
 * as well as when it terminates.
 * A signal has a `name` and an optional map of strings to data.
 *
 * Because Signal is an interface, it cannot be created with `new`.
 * Instead, call `makeSignal()` to create one.
 */
export interface Signal {
  readonly name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly params: Record<string, any>;
}

export function makeSignal(name = "default", params = {}): Signal {
  return { name, params };
}

/**
 * A ChipContext is a immutable map of strings to data.
 * It is provided to chips by their parents.
 *
 * Instead of modifying a chip context, it should be overloaded,
 * by calling `processChipContext90`
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChipContext = Readonly<Record<string, any>>;

export type ChipContextFactory = (context: ChipContext) => ChipContext;
export type ChipContextResolvable = ChipContext | ChipContextFactory;

/**
 * Create a new `ChipContext` from a previous context and a list of alterations.
 * Each alteration can be a new map of strings to data, which overload previous keys,
 * or a function that takes the old context and returns a new one.
 */
export function processChipContext(
  chipContext: ChipContext,
  ...alteredContexts: Array<ChipContextResolvable>
): ChipContext {
  let context = chipContext;
  for (const alteredContext of alteredContexts) {
    if (!alteredContext) continue;

    if (typeof alteredContext == "function") context = alteredContext(context);
    else context = Object.assign({}, context, alteredContext);
  }

  return context;
}

/**
 * Information provided to a chip on each tick
 */
export interface TickInfo {
  timeSinceLastTick: number;
}

/**
 * A function that takes a context and a signal to optionally produce a new `Chip`.
 */
export type ChipFactory = (
  context: ChipContext,
  signal: Signal
) => Chip | undefined;

export type ChipResolvable = Chip | ChipFactory;

export interface ChipActivationInfo extends ActivateChildChipOptions {
  chip: ChipResolvable;
}

export type ChipState = "inactive" | "active" | "paused";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isChip(e: any): e is Chip {
  return (
    typeof e.activate === "function" &&
    typeof e.tick === "function" &&
    typeof e.terminate === "function"
  );
}

export function isChipResolvable(
  e: ChipResolvable | ChipActivationInfo
): e is ChipResolvable {
  return typeof e === "function" || isChip(e);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReloadMementoData = Record<string, any>;

export type ReloadMemento = {
  className: string;
  data: ReloadMementoData;
  children: Record<string, ReloadMemento>;
};

/**
 * In Booyah, the game is structured as a tree of chips. This is the interface for all chips.
 * When creating a new chip, you most likely want to extend ChipBase or Composite,
 * which implement this interface and do the busywork for you.
 *
 * Events:
 * - activated()
 * - terminated()
 **/
export interface Chip extends NodeEventSource {
  /** Current state of the chip */
  readonly state: ChipState;

  /** Once the chip is terminated, contains the signal */
  readonly outputSignal: Signal;

  /** Children of this chip, if any */
  readonly children: Record<string, Chip>;

  /** Activate the chip, with a provided context and input signal.
   * Should only be called from an inactive state
   * */
  activate(
    tickInfo: TickInfo,
    chipContext: ChipContext,
    inputSignal: Signal,
    reloadMemento?: ReloadMemento
  ): void;

  /** Update the chip, provided a new time */
  tick(tickInfo: TickInfo): void;

  /** Terminate the chip. Should only be called from an active or paused state */
  terminate(outputSignal?: Signal): void;

  /** Pause the chip, informing it that it won't receive ticks for a while */
  pause(tickInfo: TickInfo): void;

  /** Resumes the chip after it was paused */
  resume(tickInfo: TickInfo): void;

  makeReloadMemento(): ReloadMemento;
}

/**
 * A base class for creating chips that reduces boilterplate code.
 * To use it, simply override some or all of the following protected methods:
 * - _onActivate()
 * - _onTick()
 * - _onTerminate()
 * - _onPause()
 * - _onResume()
 * In these methods, you can access the `_chipContext` `_lastTickInfo` properties to obtain
 * the latest information there.
 *
 * In addition, you can subscribe to events using `_subscribe()` in a way that automatically
 * unsubscribes when the chip is terminated.
 */
export abstract class ChipBase extends EventEmitter implements Chip {
  protected _chipContext: ChipContext;
  protected _lastTickInfo: TickInfo;
  protected _inputSignal: Signal;
  protected _reloadMemento?: ReloadMemento;
  protected _eventListeners: IEventListener[] = [];
  protected _outputSignal: Signal;
  protected _state: ChipState = "inactive";

  get chipContext(): ChipContext {
    return this._chipContext;
  }

  public activate(
    tickInfo: TickInfo,
    chipContext: ChipContext,
    inputSignal: Signal,
    reloadMemento?: ReloadMemento
  ): void {
    if (this._state !== "inactive")
      throw new Error(`activate() called from state ${this._state}`);

    this._chipContext = chipContext;
    this._lastTickInfo = tickInfo;
    this._inputSignal = inputSignal;
    this._state = "active";
    delete this._outputSignal;

    if (reloadMemento && reloadMemento.className === this.constructor.name)
      this._reloadMemento = reloadMemento;
    else delete this._reloadMemento;

    this._onActivate();

    this.emit("activated", inputSignal);
  }

  public tick(tickInfo: TickInfo): void {
    if (this._state === "paused") return;
    if (this._state !== "active")
      throw new Error(`tick() called from state ${this._state}`);

    this._lastTickInfo = tickInfo;
    this._onTick();
  }

  public terminate(outputSignal?: Signal): void {
    if (this._state !== "active" && this._state !== "paused")
      throw new Error(`tick() called from state ${this._state}`);

    this._outputSignal = outputSignal ?? makeSignal();
    this._onTerminate();

    this._unsubscribe(); // Remove all event listeners

    this._state = "inactive";

    this.emit("terminated", this._outputSignal);
  }

  public pause(tickInfo: TickInfo): void {
    if (this._state !== "active")
      throw new Error(`pause() called from state ${this._state}`);

    this._state = "paused";

    this._onPause();
  }

  public resume(tickInfo: TickInfo): void {
    if (this._state !== "paused")
      throw new Error(`resume() called from state ${this._state}`);

    this._state = "active";

    this._onResume();
  }

  /**
   * Start listening to events of a certain type emitted by an object.
   * The callback will be called with the chip as `this`.
   * Works by default for both NodeJS- and DOM-style events.
   * If you are interfacing with a different event system, you can provide a
   * `subscriptionHandler` that knows how to handle it.
   */
  protected _subscribe(
    emitter: object,
    event: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cb: (...args: any[]) => void,
    subscriptionHandler?: SubscriptionHandler
  ): void {
    if (!subscriptionHandler) {
      if (isNodeEventSource(emitter)) {
        subscriptionHandler = new NodeEventSourceSubscriptionHandler();
      } else if (isEventTarget) {
        subscriptionHandler = new EventTargetSubscriptionHandler();
      } else {
        throw new Error(
          `Emitter is of unknown type "${typeof emitter}", requires custom SubscriptionHandler`
        );
      }
    }

    // Make sure the callback uses the correct `this`
    cb = cb.bind(this);

    this._eventListeners.push({ emitter, event, cb, subscriptionHandler });
    subscriptionHandler.subscribe(emitter, event, cb);
  }

  /**
   * Listen to a single event emitted by an object, then stop.
   * The callback will be called with the chip as `this`.
   * Works by default for both NodeJS- and DOM-style events.
   * If you are interfacing with a different event system, you can provide a
   * `subscriptionHandler` that knows how to handle them.
   */
  protected _subscribeOnce(
    emitter: object,
    event: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cb: (...args: any[]) => void,
    subscriptionHandler?: SubscriptionHandler
  ): void {
    if (!subscriptionHandler) {
      if (isNodeEventSource(emitter)) {
        subscriptionHandler = new NodeEventSourceSubscriptionHandler();
      } else if (isEventTarget) {
        subscriptionHandler = new EventTargetSubscriptionHandler();
      } else {
        throw new Error(
          `Emitter is of unknown type "${typeof emitter}", requires custom SubscriptionHandler`
        );
      }
    }

    cb = cb.bind(this);

    this._eventListeners.push({ emitter, event, cb, subscriptionHandler });
    subscriptionHandler.subscribeOnce(emitter, event, cb);
  }

  /** Unsubscribe to a set of events.
   * By default, unsubscribes to everything. If `emitter`, `event`, or `cb` is provided,
   * unsubscribe only to those.
   */
  protected _unsubscribe(
    emitter?: NodeEventSource,
    event?: string,
    cb?: (...args: unknown[]) => void
  ): void {
    // props should only contain defined arguments
    const props = _.pick(
      {
        emitter,
        event,
        cb,
      },
      (v) => !!v
    );

    const [listenersToRemove, listenersToKeep] = _.partition(
      this._eventListeners,
      props
    );
    for (const listener of listenersToRemove)
      listener.subscriptionHandler.unsubscribe(
        listener.emitter,
        listener.event,
        listener.cb
      );

    this._eventListeners = listenersToKeep;
  }

  public get children(): Record<string, Chip> {
    return {};
  }

  public get outputSignal(): Signal {
    return this._outputSignal;
  }

  public get state(): ChipState {
    return this._state;
  }

  public makeReloadMemento(): ReloadMemento {
    if (this._state !== "active" && this._state !== "paused")
      throw new Error(`makeReloadMemento() called from state ${this._state}`);

    const childMementos: Record<string, ReloadMemento> = {};
    for (const childId in this.children) {
      childMementos[childId] = this.children[childId].makeReloadMemento();
    }

    return {
      className: this.constructor.name,
      data: this._makeReloadMementoData(),
      children: childMementos,
    };
  }

  /**
   * Template method called by `activate()`.
   */
  protected _onActivate() {
    /* no op */
  }

  /**
   * Template method called by `tick()`.
   */
  protected _onTick() {
    /* no op */
  }

  /**
   * Template method called by `terminate()`.
   */
  protected _onTerminate() {
    /* no op */
  }

  /**
   * Template method called by `pause()`.
   */
  protected _onPause() {
    /* no op */
  }

  /**
   * Template method called by `resume()`.
   */
  protected _onResume() {
    /* no op */
  }

  /** By default, an chip be automatically reloaded */
  protected _makeReloadMementoData(): ReloadMementoData {
    return undefined;
  }
}

/** Empty chip that does nothing and never terminates  */
export class Forever extends ChipBase {}

/** An chip that terminates with a given output signal immediately  */
export class Transitory extends ChipBase {
  constructor(public readonly terminateSignal = makeSignal()) {
    super();
  }

  _onActivate() {
    this.terminate(this.terminateSignal);
  }
}

/** Options that can be passed to Composite._activateChildChip() */
export class ActivateChildChipOptions {
  /** Additional context or function to return a context */
  context?: ChipContextResolvable;

  /** An input signal given to the chip */
  inputSignal?: Signal;

  /**
   * If provided, will store the chip using this attribute name.
   * If the name ends with `[]` or if the attribute is an array,
   * adds the chip to the array attribute of that name.
   */
  attribute?: string;

  /**
   * If true, adds the child chip to the context provided to children, using the
   * provided `attribute` or `id`.
   */
  includeInChildContext?: boolean;

  id?: string;
  reloadMemento?: ReloadMemento;
}

/**
 * Base class for chips that contain other chips
 *
 * Events:
 * - activatedChildChip(chip: Chip, context: ChipContext, signal: Signal)
 * - terminatedChildChip(chip: Chip)
 */
export abstract class Composite extends ChipBase {
  protected _childChips: Record<string, Chip>;
  private _childChipContext: Record<string, unknown>;
  private _deferredOutputSignal: Signal;
  // Are the activate() or tick() methods currently being run?
  private _methodCallInProgress: boolean;

  public activate(
    tickInfo: TickInfo,
    chipContext: ChipContext,
    inputSignal: Signal,
    reloadMemento?: ReloadMemento
  ): void {
    this._childChips = {};
    this._childChipContext = {};

    this._methodCallInProgress = true;
    super.activate(tickInfo, chipContext, inputSignal, reloadMemento);
    this._methodCallInProgress = false;
  }

  /**
   * By default, updates all child chips and remove those that have a signal
   * Overload this method in subclasses to change the behavior
   */
  public tick(tickInfo: TickInfo): void {
    if (this._state === "paused") return;
    if (this._state !== "active")
      throw new Error(`tick() called from state ${this._state}`);

    if (this._deferredOutputSignal) {
      this.terminate(this._deferredOutputSignal);
      return;
    }

    this._lastTickInfo = tickInfo;

    this._onTick();
    this._methodCallInProgress = true;
    this._tickChildChips();
    this._methodCallInProgress = false;
    this._onAfterTick();
  }

  public terminate(outputSignal?: Signal): void {
    if (this._methodCallInProgress) {
      this._deferredOutputSignal = outputSignal;
      return;
    }

    this._terminateAllChildChips();

    super.terminate(outputSignal);
  }

  public pause(tickInfo: TickInfo): void {
    super.pause(tickInfo);

    this._removeTerminatedChildChips();
    for (const child of Object.values(this._childChips)) {
      child.pause(tickInfo);
    }
  }

  public resume(tickInfo: TickInfo): void {
    super.resume(tickInfo);

    this._removeTerminatedChildChips();
    for (const child of Object.values(this._childChips)) {
      child.resume(tickInfo);
    }
  }

  public get children(): Record<string, Chip> {
    return this._childChips;
  }

  /**
   * Activate a child chip
   * @param chipResolvable A chip or function to create a chip
   * @param options
   * @returns The activated chip
   */
  protected _activateChildChip(
    chipResolvable: ChipResolvable,
    options?: Partial<ActivateChildChipOptions>
  ): Chip {
    if (this.state === "inactive") throw new Error("Composite is inactive");

    options = fillInOptions(options, new ActivateChildChipOptions());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const thisAsAny = this as any;

    // If an existing chip with that attribute exists, terminate it
    // Don't remove arrays, though
    if (
      options.attribute &&
      !options.attribute.endsWith("[]") &&
      thisAsAny[options.attribute]
    ) {
      if (!isChip(thisAsAny[options.attribute]))
        throw new Error(
          `Setting the attribute ${
            options.attribute
          } would replace a non-chip. Current attribute value = ${
            thisAsAny[options.attribute]
          }`
        );

      this._terminateChildChip(thisAsAny[options.attribute] as Chip);
    }

    let providedId = options.id ?? options.attribute;
    if (providedId) {
      if (providedId.endsWith("[]")) {
        providedId = _.uniqueId(providedId);
      }
      if (providedId in this._childChips)
        throw new Error("Duplicate child chip ID provided");
    }

    const inputSignal = options.inputSignal ?? makeSignal();

    const childContext = processChipContext(
      this._chipContext,
      this._childChipContext,
      this.defaultChildChipContext,
      options.context
    );

    let chip: Chip;
    if (_.isFunction(chipResolvable)) {
      chip = chipResolvable(childContext, inputSignal);
    } else {
      chip = chipResolvable;
    }

    // If no chip is returned, then nothing more to do
    if (!chip) return;

    // Look for reload memento, if an id is provided
    let reloadMemento: ReloadMemento;
    if (providedId && this._reloadMemento?.children[providedId]) {
      reloadMemento = this._reloadMemento.children[providedId];
    }

    // If no childId is provided, use a random temporary value
    const childId =
      providedId ?? `unknown_${_.random(Number.MAX_SAFE_INTEGER)}`;
    this._childChips[childId] = chip;

    if (options.attribute) {
      let attributeName = options.attribute;
      // If the attribute name has an array syntax, add to the array
      if (options.attribute.endsWith("[]")) {
        // Take off the last 2 characters
        attributeName = attributeName.slice(0, attributeName.length - 2);
        let attributeAsArray = this[attributeName as keyof this] as Array<Chip>;
        if (typeof attributeAsArray !== "undefined") {
          // Add to array
          attributeAsArray.push(chip);
        } else {
          // Create a new array
          attributeAsArray = [chip];
          // @ts-ignore
          this[attributeName] = attributeAsArray;
        }

        // When the chip is terminated, remove the attribute
        this._subscribeOnce(chip, "terminated", (signal: Signal) => {
          // @ts-ignore
          const attributeAsArray = this[attributeName] as Array<Chip>;
          const index = attributeAsArray.indexOf(chip);
          attributeAsArray.splice(index, 1);
        });
      } else {
        // @ts-ignore
        this[attributeName] = chip;

        // When the chip is terminated, delete the attribute
        this._subscribeOnce(chip, "terminated", (signal: Signal) => {
          delete this[attributeName as keyof this];
        });
      }
    }

    chip.activate(this._lastTickInfo, childContext, inputSignal, reloadMemento);

    if (options.includeInChildContext) {
      if (!providedId)
        throw new Error(
          "To include a child chip in the context, provide an attribute name or ID"
        );

      this._childChipContext[providedId] = chip;

      // When the chip is terminated, remove from the context
      this._subscribeOnce(chip, "terminated", (signal: Signal) => {
        // @ts-ignore
        delete this._childChipContext[providedId];
      });
    }

    this.emit("activatedChildChip", chip, childContext, inputSignal);

    return chip;
  }

  protected _terminateChildChip(chip: Chip, outputSignal?: Signal): void {
    if (this.state === "inactive") throw new Error("Composite is inactive");

    // Try to find value
    let childId: string;
    for (const id in this._childChips) {
      if (this._childChips[id] === chip) {
        childId = id;
        break;
      }
    }
    if (!childId) throw new Error("Cannot find chip to terminate");

    chip.terminate(outputSignal);

    delete this._childChips[childId];

    this.emit("terminatedChildChip", chip);
  }

  /**
   * Check if child chips are still active, and remove them if not
   * Sends tick to all .
   */
  protected _tickChildChips(): void {
    for (const childChip of Object.values(this._childChips)) {
      if (childChip.state !== "inactive") childChip.tick(this._lastTickInfo);
    }

    this._removeTerminatedChildChips();
  }

  /** Terminate all the children, with the provided signal */
  protected _terminateAllChildChips(outputSignal?: Signal) {
    for (const childChip of Object.values(this._childChips)) {
      if (childChip.state === "active" || childChip.state === "paused") {
        childChip.terminate(outputSignal);
      }

      this.emit("terminatedChildChip", childChip);
    }

    this._childChips = {};
  }

  /** Remove any child chips */
  protected _removeTerminatedChildChips(): void {
    for (const id in this._childChips) {
      const childChip = this._childChips[id];

      if (childChip.state === "inactive") {
        delete this._childChips[id];
        this.emit("terminatedChildChip", childChip);
      }
    }
  }

  /**
   * Template getter for the chip context provided to children.
   * Overload to add extra attributes to the context.
   */
  get defaultChildChipContext(): ChipContextResolvable {
    return undefined;
  }

  /** Template method called after children are ticked */
  protected _onAfterTick(): void {
    /* no op */
  }
}

export class ParallelOptions {
  terminateOnCompletion = true;
}

/**
 * Executes a set of chips at the same time.
 * By default, terminates when all child chips have completed, unless `options.signalOnCompletion` is false.
 */
export class Parallel extends Composite {
  private readonly _options: ParallelOptions;

  private _chipActivationInfos: ChipActivationInfo[] = [];
  private _infoToChip = new Map<ChipActivationInfo, Chip>();

  constructor(
    chipActivationInfos: Array<ChipActivationInfo | ChipResolvable>,
    options?: Partial<ParallelOptions>
  ) {
    super();

    this._options = fillInOptions(options, new ParallelOptions());

    for (const e of chipActivationInfos) this.addChildChip(e);
  }

  /** Add a new chip. If the chip is running, activate it */
  addChildChip(chip: ChipActivationInfo | ChipResolvable) {
    let info = isChipResolvable(chip) ? { chip: chip } : chip;
    this._chipActivationInfos.push(info);

    if (this.state !== "inactive") {
      // If no attribute or ID given, make a default one
      if (!info.attribute && !info.id)
        info = _.defaults({}, info, {
          id: (this._chipActivationInfos.length - 1).toString(),
        });

      this._activateChildChip(info.chip, info);
    }
  }

  _onActivate() {
    if (this._chipActivationInfos.length === 0) {
      // Empty set, stop immediately
      if (this._options.terminateOnCompletion) this.terminate(makeSignal());
      return;
    }

    // Activate all provided chips
    for (let i = 0; i < this._chipActivationInfos.length; i++) {
      let info = this._chipActivationInfos[i];
      // If no attribute or ID given, make a default one
      if (!info.attribute && !info.id)
        info = _.defaults({}, info, {
          id: (this._chipActivationInfos.length - 1).toString(),
        });

      const chip = this._activateChildChip(info.chip, info);
      this._infoToChip.set(info, chip);
    }
  }

  _onAfterTick() {
    if (!Object.keys(this._childChips) && this._options.terminateOnCompletion)
      this.terminate(makeSignal());
  }

  /**
   * Remove the child chip, by value or index.
   * If the chip is running, terminate it
   */
  removeChildChip(e: ChipActivationInfo | ChipResolvable | number): void {
    let index: number;
    if (typeof e === "number") {
      index = e;
      if (index < 0 || index >= this._chipActivationInfos.length)
        throw new Error("Invalid index of chip to remove");
    } else {
      index = this.indexOfChipActivationInfo(e);
      if (index === -1) throw new Error("Cannot find chip to remove");
    }

    if (this.state !== "inactive") {
      const chip = this._infoToChip.get(this._chipActivationInfos[index]);
      chip.terminate();
    }
  }

  indexOfChipActivationInfo(chip: ChipActivationInfo | ChipResolvable): number {
    if (isChipResolvable(chip)) {
      return _.indexOf(this._chipActivationInfos, { chip });
    } else {
      return this._chipActivationInfos.indexOf(chip);
    }
  }
}

export class ContextProvider extends Composite {
  constructor(
    private readonly _context: Record<string, ChipResolvable>,
    private readonly _child: ChipResolvable
  ) {
    super();
  }

  protected _onActivate(): void {
    // First, activate the children that provide the context
    for (const name in this._context) {
      this._activateChildChip(this._context[name], {
        id: name,
        includeInChildContext: true,
      });
    }

    // Then activate the child
    {
      this._activateChildChip(this._child, {
        id: "child",
      });
    }
  }
}

export class SequenceOptions {
  loop = false;
  terminateOnCompletion = true;
}

/**
  Runs one child chip after another. 
  When done, terminates with output signal of the last chip in the sequence.
  Optionally can loop back to the first chip.
*/
export class Sequence extends Composite {
  private readonly _options: SequenceOptions;

  private _chipActivationInfos: ChipActivationInfo[] = [];
  private _currentChipIndex = 0;
  private _currentChip: Chip;

  constructor(
    chipActivationInfos: Array<ChipActivationInfo | ChipResolvable>,
    options?: Partial<SequenceOptions>
  ) {
    super();

    this._options = fillInOptions(options, new SequenceOptions());

    for (const e of chipActivationInfos) this.addChildChip(e);
  }

  /** Add a new chip to the sequence */
  addChildChip(chip: ChipActivationInfo | ChipResolvable) {
    if (isChipResolvable(chip)) {
      this._chipActivationInfos.push({ chip: chip });
    } else {
      this._chipActivationInfos.push(chip);
    }
  }

  /** Skips to the next chip */
  skip() {
    this._advance(makeSignal("skip"));
  }

  private _switchChip() {
    // Stop current chip
    if (this._currentChip) {
      // The current chip may have already been terminated, if it terminated before
      if (_.size(this._childChips) > 0)
        this._terminateChildChip(this._currentChip);
      delete this._currentChip;
    }

    if (this._currentChipIndex < this._chipActivationInfos.length) {
      let chipActivationInfo =
        this._chipActivationInfos[this._currentChipIndex];
      // If no attribute or ID given, make a default one
      if (!chipActivationInfo.attribute && !chipActivationInfo.id)
        chipActivationInfo = _.defaults({}, chipActivationInfo, {
          id: (this._chipActivationInfos.length - 1).toString(),
        });

      this._currentChip = this._activateChildChip(
        chipActivationInfo.chip,
        chipActivationInfo
      );
    }
  }

  _onActivate() {
    this._currentChipIndex =
      (this._reloadMemento?.data.currentChipIndex as number) ?? 0;
    delete this._currentChip;

    if (this._chipActivationInfos.length === 0) {
      // Empty Sequence, stop immediately
      if (this._options.terminateOnCompletion) this.terminate(makeSignal());
    } else {
      // Start the Sequence
      this._switchChip();
    }
  }

  _onAfterTick() {
    if (!this._currentChip) return;

    const signal = this._currentChip.outputSignal;
    if (signal) this._advance(signal);
  }

  _onTerminate() {
    delete this._currentChip;
  }

  /** Restart the sequence on the first chip */
  restart() {
    this._currentChipIndex = 0;
    this._switchChip();
  }

  private _advance(signal: Signal) {
    this._currentChipIndex++;
    this._switchChip();

    // If we've reached the end of the Sequence...
    if (this._currentChipIndex >= this._chipActivationInfos.length) {
      if (this._options.loop) {
        // ... and we loop, go back to start
        this._currentChipIndex = 0;
        this._switchChip();
      } else if (this._options.terminateOnCompletion) {
        // otherwise terminate
        this.terminate(signal);
      }
    }
  }

  protected _makeReloadMementoData(): ReloadMementoData {
    return {
      currentChipIndex: this._currentChipIndex,
    };
  }
}

export type StateTable = { [n: string]: ChipActivationInfo };
export type StateTableDescriptor = {
  [n: string]: ChipActivationInfo | ChipResolvable;
};

export type SignalFunction = (signal: Signal) => Signal;
export type SignalDescriptor = Signal | SignalFunction;
export type SignalTable = { [name: string]: SignalDescriptor };

export class StateMachineOptions {
  startingState: Signal | string = "start";
  signals: { [n: string]: SignalDescriptor | string };
  endingStates: string[] = ["end"];
  startingProgress: Record<string, unknown> = {};
}

/** 
  Represents a state machine, where each state has a name, and is represented by an chip.
  Only one state is active at a time. 
  The state machine has one starting state, but can have multiple ending states.
  When the machine reaches an ending state, it terminates with a name equal to the name of the ending state.
  By default, the state machine begins at the state called "start", and stops at "end".

  The signals are not provided directly by the states (chips) by rather by a signal table provided in the constructor.
  To use have a signal table within a signal table, use the function makeSignalTable()
*/
export class StateMachine extends Composite {
  public readonly options: StateMachineOptions;

  public states: StateTable = {};
  public signals: SignalTable = {};
  public startingState: SignalDescriptor;
  public visitedStates: Signal[];
  public progress: Record<string, unknown>;
  public activeChildChip: Chip;
  public stateParams: Record<string, unknown>;
  private lastSignal: Signal;

  constructor(
    states: StateTableDescriptor,
    options?: Partial<StateMachineOptions>
  ) {
    super();

    // Create state table
    for (const name in states) {
      const state = states[name];
      if (isChipResolvable(state)) {
        this.states[name] = { chip: state };
      } else {
        this.states[name] = state;
      }
    }

    this.options = fillInOptions(options, new StateMachineOptions());

    // Ensure all signals are of the correct type
    if (typeof this.options.startingState === "string")
      this.startingState = makeSignal(this.options.startingState);
    else this.startingState = this.options.startingState;

    for (const key in this.options.signals) {
      const value = this.options.signals[key];
      if (typeof value === "string") {
        this.signals[key] = makeSignal(value);
      } else {
        this.signals[key] = value;
      }
    }
  }

  activate(
    tickInfo: TickInfo,
    chipContext: ChipContext,
    inputSignal?: Signal,
    reloadMemento?: ReloadMemento
  ) {
    super.activate(tickInfo, chipContext, inputSignal, reloadMemento);

    this.visitedStates = [];
    this.progress = cloneData(this.options.startingProgress);

    if (this._reloadMemento) {
      this.visitedStates = this._reloadMemento.data.visitedStates as Signal[];
      this._changeState(_.last(this.visitedStates));
    } else {
      const startingState = _.isFunction(this.startingState)
        ? this.startingState(makeSignal())
        : this.startingState;
      this._changeState(startingState);
    }
  }

  _onAfterTick() {
    if (!this.activeChildChip) return;

    const signal = this.activeChildChip.outputSignal;
    if (signal) {
      let nextStateDescriptor: Signal;
      // The signal could directly be the name of another state, or ending state
      if (!(this.lastSignal.name in this.signals)) {
        if (
          signal.name in this.states ||
          _.contains(this.options.endingStates, signal.name)
        ) {
          nextStateDescriptor = signal;
        } else {
          throw new Error(`Cannot find signal for state '${signal.name}'`);
        }
      } else {
        const signalDescriptor: SignalDescriptor =
          this.signals[this.lastSignal.name];
        if (_.isFunction(signalDescriptor)) {
          nextStateDescriptor = signalDescriptor(signal);
        } else {
          nextStateDescriptor = signalDescriptor;
        }
      }

      // Unpack the next state
      let nextState: Signal;
      if (
        !nextStateDescriptor.params ||
        _.isEmpty(nextStateDescriptor.params)
      ) {
        // By default, pass through the params in the input signal
        nextState = makeSignal(nextStateDescriptor.name, signal.params);
      } else {
        nextState = nextStateDescriptor;
      }

      this._changeState(nextState);
    }
  }

  _onTerminate() {
    delete this.activeChildChip;
    delete this.lastSignal;
  }

  protected _makeReloadMementoData(): ReloadMementoData {
    return {
      visitedStates: this.visitedStates,
    };
  }

  changeState(nextState: string | Signal): void {
    if (typeof nextState === "string") {
      nextState = makeSignal(nextState);
    }

    this._changeState(nextState);
  }

  private _changeState(nextState: Signal): void {
    // Stop current state
    if (this.activeChildChip) {
      // The state may have already been terminated, if terminated
      if (_.size(this._childChips) > 0)
        this._terminateChildChip(this.activeChildChip);
      delete this.activeChildChip;
    }

    // If reached an ending state, stop here.
    if (_.contains(this.options.endingStates, nextState.name)) {
      this.lastSignal = nextState;
      this.visitedStates.push(nextState);

      // Termiante with signal
      this.terminate(nextState);
      return;
    }

    if (nextState.name in this.states) {
      const nextStateContext = this.states[nextState.name];
      this.activeChildChip = this._activateChildChip(nextStateContext.chip, {
        context: nextStateContext.context,
        inputSignal: nextState,
        id: nextState.name,
      });
    } else {
      throw new Error(`Cannot find state '${nextState.name}'`);
    }

    const previousSignal = this.lastSignal;
    this.lastSignal = nextState;

    this.visitedStates.push(nextState);

    this.emit("stateChange", previousSignal, nextState);
  }
}

/** 
  Creates a signal table for use with StateMachine.
  Example: 
    const signals = {
      start: chip.makeSignalTable({ 
        win: "end",
        lose: "start",
      }),
    };
    `
*/
export function makeSignalTable(table: {
  [key: string]: string | SignalFunction;
}): SignalFunction {
  const f = function (signal: Signal): Signal {
    if (signal.name in table) {
      const signalResolvable = table[signal.name];
      if (_.isFunction(signalResolvable)) {
        return signalResolvable(signal);
      } else {
        return makeSignal(signalResolvable);
      }
    } else {
      throw new Error(`Cannot find state ${signal.name}`);
    }
  };
  f.table = table; // For debugging purposes

  return f;
}

export interface FunctionalFunctions {
  activate: (chip: Functional) => void;
  tick: (chip: Functional) => void;
  pause: (chip: Functional) => void;
  resume: (chip: Functional) => void;
  terminate: (chip: Functional) => void;
  shouldTerminate: (chip: Functional) => Signal | string | boolean;
  makeReloadMemento(): ReloadMemento;
}

/**
  An chip that gets its behavior from functions provided inline in the constructor.
  Useful for small chips that don't require their own class definition.
  Additionally, a function called shouldTerminate(options, chip), called after activate() and tick(), can return a signal

  Example usage:
    new Functional({
      activate: (chipContext) => console.log("activate", chipContext),
      terminate: () => console.log("terminate"),
    });
*/
export class Functional extends Composite {
  constructor(public readonly functions: Partial<FunctionalFunctions>) {
    super();
  }

  protected get lastFrameInfo(): TickInfo {
    return this._lastTickInfo;
  }
  protected get inputSignal(): Signal {
    return this._inputSignal;
  }
  protected get reloadMemento(): ReloadMemento | undefined {
    return this._reloadMemento;
  }

  protected _onActivate() {
    if (this.functions.activate) this.functions.activate(this);
    this._checkForTermination();
  }

  protected _onTick() {
    if (this.functions.tick) this.functions.tick(this);
    this._checkForTermination();
  }

  protected _onPause() {
    if (this.functions.pause) this.functions.pause(this);
  }

  protected _onResume() {
    if (this.functions.resume) this.functions.resume(this);
  }

  protected _onTerminate() {
    if (this.functions.terminate) this.functions.terminate(this);
  }

  private _checkForTermination() {
    if (!this.functions.shouldTerminate) return;

    const result = this.functions.shouldTerminate(this);
    if (result) {
      if (_.isString(result)) {
        this.terminate(makeSignal(result));
      } else if (_.isObject(result)) {
        this.terminate(result);
      } else {
        // result is true
        this.terminate(makeSignal());
      }
    }
  }
}

/**
  An chip that calls a provided function just once (in activate), and immediately terminates.
  If the function returns a signal, will terminate with that signal.
  Optionally takes a @that parameter, which is set as _this_ during the call. 
*/
export class Lambda extends ChipBase {
  constructor(public f: (arg: unknown) => unknown, public that?: unknown) {
    super();
    this.that = that || this;
  }

  _onActivate() {
    const result = this.f.call(this.that);

    if (typeof result === "string") this.terminate(makeSignal(result));
    else if (typeof result === "object") this.terminate(result);
    else this.terminate(makeSignal());
  }
}

/** Waits until time is up, then requests signal */
export class Wait extends ChipBase {
  private _accumulatedTime: number;

  /** @wait is in milliseconds */
  constructor(public readonly wait: number) {
    super();
  }

  _onActivate() {
    this._accumulatedTime = 0;
  }

  _onTick() {
    this._accumulatedTime += this._lastTickInfo.timeSinceLastTick;

    if (this._accumulatedTime >= this.wait) {
      this.terminate();
    }
  }
}

/**
 * Does not terminate until done() is called with a given signal
 */
export class Block extends ChipBase {
  done(signal = makeSignal()) {
    this.terminate(signal);
  }
}

/**
 * Waits for an event to be delivered, and decides to request a signal depending on the event value.
 * @handler is a function of the event arguments, and should return either a signal or a boolean as to whether to signal or not
 */
export class WaitForEvent extends ChipBase {
  constructor(
    public emitter: NodeEventSource,
    public eventName: string,
    public handler: (...args: unknown[]) => Signal | boolean = _.constant(true)
  ) {
    super();
  }

  _onActivate() {
    this._subscribe(this.emitter, this.eventName, this._handleEvent);
  }

  _handleEvent(...args: unknown[]) {
    const result = this.handler(...args);
    if (!result) return;

    if (_.isObject(result)) {
      this.terminate(result);
    } else {
      // result is true
      this.terminate();
    }
  }
}

export interface AlternativeChipActivationInfo extends ChipActivationInfo {
  signal?: Signal;
}

/**
 *  Chip that requests a signal as soon as one of it's children requests one
 */
export class Alternative extends Composite {
  private readonly _chipActivationInfos: AlternativeChipActivationInfo[];

  // signal defaults to the string version of the index in the array (to avoid problem of 0 being considered as falsy)
  constructor(
    chipActivationInfos: Array<ChipResolvable | AlternativeChipActivationInfo>
  ) {
    super();

    // Set default signal as the string version of the index in the array (to avoid problem of 0 being considered as falsy)
    this._chipActivationInfos = chipActivationInfos.map((info, key) => {
      if (isChip(info) || typeof info === "function") {
        return {
          chip: info,
        };
      } else {
        return info;
      }
    });
  }

  _onActivate() {
    for (const chipActivationInfo of this._chipActivationInfos) {
      this._activateChildChip(chipActivationInfo.chip, {
        context: chipActivationInfo.context,
      });
    }

    this._checkForSignal();
  }

  _onTick() {
    this._checkForSignal();
  }

  private _checkForSignal(): void {
    for (let i = 0; i < this._chipActivationInfos.length; i++) {
      if (this._childChips[i].outputSignal) {
        const terminateWith =
          this._chipActivationInfos[i].signal ?? makeSignal(i.toString());
        this.terminate(terminateWith);
        break;
      }
    }
  }
}
