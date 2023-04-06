import { EventEmitter } from "eventemitter3";
import * as _ from "underscore";

/**
 * Fills in the mising options from the provided defaults
 * @param options Options provided by the caller
 * @param defaults Defaults provided by the author
 */
// @es-li
export function fillInOptions<T>(options: Partial<T>, defaults: T): T {
  if (options) return { ...defaults, ...options };
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

export interface Signal {
  readonly name: string;
  readonly params: Record<string, unknown>;
}

export function makeSignal(name = "default", params = {}): Signal {
  return { name, params };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChipContext = Readonly<Record<string, any>>;

export type ChipContextFactory = (context: ChipContext) => ChipContext;
export type ChipContextResolvable = ChipContext | ChipContextFactory;

export function processChipContext(
  chipContext: ChipContext,
  ...alteredContexts: Array<ChipContextResolvable>
): ChipContext {
  // if (!alteredContext) return chipContext;
  let context = chipContext;
  for (const alteredContext of alteredContexts) {
    if (!alteredContext) continue;

    if (typeof alteredContext == "function") context = alteredContext(context);
    else context = Object.assign({}, context, alteredContext);
  }

  return context;
}

export function extendContext(
  values: ChipContext
): (chipContext: ChipContext) => ChipContext {
  return (chipContext) => _.extend({}, chipContext, values);
}

export interface TickInfo {
  timeSinceLastTick: number;
}

export type ChipFactory = (signal: Signal) => Chip;

export type ChipResolvable = Chip | ChipFactory;

export interface ChipActivationInfo {
  chip: ChipResolvable;
  context?: ChipContextResolvable;
  id?: string;
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
 * which both implement this interface and do the busywork for you.
 **/
export interface Chip extends NodeEventSource {
  readonly state: ChipState;
  readonly outputSignal: Signal;
  readonly children: Record<string, Chip>;

  activate(
    tickInfo: TickInfo,
    chipContext: ChipContext,
    inputSignal: Signal,
    reloadMemento?: ReloadMemento
  ): void;
  tick(tickInfo: TickInfo): void;
  terminate(outputSignal?: Signal): void;
  pause(tickInfo: TickInfo): void;
  resume(tickInfo: TickInfo): void;
  makeReloadMemento(): ReloadMemento;
}

/**
 * In Booyah, the game is structured as a tree of chips. This is the base class for all chips.
 * An chip has the following lifecycle:
 * 1. It is instantiated using the contructor
 * Only parameters specific to the chip should be passed here.
 * The chip should not make any changes to the environment here, it should wait for activate().
 * 2. activate() is called just once, with a configuration.
 * This is when the chip should add display objects to the scene, or subscribe to events.
 * 3. tick() is called one or more times, with options.
 * It could also never be called, in case the chip is terminated directly.
 * 4. pause() and resume() might be called.
 * 5. terminate() is called just once.
 * The chip should remove any changes it made, such as adding display objects to the scene, or subscribing to events.
 * The base class will check that this lifecyle is respected, and will log errors to signal any problems.
 * In general, subclasses do not need to override these methods, but instead override the underscore versions of them: _onActivate(), _onTick(), etc.
 * This ensures that the base class behavior of will be called automatically.
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

  // if `cb` is undefined, will remove all event listeners for the given emitter and event
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

  protected _onActivate() {
    /* no op */
  }
  protected _onTick() {
    /* no op */
  }
  protected _onTerminate() {
    /* no op */
  }
  protected _onPause() {
    /* no op */
  }
  protected _onResume() {
    /* no op */
  }

  /** By default, an chip be automatically reloaded */
  protected _makeReloadMementoData(): ReloadMementoData {
    return undefined;
  }
}

/** Empty class just to indicate an chip that does nothing and never terminates  */
export class Forever extends ChipBase {}

/** An chip that outputs a given signal immediately  */
export class Transitory extends ChipBase {
  constructor(public readonly terminateSignal = makeSignal()) {
    super();
  }

  _onActivate() {
    this.terminate(this.terminateSignal);
  }
}

export class ActivateChildChipOptions {
  context?: ChipContextResolvable;
  inputSignal?: Signal;
  attribute?: string;
  id?: string;
  reloadMemento?: ReloadMemento;
  includeInChildContext?: boolean;
}

/** Base class for chips that contain other chips
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

    let chip: Chip;
    if (_.isFunction(chipResolvable)) {
      chip = chipResolvable(inputSignal);
    } else {
      chip = chipResolvable;
    }

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

    const childConfig = processChipContext(
      this._chipContext,
      this._childChipContext,
      this.defaultChildChipContext,
      options.context
    );
    chip.activate(this._lastTickInfo, childConfig, inputSignal, reloadMemento);

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

    this.emit("activatedChildChip", chip, childConfig, inputSignal);

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

  protected _terminateAllChildChips(outputSignal?: Signal) {
    for (const childChip of Object.values(this._childChips)) {
      if (childChip.state === "active" || childChip.state === "paused") {
        childChip.terminate(outputSignal);
      }

      this.emit("terminatedChildChip", childChip);
    }

    this._childChips = {};
  }

  protected _removeTerminatedChildChips(): void {
    for (const id in this._childChips) {
      const childChip = this._childChips[id];

      if (childChip.state === "inactive") {
        delete this._childChips[id];
        this.emit("terminatedChildChip", childChip);
      }
    }
  }

  get defaultChildChipContext(): ChipContextResolvable {
    return undefined;
  }

  protected _onAfterTick(): void {
    /* no op */
  }
}

