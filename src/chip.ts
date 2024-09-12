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

export function isSignal(value: object): value is Signal {
  return typeof value === "object" && "name" in value;
}

export type SignalResolvable = Signal | SignalParams | string;

export function makeSignal(
  name = "default",
  params: SignalParams = {}
): Signal {
  return { name, params };
}

export function resolveSignal(value?: SignalResolvable): Signal {
  if (typeof value === "undefined" || typeof value === "string")
    return makeSignal(value);
  if (isSignal(value)) return value;

  // interpret value as params
  return makeSignal("default", value);
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

export type ChipState =
  | "inactive"
  | "activating"
  | "active"
  | "paused"
  | "requestedTermination"
  | "terminating";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isChip(e: any): e is Chip {
  return (
    typeof e.activate === "function" &&
    typeof e.tick === "function" &&
    typeof e.terminate === "function"
  );
}

export function isChipResolvable(
  e: ChipResolvable | ActivateChildChipOptions
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
  readonly chipState: ChipState;

  /** Once the chip is terminated, contains the signal */
  readonly outputSignal: Signal;

  /** Children of this chip, if any */
  readonly children: Record<string, Chip>;

  /** Modifications to the context */
  readonly contextModification: ChipContextResolvable | undefined;

  /** Activate the chip, with a provided context and input signal.
   * Should only be called from an inactive state.
   * Should only be called by the parent in the chip hierarchy, or a Runner
   **/
  activate(
    tickInfo: TickInfo,
    chipContext: ChipContext,
    inputSignal: Signal,
    reloadMemento?: ReloadMemento
  ): void;

  /** Update the chip, provided a new time */
  tick(tickInfo: TickInfo): void;

  /** Terminate the chip. Should only be called from an active or paused state
   * Should only be called by the parent in the chip hierarchy, or a Runner
   */
  terminate(tickInfo: TickInfo, outputSignal?: Signal): void;

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
  protected _chipState: ChipState = "inactive";

  get chipContext(): ChipContext {
    return this._chipContext;
  }

  public activate(
    tickInfo: TickInfo,
    chipContext: ChipContext,
    inputSignal: Signal,
    reloadMemento?: ReloadMemento
  ): void {
    if (this._chipState !== "inactive")
      throw new Error(`activate() called from state ${this._chipState}`);

    this._chipContext = chipContext;
    this._lastTickInfo = tickInfo;
    this._inputSignal = inputSignal;
    this._chipState = "active";
    delete this._outputSignal;

    if (reloadMemento && reloadMemento.className === this.constructor.name)
      this._reloadMemento = reloadMemento;
    else delete this._reloadMemento;

    this._onActivate();

    this.emit("activated", inputSignal);
  }

  public tick(tickInfo: TickInfo): void {
    if (this.isInChipState("paused", "requestedTermination")) return;
    if (!this.isInChipState("active"))
      throw new Error(`tick() called from state ${this._chipState}`);

    this._lastTickInfo = tickInfo;
    this._onTick();
  }

  public terminate(
    tickInfo: TickInfo,
    outputSignal: Signal = makeSignal()
  ): void {
    if (!this.isInChipState("active", "paused", "requestedTermination"))
      throw new Error(`terminate() called from state ${this._chipState}`);

    this._lastTickInfo = tickInfo;
    if (!this._outputSignal) {
      this._outputSignal = outputSignal;
    }

    this._chipState = "terminating";

    this._onTerminate();

    this._unsubscribe(); // Remove all event listeners

    this._chipState = "inactive";
    this.emit("terminated", this._outputSignal);
  }

  protected _terminateSelf(signal?: SignalResolvable) {
    if (this._chipState !== "active" && this._chipState !== "paused") {
      console.warn(
        `_terminateSelf() called from state ${this._chipState}. Ignoring...`
      );
      return;
    }

    this._outputSignal = resolveSignal(signal);
    this._chipState = "requestedTermination";
  }

  public pause(tickInfo: TickInfo): void {
    if (this._chipState !== "active")
      throw new Error(`pause() called from state ${this._chipState}`);

    this._chipState = "paused";

    this._onPause();
  }

  public resume(tickInfo: TickInfo): void {
    if (this._chipState !== "paused")
      throw new Error(`resume() called from state ${this._chipState}`);

    this._chipState = "active";

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
        listener.boundCb
      );

    this._eventListeners = listenersToKeep;
  }

  public get children(): Record<string, Chip> {
    return {};
  }

  public get outputSignal(): Signal {
    return this._outputSignal;
  }

  public get chipState(): ChipState {
    return this._chipState;
  }

  public makeReloadMemento(): ReloadMemento {
    if (this._chipState !== "active" && this._chipState !== "paused")
      throw new Error(
        `makeReloadMemento() called from state ${this._chipState}`
      );

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

  /** Shortcut for checking if the state of the chip is correct */
  isInChipState(...states: ChipState[]): boolean {
    return states.includes(this._chipState);
  }

  /**
   * Template getter for the chip context provided to children.
   * Overload to add extra attributes to the context.
   */
  get contextModification(): ChipContextResolvable {
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
    this._terminateSelf(this.terminateSignal);
  }
}

/** Options that can be passed to Composite._activateChildChip() */
export class ActivateChildChipOptions {
  chip: ChipResolvable;

  /** Additional context or function to return a context */
  context?: ChipContextResolvable;

  /** An input signal given to the chip */
  inputSignal?: SignalResolvable;

  /**
   * If provided, will store the chip using this attribute name.
   * If the name ends with `[]` or if the attribute is an array,
   * adds the chip to the array attribute of that name.
   */
  attribute?: string;

  /**
   * If true, adds the child chip to the context provided to children,
   * using the provided `attribute` or `id`.
   */
  includeInChildContext?: boolean;

  /**
   * If true, adds the child chip's `contextModification` to the context
   * provided to children.
   */
  extendChildContext?: boolean;

  id?: string;
  reloadMemento?: ReloadMemento;
}

/** What a composite stores about an activated chip */
export class CompositeChildChipInfo {
  chip: Chip;
  context: ChipContext;
  inputSignal: Signal;
  attribute?: string;
  includeInChildContext: boolean;
  extendChildContext: boolean;
  id: string;
  reloadMemento?: ReloadMemento;
}

/**
 * Base class for chips that contain other chips
 *
 * Events:
 * - activatedChildChip(chip: CompositeChildChipInfo)
 * - terminatedChildChip(chip: CompositeChildChipInfo, outputSignal: Signal)
 */
export abstract class Composite extends ChipBase {
  protected _childChipInfos: Record<string, CompositeChildChipInfo>;

  /** Context provided to the next activated child chip */
  private _childChipContext: Record<string, unknown>;

  public activate(
    tickInfo: TickInfo,
    chipContext: ChipContext,
    inputSignal: Signal,
    reloadMemento?: ReloadMemento
  ): void {
    this._childChipInfos = {};
    this._childChipContext = {};

    super.activate(tickInfo, chipContext, inputSignal, reloadMemento);
  }

  /**
   * By default, updates all child chips and remove those that have a signal
   * Overload this method in subclasses to change the behavior
   */
  public tick(tickInfo: TickInfo): void {
    super.tick(tickInfo);

    this._tickChildChips();
    this._onAfterTick();
  }

  public terminate(tickInfo: TickInfo, outputSignal?: SignalResolvable): void {
    // Can't just call super.terminate() here, the order is slightly different

    if (!this.isInChipState("active", "paused", "requestedTermination"))
      throw new Error(`terminate() called from state ${this._chipState}`);

    this._chipState = "terminating";

    // Must terminate children before unsubscribing from event listeners
    this._terminateAllChildChips();
    this._unsubscribe();

    if (!this._outputSignal) {
      this._outputSignal = resolveSignal(outputSignal);
    }
    this._onTerminate();

    this._chipState = "inactive";
    this.emit("terminated", this._outputSignal);
  }

  public pause(tickInfo: TickInfo): void {
    super.pause(tickInfo);

    this._terminateRequestedChildChips();

    // Tell child chips to pause
    for (const childChipInfo of Object.values(this._childChipInfos)) {
      childChipInfo.chip.pause(tickInfo);
    }

    this._onAfterPause();
  }

  public resume(tickInfo: TickInfo): void {
    super.resume(tickInfo);

    this._terminateRequestedChildChips();

    for (const childChipInfo of Object.values(this._childChipInfos)) {
      childChipInfo.chip.resume(tickInfo);
    }

    this._onAfterResume();
  }

  public get children(): Record<string, Chip> {
    return _.mapObject(this._childChipInfos, (info) => info.chip);
  }

  /**
   * Activate a child chip
   * @param chipResolvable A chip or function to create a chip
   * @param options
   * @returns The activated chip
   */
  protected _activateChildChip(
    chipResolvable: ChipResolvable,
    options?: Omit<ActivateChildChipOptions, "chip">
  ): CompositeChildChipInfo;
  /**
   * Activate a child chip
   * @param options The chip and its options
   * @returns The activated chip
   */
  protected _activateChildChip(
    options: ActivateChildChipOptions
  ): CompositeChildChipInfo;
  protected _activateChildChip(
    chipOrOptions: ChipResolvable | ActivateChildChipOptions,
    options?: Omit<ActivateChildChipOptions, "chip">
  ): CompositeChildChipInfo {
    if (this.chipState !== "active") throw new Error("Composite is not active");

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
          }`
        );

      const existingChip = thisAsAny[options.attribute] as Chip;
      if (existingChip.chipState !== "inactive")
        this._terminateChildChip(thisAsAny[options.attribute] as Chip);
    }

    let providedId = options.id ?? options.attribute;
    if (providedId) {
      if (providedId.endsWith("[]")) {
        providedId = _.uniqueId(providedId);
      }
      if (providedId in this._childChipInfos)
        throw new Error("Duplicate child chip ID provided");
    }

    // Build up this object over time
    // @ts-ignore
    const childChipInfo: CompositeChildChipInfo = {};

    childChipInfo.inputSignal = resolveSignal(options.inputSignal);

    {
      const childContextExtensions = Object.values(this._childChipInfos).map(
        (childChipInfo) =>
          childChipInfo.extendChildContext &&
          childChipInfo.chip.contextModification
      );
      childChipInfo.context = processChipContext(
        this._chipContext,
        this._childChipContext,
        ...childContextExtensions,
        this.contextModification,
        options.context
      );
    }

    if (_.isFunction(chipResolvable)) {
      childChipInfo.chip = chipResolvable(
        childChipInfo.context,
        childChipInfo.inputSignal
      );
    } else {
      childChipInfo.chip = chipResolvable;
    }

    // If no chip is returned, then nothing more to do
    if (!childChipInfo.chip) return;

    // Look for reload memento, if an id is provided
    if (providedId && this._reloadMemento?.children[providedId]) {
      childChipInfo.reloadMemento = this._reloadMemento.children[providedId];
    }

    // If no childId is provided, use a random temporary value
    childChipInfo.id =
      providedId ?? `unknown_${_.random(Number.MAX_SAFE_INTEGER)}`;

    if (options.attribute) {
      childChipInfo.attribute = options.attribute;

      let attributeName = options.attribute;
      // If the attribute name has an array syntax, add to the array
      if (options.attribute.endsWith("[]")) {
        // Take off the last 2 characters
        attributeName = attributeName.slice(0, attributeName.length - 2);
        let attributeAsArray = this[attributeName as keyof this] as Array<Chip>;
        if (typeof attributeAsArray !== "undefined") {
          // Add to array
          attributeAsArray.push(childChipInfo.chip);
        } else {
          // Create a new array
          attributeAsArray = [childChipInfo.chip];
          // @ts-ignore
          this[attributeName] = attributeAsArray;
        }
      } else {
        // @ts-ignore
        this[attributeName] = childChipInfo.chip;
      }
    }

    childChipInfo.includeInChildContext = !!options.includeInChildContext;
    if (childChipInfo.includeInChildContext) {
      if (!providedId)
        throw new Error(
          "To include a child chip in the context, provide an attribute name or ID"
        );

      this._childChipContext[providedId] = childChipInfo.chip;
    }

    childChipInfo.extendChildContext = !!options.extendChildContext;

    this._childChipInfos[childChipInfo.id] = childChipInfo;

    childChipInfo.chip.activate(
      this._lastTickInfo,
      childChipInfo.context,
      childChipInfo.inputSignal,
      childChipInfo.reloadMemento
    );

    this.emit("activatedChildChip", childChipInfo);

    return childChipInfo;
  }

  /** Terminate the child with the given signal */
  protected _terminateChildChip(
    chipOrId: Chip | string,
    outputSignal?: SignalResolvable
  ): void {
    if (this.chipState === "inactive") throw new Error("Composite is inactive");

    let childChipInfo: CompositeChildChipInfo;
    if (typeof chipOrId === "string") {
      childChipInfo = this.getChildChipInfo(chipOrId);
    } else {
      const childChipId = this.getChildChipId(chipOrId);
      childChipInfo = this.getChildChipInfo(childChipId);
    }

    if (!childChipInfo) throw new Error(`Chip is not a child: "${chipOrId}"`);

    childChipInfo.chip.terminate(
      this._lastTickInfo,
      resolveSignal(outputSignal)
    );
    delete this._childChipInfos[childChipInfo.id];

    // Remove the attribute, if it exists
    if (childChipInfo.attribute) {
      if (childChipInfo.attribute.endsWith("[]")) {
        const attributeAsArray = this[
          childChipInfo.attribute as keyof this
        ] as Array<Chip>;
        const index = attributeAsArray.indexOf(childChipInfo.chip);
        attributeAsArray.splice(index, 1);
      } else {
        delete this[childChipInfo.attribute as keyof this];
      }
    }

    // Remove from the child chip context, if asked for
    if (childChipInfo.includeInChildContext) {
      delete this._childChipContext[childChipInfo.id];
    }

    this.emit(
      "terminatedChildChip",
      childChipInfo,
      childChipInfo.chip.outputSignal
    );
  }

  /**
   * Check if child chips are still active, and remove them if not
   * Sends tick to all.
   */
  protected _tickChildChips(): void {
    for (const [childId, childChipInfo] of Object.entries(
      this._childChipInfos
    )) {
      if (childChipInfo.chip.chipState === "requestedTermination") {
        this._terminateChildChip(childId);
      } else if (childChipInfo.chip.chipState === "active") {
        childChipInfo.chip.tick(this._lastTickInfo);
      }
    }
  }

  /** Terminate all the children, with the provided signal */
  protected _terminateAllChildChips(outputSignal?: Signal) {
    for (const childChipInfo of Object.values(this._childChipInfos)) {
      if (
        childChipInfo.chip.chipState === "active" ||
        childChipInfo.chip.chipState === "paused"
      ) {
        this._terminateChildChip(childChipInfo.id, outputSignal);
      }
    }
  }

  /** Returns the ID of the child chip, or undefined if the chip is not an active child */
  getChildChipId(chip: Chip): string | undefined {
    let childId: string;
    for (const id in this._childChipInfos) {
      if (this._childChipInfos[id].chip === chip) {
        return id;
      }
    }
  }

  getChildChipInfo(id: string): CompositeChildChipInfo | undefined {
    return this._childChipInfos[id];
  }

  hasChildChip(chip: Chip) {
    return !!this.getChildChipId(chip);
  }

  /** Template method called after children are ticked */
  protected _onAfterTick(): void {
    /* no op */
  }

  /** Template method called after children are paused */
  protected _onAfterPause(): void {
    /* no op */
  }

  /** Template method called after children are resumed */
  protected _onAfterResume(): void {
    /* no op */
  }

  /** Terminate any child chips that requested it */
  protected _terminateRequestedChildChips() {
    for (const [childId, childChipInfo] of Object.entries(
      this._childChipInfos
    )) {
      if (childChipInfo.chip.chipState === "requestedTermination") {
        this._terminateChildChip(childId);
      }
    }
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

  private _childChipOptions: ActivateChildChipOptions[] = [];
  private _infoToChip = new Map<ActivateChildChipOptions, Chip>();
  private _activatedChipCount = 0;

  constructor(
    childChipOptions: Array<ActivateChildChipOptions | ChipResolvable>,
    options?: Partial<ParallelOptions>
  ) {
    super();

    this._options = fillInOptions(options, new ParallelOptions());
    this._infoToChip = new Map();

    for (const e of childChipOptions) this.addChildChip(e);
  }

  /** Add a new chip. If the chip is running, activate it */
  addChildChip(e: ActivateChildChipOptions | ChipResolvable) {
    const info = isChipResolvable(e) ? { chip: e } : e;
    this._childChipOptions.push(info);

    if (this.chipState !== "inactive") {
      // If no attribute or ID given, make a default one
      const infoWithId =
        info.attribute || info.id
          ? info
          : _.extend({}, info, {
              id: this._activatedChipCount.toString(),
            });

      const childChipInfo = this._activateChildChip(infoWithId);
      this._infoToChip.set(info, childChipInfo.chip);

      this._activatedChipCount++;
    }
  }

  _onActivate() {
    if (this._childChipOptions.length === 0) {
      // Empty set, stop immediately
      if (this._options.terminateOnCompletion) this._terminateSelf();
      return;
    }

    // Activate all provided chips
    for (let i = 0; i < this._childChipOptions.length; i++) {
      const info = this._childChipOptions[i];
      // If no attribute or ID given, make a default one
      const infoWithId =
        info.attribute || info.id
          ? info
          : _.extend({}, info, {
              id: this._activatedChipCount.toString(),
            });

      const chipInfo = this._activateChildChip(infoWithId);
      this._infoToChip.set(info, chipInfo.chip);

      this._activatedChipCount++;
    }
  }

  _onAfterTick() {
    if (
      Object.keys(this._childChipInfos).length === 0 &&
      this._options.terminateOnCompletion
    )
      this._terminateSelf();
  }

  /**
   * Remove the child chip, by value or index.
   * If the chip is running, terminate it
   */
  removeChildChip(e: ActivateChildChipOptions | ChipResolvable | number): void {
    let index: number;
    if (typeof e === "number") {
      index = e;
      if (index < 0 || index >= this._childChipOptions.length)
        throw new Error("Invalid index of chip to remove");
    } else {
      index = this.indexOfChipActivationInfo(e);
      if (index === -1) throw new Error("Cannot find chip to remove");
    }

    // Remove chip from _childChipOptions
    const activationInfo = this._childChipOptions[index];
    this._childChipOptions.splice(index, 1);

    if (this.chipState !== "inactive") {
      const chip = this._infoToChip.get(activationInfo);

      // Remove chip  _infoToChip
      this._infoToChip.delete(activationInfo);

      // Terminate chip
      this._terminateChildChip(chip);
    }
  }

  indexOfChipActivationInfo(
    chip: ActivateChildChipOptions | ChipResolvable
  ): number {
    if (isChipResolvable(chip)) {
      return this._childChipOptions.findIndex((x) => x.chip === chip);
    } else {
      return this._childChipOptions.indexOf(chip);
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
  cancellingSignal?: string | ((signal: Signal) => boolean);
}

/**
  Runs one child chip after another. 
  When done, terminates with output signal of the last chip in the sequence.
  Optionally can loop back to the first chip.
*/
export class Sequence extends Composite {
  private readonly _options: SequenceOptions;

  private _childChipOptions: ActivateChildChipOptions[] = [];
  private _currentChipIndex = 0;
  private _currentChip: Chip;

  constructor(
    childChipOptions: Array<ActivateChildChipOptions | ChipResolvable>,
    options?: Partial<SequenceOptions>
  ) {
    super();

    this._options = fillInOptions(options, new SequenceOptions());

    for (const e of childChipOptions) this.addChildChip(e);
  }

  /** Add a new chip to the sequence */
  addChildChip(chip: ActivateChildChipOptions | ChipResolvable) {
    if (isChipResolvable(chip)) {
      this._childChipOptions.push({ chip: chip });
    } else {
      this._childChipOptions.push(chip);
    }

    if (this._chipState !== "inactive" && !this._currentChip) {
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
      // Terminate the current chip, if its still active
      if (this._currentChip.chipState !== "inactive") {
        this._terminateChildChip(this._currentChip);
      }

      delete this._currentChip;
    }

    if (this._currentChipIndex < this._childChipOptions.length) {
      // Copy chip activation info and optionally extend it
      const info = Object.assign(
        {},
        this._childChipOptions[this._currentChipIndex]
      );

      if (signal) info.inputSignal = signal;

      // If no attribute or ID given, make a default one
      if (!info.attribute && !info.id) {
        info.id = (this._childChipOptions.length - 1).toString();
      }

      this._currentChip = this._activateChildChip(info.chip, info).chip;
    }
  }

  _onActivate() {
    this._currentChipIndex =
      (this._reloadMemento?.data.currentChipIndex as number) ?? 0;
    delete this._currentChip;

    if (this._childChipOptions.length === 0) {
      // Empty sequence, stop immediately
      if (this._options.terminateOnCompletion) this._terminateSelf();
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

        if (shouldCancel) this._terminateSelf(signal);
        return;
      }

      this._advance(signal);
    }
  }

  protected _onAfterResume(): void {
    // If the current chip was terminated, advance to the next chip
    if (!this._currentChip || this._currentChip.chipState !== "inactive")
      return;

    this._advance(this._currentChip.outputSignal);
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
    if (this._currentChipIndex >= this._childChipOptions.length) {
      if (this._options.loop) {
        // ... and we loop, go back to start
        this._currentChipIndex = 0;
        this._switchChip();
      } else if (this._options.terminateOnCompletion) {
        // otherwise terminate
        this._terminateSelf(signal);
      }
    }
  }

  protected _makeReloadMementoData(): ReloadMementoData {
    return {
      currentChipIndex: this._currentChipIndex,
    };
  }
}

export type StateTable = { [n: string]: ActivateChildChipOptions };
export type StateTableDescriptor = {
  [n: string]: ActivateChildChipOptions | ChipResolvable;
};

export type SignalFunction = (
  context: ChipContext,
  signal: Signal
) => Signal | string;
export type SignalDescriptor = Signal | SignalFunction;
export type SignalTable = { [name: string]: SignalDescriptor };

export class StateMachineOptions {
  startingState: Signal | string = "start";
  transitions: { [n: string]: SignalDescriptor | string };
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
  private _transitions: SignalTable = {};
  private _startingState: SignalDescriptor;
  private _visitedStates: Signal[];
  private _activeChildChip: Chip;
  private _lastSignal: Signal;

  constructor(
    states: StateTableDescriptor,
    options?: Partial<StateMachineOptions>
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

    for (const key in this.options.transitions) {
      const value = this.options.transitions[key];
      if (typeof value === "string") {
        this._transitions[key] = makeSignal(value);
      } else {
        this._transitions[key] = value;
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
      if (!(this._lastSignal.name in this._transitions)) {
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
          this._transitions[this._lastSignal.name];
        if (_.isFunction(signalDescriptor)) {
          nextStateDescriptor = resolveSignal(
            signalDescriptor(this._chipContext, signal)
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
      if (_.size(this._childChipInfos) > 0)
        this._terminateChildChip(this._activeChildChip);
      delete this._activeChildChip;
    }

    // If reached an ending state, stop here.
    if (_.contains(this.options.endingStates, nextState.name)) {
      this._lastSignal = nextState;
      this._visitedStates.push(nextState);

      // Terminate with signal
      this._terminateSelf(nextState);
      return;
    }

    if (nextState.name in this._states) {
      const nextStateContext = this._states[nextState.name];
      this._activeChildChip = this._activateChildChip(nextStateContext.chip, {
        context: nextStateContext.context,
        inputSignal: nextState,
        id: nextState.name,
      }).chip;
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
  Creates a transition table for use with StateMachine.
  Example: 
    const signals = {
      start: chip.makeTransitionTable({ 
        win: "end",
        lose: "start",
      }),
    };
    `
*/
export function makeTransitionTable(table: {
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
      if (typeof result === "boolean") {
        this._terminateSelf();
      } else {
        this._terminateSelf(result);
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

    if (typeof result === "string") this._terminateSelf(makeSignal(result));
    else if (typeof result === "object") this._terminateSelf(result);
    else this._terminateSelf();
  }
}

/**
 * Measures the time passed in play.
 * Resets on each activation.
 */
export class MeasureTime extends ChipBase {
  private _timePassed: number;

  _onActivate() {
    this._timePassed = 0;
  }

  _onTick() {
    this._timePassed += this._lastTickInfo.timeSinceLastTick;
  }

  get timePassed() {
    return this._timePassed;
  }

  reset() {
    this._timePassed = 0;
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
      this._terminateSelf();
    }
  }
}

/**
 * Does not terminate until done() is called with a given signal
 */
export class Block extends ChipBase {
  done(signal = makeSignal()) {
    this._terminateSelf(signal);
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
      this._terminateSelf(result);
    } else {
      // result is true
      this._terminateSelf();
    }
  }
}

export interface AlternativeActivateChildChipOptions
  extends ActivateChildChipOptions {
  outputSignal?: Signal;
}

/**
 *  Chip that requests a signal as soon as one of it's children requests one.
 *  If an `outputSignal` is specified for that child, it will be output.
 *  Otherwise the output signal of the chip will be used
 */
export class Alternative extends Composite {
  private readonly _childChipOptions: AlternativeActivateChildChipOptions[];

  private _aChildTerminated: boolean;

  constructor(
    childChipOptions: Array<
      ChipResolvable | AlternativeActivateChildChipOptions
    >
  ) {
    super();

    this._childChipOptions = childChipOptions.map((info) => {
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

    for (let i = 0; i < this._childChipOptions.length; i++) {
      const childChipOption = this._childChipOptions[i];

      const childChipInfo = this._activateChildChip(childChipOption);
      this._subscribe(
        this,
        "terminatedChildChip",
        (chipInfo: CompositeChildChipInfo, outputSignal) => {
          if (childChipInfo !== chipInfo) return;

          this._onChildTerminated(i, outputSignal);
        }
      );
    }
  }

  private _onChildTerminated(index: number, outputSignal: Signal) {
    if (this._aChildTerminated) return;

    this._aChildTerminated = true;

    const terminateWith =
      this._childChipOptions[index].outputSignal ?? outputSignal;
    this._terminateSelf(terminateWith);
  }
}
