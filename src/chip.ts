import { EventEmitter } from "eventemitter3";
import * as _ from "underscore";

/**
 * Fills in the missing options from the provided defaults
 * @param options Options provided by the caller
 * @param defaults Defaults provided by the author
 */
// @es-li
export function fillInOptions<T>(
  options: Partial<T> | unknown,
  defaults: T,
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
  cb: () => void,
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
  boundCb: () => void;
  subscriptionHandler: SubscriptionHandler;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SignalParams = Record<string, any>;

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
  readonly params: SignalParams;
}

export function makeSignal(
  name = "default",
  params: SignalParams = {},
): Signal {
  return { name, params };
}

export function resolveSignal(value: Signal | string): Signal {
  if (typeof value === "string") return makeSignal(value);
  return value;
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
  signal: Signal,
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
  e: ChipResolvable | ChipActivationInfo,
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
    reloadMemento?: ReloadMemento,
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
 * A base class for creating chips that reduces boilerplate code.
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
    reloadMemento?: ReloadMemento,
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

  public terminate(outputSignal: Signal = makeSignal()): void {
    if (this._state !== "active" && this._state !== "paused")
      throw new Error(`terminate() called from state ${this._state}`);

    this._outputSignal = outputSignal;
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
    subscriptionHandler?: SubscriptionHandler,
  ): void {
    if (!subscriptionHandler) {
      if (isNodeEventSource(emitter)) {
        subscriptionHandler = new NodeEventSourceSubscriptionHandler();
      } else if (isEventTarget) {
        subscriptionHandler = new EventTargetSubscriptionHandler();
      } else {
        throw new Error(
          `Emitter is of unknown type "${typeof emitter}", requires custom SubscriptionHandler`,
        );
      }
    }

    // Store the event listener callback "unbound" for future removal, but bind it for calling with the correct "this"
    const boundCb = cb.bind(this);
    this._eventListeners.push({
      emitter,
      event,
      cb,
      boundCb,
      subscriptionHandler,
    });

    subscriptionHandler.subscribe(emitter, event, boundCb);
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
    subscriptionHandler?: SubscriptionHandler,
  ): void {
    if (!subscriptionHandler) {
      if (isNodeEventSource(emitter)) {
        subscriptionHandler = new NodeEventSourceSubscriptionHandler();
      } else if (isEventTarget) {
        subscriptionHandler = new EventTargetSubscriptionHandler();
      } else {
        throw new Error(
          `Emitter is of unknown type "${typeof emitter}", requires custom SubscriptionHandler`,
        );
      }
    }

    // Store the event listener callback "unbound" for future removal, but bind it for calling with the correct "this"
    const boundCb = cb.bind(this);
    this._eventListeners.push({
      emitter,
      event,
      cb,
      boundCb,
      subscriptionHandler,
    });
    subscriptionHandler.subscribeOnce(emitter, event, boundCb);
  }

  /** Unsubscribe to a set of events.
   * By default, unsubscribes to everything. If `emitter`, `event`, or `cb` is provided,
   * unsubscribe only to those.
   */
  protected _unsubscribe(
    emitter?: object,
    event?: string,
    cb?: (...args: unknown[]) => void,
  ): void {
    // props should only contain defined arguments
    const props = _.pick(
      {
        emitter,
        event,
        cb,
      },
      (v) => !!v,
    );

    const [listenersToRemove, listenersToKeep] = _.partition(
      this._eventListeners,
      props,
    );
    for (const listener of listenersToRemove)
      listener.subscriptionHandler.unsubscribe(
        listener.emitter,
        listener.event,
        listener.boundCb,
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
    reloadMemento?: ReloadMemento,
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
      delete this._deferredOutputSignal;
      return;
    }

    this._lastTickInfo = tickInfo;

    this._onTick();
    this._methodCallInProgress = true;
    this._tickChildChips();
    this._methodCallInProgress = false;
    this._onAfterTick();
  }

  public terminate(outputSignal: Signal = makeSignal()): void {
    // Can't just call super.terminate() here, the order is slightly different

    if (this._state !== "active" && this._state !== "paused")
      throw new Error(`terminate() called from state ${this._state}`);

    if (this._methodCallInProgress) {
      this._deferredOutputSignal = outputSignal;
      return;
    }

    this._state = "inactive";

    // Must terminate children before unsubscribing from event listeners
    this._terminateAllChildChips();
    this._unsubscribe();

    this._outputSignal = outputSignal;
    this._onTerminate();

    this.emit("terminated", this._outputSignal);
  }

  public pause(tickInfo: TickInfo): void {
    super.pause(tickInfo);

    for (const child of Object.values(this._childChips)) {
      child.pause(tickInfo);
    }
  }

  public resume(tickInfo: TickInfo): void {
    super.resume(tickInfo);

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
    options?: Partial<ActivateChildChipOptions>,
  ): Chip;
  /**
   * Activate a child chip
   * @param options The chip and its options
   * @returns The activated chip
   */
  protected _activateChildChip(
    options: Partial<ChipActivationInfo> & { chip: ChipResolvable },
  ): Chip;
  protected _activateChildChip(
    chipOrOptions:
      | ChipResolvable
      | (Partial<ChipActivationInfo> & { chip: ChipResolvable }),
    options?: Partial<ActivateChildChipOptions>,
  ): Chip {
    if (this.state === "inactive") throw new Error("Composite is inactive");

    // Unpack arguments
    let chipResolvable: ChipResolvable;
    if (typeof chipOrOptions !== "undefined") {
      if (typeof chipOrOptions === "function" || isChip(chipOrOptions)) {
        chipResolvable = chipOrOptions;
      } else {
        chipResolvable = chipOrOptions.chip;
        options = chipOrOptions;
      }
    }

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
          }`,
        );

      const existingChip = thisAsAny[options.attribute] as Chip;
      if (existingChip.state !== "inactive")
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
      options.context,
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

    // When the chip is terminated, remove it from the set of children
    this._subscribeOnce(chip, "terminated", (signal: Signal) => {
      delete this._childChips[childId];
      console.assert(!(childId in this._childChips));

      this.emit("terminatedChildChip", chip);
    });

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
          "To include a child chip in the context, provide an attribute name or ID",
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

  /** An alias for calling terminate() on the child chip */
  protected _terminateChildChip(chip: Chip, outputSignal?: Signal): void {
    if (this.state === "inactive") throw new Error("Composite is inactive");

    if (!this._getChildChipId(chip)) throw new Error("Chip is not a child");

    chip.terminate();
  }

  /**
   * Check if child chips are still active, and remove them if not
   * Sends tick to all .
   */
  protected _tickChildChips(): void {
    for (const childChip of Object.values(this._childChips)) {
      if (childChip.state !== "inactive") childChip.tick(this._lastTickInfo);
    }
  }

  /** Terminate all the children, with the provided signal */
  protected _terminateAllChildChips(outputSignal?: Signal) {
    for (const childChip of Object.values(this._childChips)) {
      if (childChip.state === "active" || childChip.state === "paused") {
        childChip.terminate(outputSignal);
      }
    }
  }

  /** Returns the ID of the child chip, or undefined if the chip is not an active child */
  protected _getChildChipId(chip: Chip): string | undefined {
    let childId: string;
    for (const id in this._childChips) {
      if (this._childChips[id] === chip) {
        return id;
      }
    }
    return;
  }

  hasChildChip(chip: Chip) {
    return !!this._getChildChipId(chip);
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
  private _activatedChipCount = 0;

  constructor(
    chipActivationInfos: Array<ChipActivationInfo | ChipResolvable>,
    options?: Partial<ParallelOptions>,
  ) {
    super();

    this._options = fillInOptions(options, new ParallelOptions());
    this._infoToChip = new Map();

    for (const e of chipActivationInfos) this.addChildChip(e);
  }

  /** Add a new chip. If the chip is running, activate it */
  addChildChip(e: ChipActivationInfo | ChipResolvable) {
    const info = isChipResolvable(e) ? { chip: e } : e;
    this._chipActivationInfos.push(info);

    if (this.state !== "inactive") {
      // If no attribute or ID given, make a default one
      const infoWithId =
        info.attribute || info.id
          ? info
          : _.extend({}, info, {
              id: this._activatedChipCount.toString(),
            });

      const chip = this._activateChildChip(info.chip, infoWithId);
      this._infoToChip.set(info, chip);

      this._activatedChipCount++;
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
      const info = this._chipActivationInfos[i];
      // If no attribute or ID given, make a default one
      const infoWithId =
        info.attribute || info.id
          ? info
          : _.extend({}, info, {
              id: this._activatedChipCount.toString(),
            });

      const chip = this._activateChildChip(info.chip, infoWithId);
      this._infoToChip.set(info, chip);

      this._activatedChipCount++;
    }
  }

  _onAfterTick() {
    if (
      Object.keys(this._childChips).length === 0 &&
      this._options.terminateOnCompletion
    )
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

    // Remove chip from _chipActivationInfos
    const activationInfo = this._chipActivationInfos[index];
    this._chipActivationInfos.splice(index, 1);

    if (this.state !== "inactive") {
      const chip = this._infoToChip.get(activationInfo);

      // Remove chip  _infoToChip
      this._infoToChip.delete(activationInfo);

      // Terminate chip
      chip.terminate();
    }
  }

  indexOfChipActivationInfo(chip: ChipActivationInfo | ChipResolvable): number {
    if (isChipResolvable(chip)) {
      return this._chipActivationInfos.findIndex((x) => x.chip === chip);
    } else {
      return this._chipActivationInfos.indexOf(chip);
    }
  }
}

export class ContextProvider extends Composite {
  constructor(
    private readonly _context: Record<string, ChipResolvable>,
    private readonly _child: ChipResolvable,
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
  cancellingSignal?: string | ((signal: Signal) => boolean);
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
    options?: Partial<SequenceOptions>,
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

    if (this._state !== "inactive" && !this._currentChip) {
      // Pick up with the next chip
      this._switchChip();
    }
  }

  /** Skips to the next chip */
  skip() {
    this._advance(makeSignal("skip"));
  }

  private _switchChip(signal?: Signal) {
    // Stop current chip
    if (this._currentChip) {
      // The current chip may have already been terminated, if it terminated before
      if (_.size(this._childChips) > 0)
        this._terminateChildChip(this._currentChip);
      delete this._currentChip;
    }

    if (this._currentChipIndex < this._chipActivationInfos.length) {
      // Copy chip activation info and optionally extend it
      const info = Object.assign(
        {},
        this._chipActivationInfos[this._currentChipIndex],
      );

      if (signal) info.inputSignal = signal;

      // If no attribute or ID given, make a default one
      if (!info.attribute && !info.id) {
        info.id = (this._chipActivationInfos.length - 1).toString();
      }

      this._currentChip = this._activateChildChip(info.chip, info);
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
    if (signal) {
      // Is this a cancelling signal?
      if (this._options.cancellingSignal) {
        let shouldCancel: boolean;
        if (typeof this._options.cancellingSignal === "function") {
          shouldCancel = this._options.cancellingSignal(signal);
        } else {
          shouldCancel = this._options.cancellingSignal === signal.name;
        }

        if (shouldCancel) this.terminate(signal);
        return;
      }

      this._advance(signal);
    }
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
    this._switchChip(signal);

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

export type SignalFunction = (
  context: ChipContext,
  signal: Signal,
) => Signal | string;
export type SignalDescriptor = Signal | SignalFunction;
export type SignalTable = { [name: string]: SignalDescriptor };

export class StateMachineOptions {
  startingState: Signal | string = "start";
  signals: { [n: string]: SignalDescriptor | string };
  endingStates: string[] = ["end"];
}

/**
 * Represents a state machine, where each state has a name, and is represented by an chip.
 * Only one state is active at a time.
 * The state machine has one starting state, but can have multiple ending states.
 * When the machine reaches an ending state, it terminates with a name equal to the name of the ending state.
 * By default, the state machine begins at the state called "start", and stops at "end".
 *
 * When the active state chip terminates, the state machine transitions to another.
 * To determine the next state, it first looks if there is a corresponding entry in the `signals` table, which
 * can be either a state name or a function that takes `(ChipContext, Signal)` and returns a signal.
 * If there is nothing in the signal table for the state, it next looks if the terminating signal is the name of another
 * state, in which case it switches directly to that state,
 *
 * If you want to create embedded signal tables, try the `makeSignalTable()` function.
 */
export class StateMachine extends Composite {
  public readonly options: StateMachineOptions;

  private _states: StateTable = {};
  private _signals: SignalTable = {};
  private _startingState: SignalDescriptor;
  private _visitedStates: Signal[];
  private _activeChildChip: Chip;
  private _lastSignal: Signal;

  constructor(
    states: StateTableDescriptor,
    options?: Partial<StateMachineOptions>,
  ) {
    super();

    // Create state table
    for (const name in states) {
      const state = states[name];
      if (isChipResolvable(state)) {
        this._states[name] = { chip: state };
      } else {
        this._states[name] = state;
      }
    }

    this.options = fillInOptions(options, new StateMachineOptions());

    // Ensure all signals are of the correct type
    if (typeof this.options.startingState === "string")
      this._startingState = makeSignal(this.options.startingState);
    else this._startingState = this.options.startingState;

    for (const key in this.options.signals) {
      const value = this.options.signals[key];
      if (typeof value === "string") {
        this._signals[key] = makeSignal(value);
      } else {
        this._signals[key] = value;
      }
    }
  }

  activate(
    tickInfo: TickInfo,
    chipContext: ChipContext,
    inputSignal?: Signal,
    reloadMemento?: ReloadMemento,
  ) {
    super.activate(tickInfo, chipContext, inputSignal, reloadMemento);

    this._visitedStates = [];

    if (this._reloadMemento) {
      this._visitedStates = this._reloadMemento.data.visitedStates as Signal[];
      this._changeState(_.last(this._visitedStates));
    } else {
      const startingState = _.isFunction(this._startingState)
        ? this._startingState(chipContext, makeSignal())
        : this._startingState;
      this._changeState(resolveSignal(startingState));
    }
  }

  _onAfterTick() {
    if (!this._activeChildChip) return;

    const signal = this._activeChildChip.outputSignal;
    if (signal) {
      let nextStateDescriptor: Signal;
      // The signal could directly be the name of another state, or ending state
      if (!(this._lastSignal.name in this._signals)) {
        if (
          signal.name in this._states ||
          _.contains(this.options.endingStates, signal.name)
        ) {
          nextStateDescriptor = signal;
        } else {
          throw new Error(`Cannot find signal for state '${signal.name}'`);
        }
      } else {
        const signalDescriptor: SignalDescriptor =
          this._signals[this._lastSignal.name];
        if (_.isFunction(signalDescriptor)) {
          nextStateDescriptor = resolveSignal(
            signalDescriptor(this._chipContext, signal),
          );
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
    delete this._activeChildChip;
    delete this._lastSignal;
  }

  protected _makeReloadMementoData(): ReloadMementoData {
    return {
      visitedStates: this._visitedStates,
    };
  }

  /** Switch directly to a new state, terminating the current one */
  changeState(nextState: string | Signal): void {
    if (typeof nextState === "string") {
      nextState = makeSignal(nextState);
    }

    this._changeState(nextState);
  }

  private _changeState(nextState: Signal): void {
    // Stop current state
    if (this._activeChildChip) {
      // The state may have already been terminated, if terminated
      if (_.size(this._childChips) > 0)
        this._terminateChildChip(this._activeChildChip);
      delete this._activeChildChip;
    }

    // If reached an ending state, stop here.
    if (_.contains(this.options.endingStates, nextState.name)) {
      this._lastSignal = nextState;
      this._visitedStates.push(nextState);

      // Terminate with signal
      this.terminate(nextState);
      return;
    }

    if (nextState.name in this._states) {
      const nextStateContext = this._states[nextState.name];
      this._activeChildChip = this._activateChildChip(nextStateContext.chip, {
        context: nextStateContext.context,
        inputSignal: nextState,
        id: nextState.name,
      });
    } else {
      throw new Error(`Cannot find state '${nextState.name}'`);
    }

    const previousSignal = this._lastSignal;
    this._lastSignal = nextState;

    this._visitedStates.push(nextState);

    this.emit("stateChange", previousSignal, nextState);
  }

  /** The last signal used by the machine. If the machine is running, this describes the current state */
  get lastSignal() {
    return this._lastSignal;
  }

  /** An array of all the signals the machine has gone through, in order. It may contain duplicates */
  get visitedStates() {
    return this._visitedStates;
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
  const f = function (context: ChipContext, signal: Signal): Signal {
    if (signal.name in table) {
      const signalResolvable = table[signal.name];
      if (_.isFunction(signalResolvable)) {
        return resolveSignal(signalResolvable(context, signal));
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
  constructor(
    public f: (arg: unknown) => unknown,
    public that?: unknown,
  ) {
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
    public handler: (...args: unknown[]) => Signal | boolean = _.constant(true),
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

  private _aChildTerminated: boolean;

  // signal defaults to the string version of the index in the array (to avoid problem of 0 being considered as falsy)
  constructor(
    chipActivationInfos: Array<ChipResolvable | AlternativeChipActivationInfo>,
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
    this._aChildTerminated = false;

    for (let i = 0; i < this._chipActivationInfos.length; i++) {
      const chipActivationInfo = this._chipActivationInfos[i];

      this._subscribe(chipActivationInfo.chip, "terminated", () =>
        this._onChildTerminated(i),
      );
      this._activateChildChip(chipActivationInfo.chip, {
        context: chipActivationInfo.context,
      });
    }
  }

  private _onChildTerminated(index: number) {
    if (this._aChildTerminated) return;

    this._aChildTerminated = true;

    const terminateWith =
      this._chipActivationInfos[index].signal ?? makeSignal(index.toString());
    this.terminate(terminateWith);
  }
}