export class ParallelOptions {
  signalOnCompletion = true;
}

export interface ParallelActivationInfo extends ChipActivationInfo {
  activated?: boolean;
}

/**
 Allows a bunch of chips to execute in parallel.
 Updates child chips until they terminate.
 Terminates when all child chips have completed.
*/
export class Parallel extends Composite {
  public readonly options: ParallelOptions;

  protected childChipActivationInfos: ParallelActivationInfo[] = [];
  protected contextToChip = new Map<ParallelActivationInfo, Chip>();

  constructor(
    chipActivationInfos: Array<ChipResolvable | ParallelActivationInfo> = [],
    options?: Partial<ParallelOptions>
  ) {
    super();

    this.options = fillInOptions(options, new ParallelOptions());

    for (const e of chipActivationInfos) this.addChildChip(e);
  }

  activate(
    tickInfo: TickInfo,
    chipContext: ChipContext,
    inputSignal?: Signal,
    reloadMemento?: ReloadMemento
  ) {
    super.activate(tickInfo, chipContext, inputSignal, reloadMemento);

    for (const chipActivationInfo of this.childChipActivationInfos) {
      if (chipActivationInfo.activated)
        this.activateChildChip(chipActivationInfo);
    }
  }

  tick(tickInfo: TickInfo) {
    super.tick(tickInfo);

    if (this.options.signalOnCompletion && !_.some(this._childChips))
      this.terminate(makeSignal());
  }

  addChildChip(chip: ParallelActivationInfo | ChipResolvable) {
    const index = this.indexOfChildChipActivationInfo(chip);
    if (index !== -1) throw new Error("Chip context already added");

    let chipActivationInfo: ParallelActivationInfo;
    if (isChipResolvable(chip)) {
      chipActivationInfo = { chip, activated: true };
    } else {
      chipActivationInfo = chip;
    }

    this.childChipActivationInfos.push(chipActivationInfo);

    // Automatically activate the child chip
    if (this.state !== "inactive" && chipActivationInfo.activated) {
      const chip = this._activateChildChip(chipActivationInfo.chip, {
        context: chipActivationInfo.context,
      });
      this.contextToChip.set(chipActivationInfo, chip);
    }
  }

  removeChildChip(e: ParallelActivationInfo | ChipResolvable): void {
    const index = this.indexOfChildChipActivationInfo(e);
    if (index === -1) throw new Error("Cannot find chip context");

    const chipActivationInfo = this.childChipActivationInfos[index];
    this.childChipActivationInfos.splice(index, 1);

    const chip = this.contextToChip.get(chipActivationInfo);
    if (chip) {
      this._terminateChildChip(chip);
      this.contextToChip.delete(chipActivationInfo);
    }
  }

  removeAllChildChips(): void {
    this._terminateAllChildChips();

    this.childChipActivationInfos = [];
    this.contextToChip.clear();
  }

  activateChildChip(e: number | ParallelActivationInfo | ChipResolvable): void {
    let index: number;
    if (typeof e === "number") {
      index = e;
      if (index < 0 || index >= this.childChipActivationInfos.length)
        throw new Error("Invalid index");
    } else {
      index = this.indexOfChildChipActivationInfo(e);
      if (index === -1) throw new Error("Cannot find chip context");
    }

    const chipActivationInfo = this.childChipActivationInfos[index];
    if (this.contextToChip.has(chipActivationInfo))
      throw new Error("Chip is already activated");

    const chip = this._activateChildChip(chipActivationInfo.chip, {
      context: chipActivationInfo.context,
      id: chipActivationInfo.id ?? index.toString(),
    });
    this.contextToChip.set(chipActivationInfo, chip);
    chipActivationInfo.activated = true;
  }

  terminateChildChip(
    e: ParallelActivationInfo | ChipResolvable | number
  ): void {
    let index: number;
    if (typeof e === "number") {
      index = e;
      if (index < 0 || index >= this.childChipActivationInfos.length)
        throw new Error("Invalid index");
    } else {
      index = this.indexOfChildChipActivationInfo(e);
      if (index === -1) throw new Error("Cannot find chip context");
    }

    const chipActivationInfo = this.childChipActivationInfos[index];
    const chip = this.contextToChip.get(chipActivationInfo);
    if (!chip) throw new Error("Chip not yet activated");

    this._terminateChildChip(chip);
    chipActivationInfo.activated = false;
    this.contextToChip.delete(chipActivationInfo);
  }

  indexOfChildChipActivationInfo(
    chip: ParallelActivationInfo | ChipResolvable
  ): number {
    if (isChipResolvable(chip)) {
      return _.indexOf(this.childChipActivationInfos, { chip });
    } else {
      return this.childChipActivationInfos.indexOf(chip);
    }
  }

  terminate(outputSignal?: Signal): void {
    this.contextToChip.clear();

    super.terminate(outputSignal);
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
  signalOnCompletion = true;
}

/**
  Runs one child chip after another. 
  When done, terminates with output signal of the last chip in the sequence.
  Optionally can loop back to the first chip.
*/
export class Sequence extends Composite {
  public readonly options: SequenceOptions;

  private chipActivationInfos: ChipActivationInfo[] = [];
  private currentChipIndex = 0;
  private currentChip: Chip;

  constructor(
    chipActivationInfos: Array<ChipActivationInfo | ChipResolvable>,
    options?: Partial<SequenceOptions>
  ) {
    super();

    this.options = fillInOptions(options, new SequenceOptions());

    for (const e of chipActivationInfos) this.addChildChip(e);
  }

  addChildChip(chip: ChipActivationInfo | ChipResolvable) {
    if (isChipResolvable(chip)) {
      this.chipActivationInfos.push({ chip: chip });
    } else {
      this.chipActivationInfos.push(chip);
    }
  }

  skip() {
    this._advance(makeSignal("skip"));
  }

  private _switchChip() {
    // Stop current chip
    if (this.currentChip) {
      // The current chip may have already been terminated, if it terminated before
      if (_.size(this._childChips) > 0)
        this._terminateChildChip(this.currentChip);
      delete this.currentChip;
    }

    if (this.currentChipIndex < this.chipActivationInfos.length) {
      const chipActivationInfo =
        this.chipActivationInfos[this.currentChipIndex];
      this.currentChip = this._activateChildChip(chipActivationInfo.chip, {
        context: chipActivationInfo.context,
        id: chipActivationInfo.id ?? this.currentChipIndex.toString(),
      });
    }
  }

  _onActivate() {
    this.currentChipIndex =
      (this._reloadMemento?.data.currentChipIndex as number) ?? 0;
    delete this.currentChip;

    if (this.chipActivationInfos.length === 0) {
      // Empty Sequence, stop immediately
      if (this.options.signalOnCompletion) this.terminate(makeSignal());
    } else {
      // Start the Sequence
      this._switchChip();
    }
  }

  _onAfterTick() {
    if (!this.currentChip) return;

    const signal = this.currentChip.outputSignal;
    if (signal) this._advance(signal);
  }

  _onTerminate() {
    delete this.currentChip;
  }

  restart() {
    this.currentChipIndex = 0;
    this._switchChip();
  }

  private _advance(signal: Signal) {
    this.currentChipIndex++;
    this._switchChip();

    // If we've reached the end of the Sequence...
    if (this.currentChipIndex >= this.chipActivationInfos.length) {
      if (this.options.loop) {
        // ... and we loop, go back to start
        this.currentChipIndex = 0;
        this._switchChip();
      } else if (this.options.signalOnCompletion) {
        // otherwise terminate
        this.terminate(signal);
      }
    }
  }

  protected _makeReloadMementoData(): ReloadMementoData {
    return {
      currentChipIndex: this.currentChipIndex,
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
  An chip that calls a provided function just once (in activate), and immediately requests a signal.
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

// Waits until time is up, then requests signal
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
 * Does not request a signal until done() is called with a given signal
 */
export class Block extends ChipBase {
  done(signal = makeSignal()) {
    this.terminate(signal);
  }
}

/**
 * Executes a function thatuntil the result is not undefined.
 * Terminates with that signal equal to its value.
 */
export class Decision extends ChipBase {
  constructor(private f: () => Signal | undefined) {
    super();
  }

  _onActivate() {
    this._checkTermination();
  }

  _onTick() {
    this._checkTermination();
  }

  private _checkTermination() {
    const out = this.f();
    if (typeof out !== "undefined") {
      this.terminate(out);
    }
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
