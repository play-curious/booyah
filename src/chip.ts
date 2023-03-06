import { EventEmitter } from "eventemitter3";
import * as _ from "underscore";

/**
 * Fills in the mising options from the provided defaults
 * @param options Options provided by the caller
 * @param defaults Defaults provided by the author
 */
export function fillInOptions<T extends {}>(
  options: Partial<T>,
  defaults: T
): T {
  if (options) return { ...defaults, ...options };
  else return defaults;
}

/** Deep clone of JSON-serializable objects */
export function cloneData<T = any>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}

/**
 * Event source that uses a Node.js-like interface, in contrast to the DOM events pattern using `addEventListener()`.
 */
export interface NodeEventSource {
  on(type: string, listener: () => void): void;
  once(type: string, listener: () => void): void;
  off(type: string, listener: () => void): void;
  emit(type: string, ...args: any[]): void;
}

export interface IEventListener {
  emitter: NodeEventSource;
  event: string;
  cb: () => void;
}

export interface Signal {
  readonly name: string;
  readonly params: Record<string, any>;
}

export function makeSignal(name = "default", params = {}): Signal {
  return { name, params };
}

export type ChipContext = {
  readonly [k: string]: any;
};

export type ChipContextFactory = (config: ChipContext) => ChipContext;
export type ChipContextResolvable = ChipContext | ChipContextFactory;

export function processChipContext(
  chipContext: ChipContext,
  alteredConfig: ChipContextResolvable
): ChipContext {
  if (!alteredConfig) return chipContext;
  if (typeof alteredConfig == "function") return alteredConfig(chipContext);

  return Object.assign({}, chipContext, alteredConfig);
}

export function extendConfig(values: {}): (
  chipContext: ChipContext
) => ChipContext {
  return (chipContext) => _.extend({}, chipContext, values);
}

export interface TickInfo {
  timeSinceLastTick: number;
}

export type ChipFactory = (signal: Signal) => Chip;

export type ChipResolvable = Chip | ChipFactory;

export interface ChipActivationInfo {
  chip: ChipResolvable;
  config?: ChipContextResolvable;
  id?: string;
}

export type ChipState = "inactive" | "active" | "paused";

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

export type ReloadMementoData = Record<string, unknown>;

export type ReloadMemento = {
  className: string;
  data: ReloadMementoData;
  children: Record<string, ReloadMemento>;
};

/**
 * In Booyah, the game is structured as a tree of chips. This is the interface for all chips.
 * When creating a new chip, you most likely want to extend ChipBase or CompositeChip,
 * which both implement this interface and do the busywork for you.
 **/
export interface Chip extends NodeEventSource {
  readonly state: ChipState;
  readonly signal: Signal;
  readonly children: Record<string, Chip>;

  activate(
    tickInfo: TickInfo,
    chipContext: ChipContext,
    inputSignal: Signal,
    reloadMemento?: ReloadMemento
  ): void;
  tick(tickInfo: TickInfo): void;
  terminate(tickInfo: TickInfo): void;
  pause(tickInfo: TickInfo): void;
  resume(tickInfo: TickInfo): void;
  makeReloadMemento(): ReloadMemento;
}

/**
 In Booyah, the game is structured as a tree of chips. This is the base class for all chips.

 An chip has the following lifecycle:
 1. It is instantiated using the contructor.
 Only parameters specific to the chip should be passed here.
 The chip should not make any changes to the environment here, it should wait for activate().
 2. activate() is called just once, with a configuration.
 This is when the chip should add dispaly objects  to the scene, or subscribe to events.
 The typical chipContext contains { app, preloader, narrator, jukebox, container }
 3. tick() is called one or more times, with options.
 It could also never be called, in case the chip is torn down directly.
 If the chip wishes to be terminated, it should set this._outputSignal to a truthy value.
 Typical options include { playTime, timeSinceStart, timeSinceLastTick, timeScale, gameState }
 For more complicated signals, it can return an object like { name: "", params: {} }
 4. terminate() is called just once.
 The chip should remove any changes it made, such as adding display objects to the scene, or subscribing to events.

 The base class will check that this lifecyle is respected, and will log errors to signal any problems.

 In the case that, subclasses do not need to override these methods, but override the underscore versions of them: _onActivate(), _onTick(), etc.
 This ensures that the base class behavior of will be called automatically.
 */
export abstract class ChipBase extends EventEmitter implements Chip {
  protected _chipContext: ChipContext;
  protected _lastFrameInfo: TickInfo;
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
    this._lastFrameInfo = tickInfo;
    this._inputSignal = inputSignal;
    this._state = "active";
    this._outputSignal = null;

    if (reloadMemento && reloadMemento.className === this.constructor.name)
      this._reloadMemento = reloadMemento;
    else delete this._reloadMemento;

    this._onActivate();
  }

  public tick(tickInfo: TickInfo): void {
    if (this._state !== "active")
      throw new Error(`tick() called from state ${this._state}`);

    if (this._outputSignal)
      throw new Error("tick() called despite requesting signal");

    this._lastFrameInfo = tickInfo;
    this._onTick();
  }

  public terminate(tickInfo: TickInfo): void {
    if (this._state !== "active" && this._state !== "paused")
      throw new Error(`tick() called from state ${this._state}`);

    this._lastFrameInfo = tickInfo;
    this._onTerminate();

    this._unsubscribe(); // Remove all event listeners

    this._state = "inactive";
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
    emitter: NodeEventSource,
    event: string,
    cb: (...args: any) => void
  ): void {
    this._eventListeners.push({ emitter, event, cb });
    emitter.on(event, cb);
  }

  protected _subscribeOnce(
    emitter: NodeEventSource,
    event: string,
    cb: (...args: any) => void
  ): void {
    this._eventListeners.push({ emitter, event, cb });
    emitter.once(event, cb);
  }

  // if `cb` is null, will remove all event listeners for the given emitter and event
  protected _unsubscribe(
    emitter?: NodeEventSource,
    event?: string,
    cb?: (...args: any) => void
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
      listener.emitter.off(listener.event, listener.cb);

    this._eventListeners = listenersToKeep;
  }

  public get children(): Record<string, Chip> {
    return {};
  }
  public get signal(): Signal {
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
      // TODO: Use unique IDs associated with children?
      childMementos[childId] = this.children[childId].makeReloadMemento();
    }

    return {
      className: this.constructor.name,
      data: this._makeReloadMementoData(),
      children: childMementos,
    };
  }

  protected _onActivate() {}
  protected _onTick() {}
  protected _onTerminate() {}
  protected _onPause() {}
  protected _onResume() {}

  /** By default, an chip be automatically reloaded */
  protected _makeReloadMementoData(): ReloadMementoData {
    return undefined;
  }
}

/** Empty class just to indicate an chip that does nothing and never requests a signal  */
export class NullChip extends ChipBase {}

/** An chip that returns the requested signal immediately  */
export class TransitoryChip extends ChipBase {
  constructor(readonly requestSignal = makeSignal()) {
    super();
  }

  _onActivate() {
    this._outputSignal = this.requestSignal;
  }
}

export class ActivateChildChipOptions {
  config?: ChipContextResolvable;
  signal?: Signal;
  id?: string;
  reloadMemento?: ReloadMemento;
}

/** Base class for chips that contain other chips
 *
 * Events:
 * - activatedChildChip(chip: Chip, config: ChipContext, signal: Signal)
 * - deactivatedChildChip(chip: Chip)
 */
export abstract class CompositeChip extends ChipBase {
  protected _childChips: Record<string, Chip> = {};

  public activate(
    tickInfo: TickInfo,
    chipContext: ChipContext,
    inputSignal: Signal,
    reloadMemento?: ReloadMemento
  ): void {
    super.activate(tickInfo, chipContext, inputSignal, reloadMemento);
  }
  /**
   * By default, updates all child chips and remove those that have a signal
   * Overload this method in subclasses to change the behavior
   */
  public tick(tickInfo: TickInfo): void {
    super.tick(tickInfo);

    this._updateChildChips();
  }

  public terminate(tickInfo: TickInfo): void {
    this._deactivateAllChildChips();

    super.terminate(tickInfo);
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

  protected _activateChildChip(
    chipResolvable: ChipResolvable,
    options?: Partial<ActivateChildChipOptions>
  ): Chip {
    if (this.state === "inactive") throw new Error("CompositeChip is inactive");

    options = fillInOptions(options, new ActivateChildChipOptions());
    if (options.id && options.id in this._childChips)
      throw new Error("Duplicate child chip id provided");

    const inputSignal = options.signal ?? makeSignal();

    let chip;
    if (_.isFunction(chipResolvable)) {
      chip = chipResolvable(inputSignal);
    } else {
      chip = chipResolvable;
    }

    // Look for reload memento, if an id is provided
    let reloadMemento: ReloadMemento;
    if (options.id && this._reloadMemento?.children[options.id]) {
      reloadMemento = this._reloadMemento.children[options.id];
    }

    // If no childId is provided, use a random temporary value
    const childId =
      options.id ?? `unknown_${_.random(Number.MAX_SAFE_INTEGER)}`;
    this._childChips[childId] = chip;

    const childConfig = processChipContext(this._chipContext, options.config);
    chip.activate(this._lastFrameInfo, childConfig, inputSignal, reloadMemento);

    this.emit("activatedChildChip", chip, childConfig, inputSignal);

    return chip;
  }

  protected _deactivateChildChip(chip: Chip): void {
    if (this.state === "inactive") throw new Error("CompositeChip is inactive");

    // Try to find value
    let childId: string;
    for (const id in this._childChips) {
      if (this._childChips[id] === chip) {
        childId = id;
        break;
      }
    }
    if (!childId) throw new Error("Cannot find chip to remove");

    chip.terminate(this._lastFrameInfo);

    delete this._childChips[childId];

    this.emit("deactivatedChildChip", chip);
  }

  /**
   * Updates all child chips, and deactivates any that need a signal.
   * Returns true if any have been deactivated.
   */
  protected _updateChildChips(): boolean {
    let needDeactivation = false;

    for (const id in this._childChips) {
      const childChip = this._childChips[id];

      if (childChip.signal) {
        childChip.terminate(this._lastFrameInfo);
        delete this._childChips[id];
        this.emit("deactivatedChildChip", childChip);

        needDeactivation = true;
      } else {
        childChip.tick(this._lastFrameInfo);
      }
    }

    return needDeactivation;
  }

  protected _deactivateAllChildChips() {
    for (const childChip of Object.values(this._childChips)) {
      childChip.terminate(this._lastFrameInfo);
      this.emit("deactivatedChildChip", childChip);
    }

    this._childChips = {};
  }
}

export class ParallelChipOptions {
  signalOnCompletion: boolean = true;
}

export interface ParallelChipActivationInfo extends ChipActivationInfo {
  activated?: boolean;
}

/**
 Allows a bunch of chips to execute in parallel.
 Updates child chips until they ask for a signal, at which point they are torn down.
 Requests a signal when all child chips have completed.
*/
export class ParallelChip extends CompositeChip {
  public readonly options: ParallelChipOptions;

  protected childChipActivationInfos: ParallelChipActivationInfo[] = [];
  protected contextToChip = new Map<ParallelChipActivationInfo, Chip>();

  constructor(
    chipActivationInfos: Array<
      ChipResolvable | ParallelChipActivationInfo
    > = [],
    options?: Partial<ParallelChipOptions>
  ) {
    super();

    this.options = fillInOptions(options, new ParallelChipOptions());

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
      this._outputSignal = makeSignal();
  }

  addChildChip(chip: ParallelChipActivationInfo | ChipResolvable) {
    const index = this.indexOfChildChipActivationInfo(chip);
    if (index !== -1) throw new Error("Chip context already added");

    let chipActivationInfo: ParallelChipActivationInfo;
    if (isChipResolvable(chip)) {
      chipActivationInfo = { chip, activated: true };
    } else {
      chipActivationInfo = chip;
    }

    this.childChipActivationInfos.push(chipActivationInfo);

    // Automatically activate the child chip
    if (this.state !== "inactive" && chipActivationInfo.activated) {
      const chip = this._activateChildChip(chipActivationInfo.chip, {
        config: chipActivationInfo.config,
      });
      this.contextToChip.set(chipActivationInfo, chip);
    }
  }

  removeChildChip(e: ParallelChipActivationInfo | ChipResolvable): void {
    const index = this.indexOfChildChipActivationInfo(e);
    if (index === -1) throw new Error("Cannot find chip context");

    const chipActivationInfo = this.childChipActivationInfos[index];
    this.childChipActivationInfos.splice(index, 1);

    const chip = this.contextToChip.get(chipActivationInfo);
    if (chip) {
      this._deactivateChildChip(chip);
      this.contextToChip.delete(chipActivationInfo);
    }
  }

  removeAllChildChips(): void {
    this._deactivateAllChildChips();

    this.childChipActivationInfos = [];
    this.contextToChip.clear();
  }

  activateChildChip(
    e: number | ParallelChipActivationInfo | ChipResolvable
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
    if (this.contextToChip.has(chipActivationInfo))
      throw new Error("Chip is already activated");

    const chip = this._activateChildChip(chipActivationInfo.chip, {
      config: chipActivationInfo.config,
      id: chipActivationInfo.id ?? index.toString(),
    });
    this.contextToChip.set(chipActivationInfo, chip);
    chipActivationInfo.activated = true;
  }

  deactivateChildChip(
    e: ParallelChipActivationInfo | ChipResolvable | number
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

    this._deactivateChildChip(chip);
    chipActivationInfo.activated = false;
    this.contextToChip.delete(chipActivationInfo);
  }

  indexOfChildChipActivationInfo(
    chip: ParallelChipActivationInfo | ChipResolvable
  ): number {
    if (isChipResolvable(chip)) {
      return _.indexOf(this.childChipActivationInfos, { chip });
    } else {
      return this.childChipActivationInfos.indexOf(chip);
    }
  }

  terminate(tickInfo: TickInfo): void {
    this.contextToChip.clear();

    super.terminate(tickInfo);
  }
}

export class ChipSequenceOptions {
  loop = false;
  signalOnCompletion = true;
}

/**
  Runs one child chip after another. 
  When done, requestes the last signal demanded.
  Optionally can loop back to the first chip.
*/
export class ChipSequence extends CompositeChip {
  public readonly options: ChipSequenceOptions;

  private chipActivationInfos: ChipActivationInfo[] = [];
  private currentChipIndex = 0;
  private currentChip: Chip = null;

  constructor(
    chipActivationInfos: Array<ChipActivationInfo | ChipResolvable>,
    options?: Partial<ChipSequenceOptions>
  ) {
    super();

    this.options = fillInOptions(options, new ChipSequenceOptions());

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
      // The current chip may have already been deactivated, if it requested a signal
      if (_.size(this._childChips) > 0)
        this._deactivateChildChip(this.currentChip);
      this.currentChip = null;
    }

    if (this.currentChipIndex < this.chipActivationInfos.length) {
      const chipActivationInfo =
        this.chipActivationInfos[this.currentChipIndex];
      this.currentChip = this._activateChildChip(chipActivationInfo.chip, {
        config: chipActivationInfo.config,
        id: chipActivationInfo.id ?? this.currentChipIndex.toString(),
      });
    }
  }

  _onActivate() {
    this.currentChipIndex =
      (this._reloadMemento?.data.currentChipIndex as number) ?? 0;
    this.currentChip = null;

    if (this.chipActivationInfos.length === 0) {
      // Empty sequence, stop immediately
      if (this.options.signalOnCompletion) this._outputSignal = makeSignal();
    } else {
      // Start the sequence
      this._switchChip();
    }
  }

  _onTick() {
    if (!this.currentChip) return;

    const signal = this.currentChip.signal;
    if (signal) this._advance(signal);
  }

  _onTerminate() {
    this.currentChip = null;
  }

  restart() {
    this.currentChipIndex = 0;
    this._switchChip();
  }

  private _advance(signal: Signal) {
    this.currentChipIndex++;
    this._switchChip();

    // If we've reached the end of the sequence...
    if (this.currentChipIndex >= this.chipActivationInfos.length) {
      if (this.options.loop) {
        // ... and we loop, go back to start
        this.currentChipIndex = 0;
        this._switchChip();
      } else if (this.options.signalOnCompletion) {
        // otherwise request this signal
        this._outputSignal = signal;
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
  startingProgress: {} = {};
}

/** 
  Represents a state machine, where each state has a name, and is represented by an chip.
  Only one state is active at a time. 
  The state machine has one starting state, but can have multiple ending states.
  When the machine reaches an ending state, it requests a signal with a name equal to the name of the ending state.
  By default, the state machine begins at the state called "start", and stops at "end".

  The signals are not provided directly by the states (chips) by rather by a signal table provided in the constructor.
  To use have a signal table within a signal table, use the function makeSignalTable()
*/
export class StateMachine extends CompositeChip {
  public readonly options: StateMachineOptions;

  public states: StateTable = {};
  public signals: SignalTable = {};
  public startingState: SignalDescriptor;
  public visitedStates: Signal[];
  public progress: {};
  public activeChildChip: Chip;
  public stateParams: {};
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

  _onTick() {
    if (!this.activeChildChip) return;

    const signal = this.activeChildChip.signal;
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
        // By default, pass through the params in the requested signal
        nextState = makeSignal(nextStateDescriptor.name, signal.params);
      } else {
        nextState = nextStateDescriptor;
      }

      this._changeState(nextState);
    }
  }

  _onTerminate() {
    this.activeChildChip = null;
    this.lastSignal = null;
  }

  _onSignal(tickInfo: TickInfo, signal: string, data?: any): void {
    if (signal === "reset") {
      this.terminate(tickInfo);
      this.activate(tickInfo, this._chipContext, this._inputSignal);
    }
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
      // The state may have already been deactivated, if it requested a signal
      if (_.size(this._childChips) > 0)
        this._deactivateChildChip(this.activeChildChip);
      this.activeChildChip = null;
    }

    // If reached an ending state, stop here.
    if (_.contains(this.options.endingStates, nextState.name)) {
      this.lastSignal = nextState;
      this.visitedStates.push(nextState);

      // Request signal
      this._outputSignal = nextState;
      return;
    }

    if (nextState.name in this.states) {
      const nextStateContext = this.states[nextState.name];
      this.activeChildChip = this._activateChildChip(nextStateContext.chip, {
        config: nextStateContext.config,
        signal: nextState,
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

export interface FunctionalChipFunctions {
  activate: (chip: FunctionalChip) => void;
  tick: (chip: FunctionalChip) => void;
  pause: (chip: FunctionalChip) => void;
  resume: (chip: FunctionalChip) => void;
  terminate: (chip: FunctionalChip) => void;
  requestSignal: (chip: FunctionalChip) => Signal | boolean;
  makeReloadMemento(): ReloadMemento;
}

/**
  An chip that gets its behavior from functions provided inline in the constructor.
  Useful for small chips that don't require their own class definition.
  Additionally, a function called requestSignal(options, chip), called after tick(), can set the requested signal 

  Example usage:
    new FunctionalChip({
      activate: (chipContext) => console.log("activate", chipContext),
      terminate: () => console.log("terminate"),
    });
*/
export class FunctionalChip extends CompositeChip {
  constructor(public readonly functions: Partial<FunctionalChipFunctions>) {
    super();
  }

  protected get lastFrameInfo(): TickInfo {
    return this._lastFrameInfo;
  }
  protected get inputSignal(): Signal {
    return this._inputSignal;
  }
  protected get reloadMemento(): ReloadMemento | undefined {
    return this._reloadMemento;
  }

  protected _onActivate() {
    if (this.functions.activate) this.functions.activate(this);
  }

  protected _onTick() {
    if (this.functions.tick) this.functions.tick(this);
    if (this.functions.requestSignal) {
      const result = this.functions.requestSignal(this);
      if (result) {
        if (_.isObject(result)) {
          this._outputSignal = result;
        } else {
          // result is true
          this._outputSignal = makeSignal();
        }
      }
    }
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
}

// TODO: rename to lambda chip?
/**
  An chip that calls a provided function just once (in activate), and immediately requests a signal.
  Optionally takes a @that parameter, which is set as _this_ during the call. 
*/
export class FunctionCallChip extends ChipBase {
  constructor(public f: (arg: any) => any, public that?: any) {
    super();
    this.that = that || this;
  }

  _onActivate() {
    this.f.call(this.that);

    this._outputSignal = makeSignal();
  }
}

// Waits until time is up, then requests signal
export class WaitingChip extends ChipBase {
  private _accumulatedTime: number;

  /** @wait is in milliseconds */
  constructor(public readonly wait: number) {
    super();
  }

  _onActivate() {
    this._accumulatedTime = 0;
  }

  _onTick() {
    this._accumulatedTime += this._lastFrameInfo.timeSinceLastTick;

    if (this._accumulatedTime >= this.wait) {
      this._outputSignal = makeSignal();
    }
  }
}

/**
 * Does not request a signal until done() is called with a given signal
 */
export class Block extends ChipBase {
  done(signal = makeSignal()) {
    this._outputSignal = signal;
  }
}

/**
 * Executes a function once and requests a signal equal to its value.
 */
export class Decision extends ChipBase {
  constructor(private f: () => Signal | undefined) {
    super();
  }

  _onActivate() {
    this._outputSignal = this.f();
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
    public handler: (...args: any) => Signal | boolean = _.constant(true)
  ) {
    super();
  }

  _onActivate() {
    this._subscribe(this.emitter, this.eventName, this._handleEvent);
  }

  _handleEvent(...args: any) {
    const result = this.handler(...args);
    if (!result) return;

    if (_.isObject(result)) {
      this._outputSignal = result;
    } else {
      // result is true
      this._outputSignal = makeSignal();
    }
  }
}

export interface AlternativeChipActivationInfo extends ChipActivationInfo {
  signal?: Signal;
}

/**
 *  Chip that requests a signal as soon as one of it's children requests one
 */
export class Alternative extends CompositeChip {
  private readonly chipActivationInfos: AlternativeChipActivationInfo[];

  // signal defaults to the string version of the index in the array (to avoid problem of 0 being considered as falsy)
  constructor(chipActivationInfos: AlternativeChipActivationInfo[]) {
    super();

    // Set default signal as the string version of the index in the array (to avoid problem of 0 being considered as falsy)
    this.chipActivationInfos = _.map(
      chipActivationInfos,
      (chipActivationInfo, key) =>
        _.defaults({}, chipActivationInfo, {
          signal: key.toString(),
        })
    );
  }

  _onActivate() {
    for (const chipActivationInfo of this.chipActivationInfos) {
      this._activateChildChip(chipActivationInfo.chip, {
        config: chipActivationInfo.config,
      });
    }

    this._checkForSignal();
  }

  _onTick() {
    this._checkForSignal();
  }

  private _checkForSignal(): void {
    for (let i = 0; i < this.chipActivationInfos.length; i++) {
      if (this._childChips[i].signal) {
        this._outputSignal = this.chipActivationInfos[i].signal;
        break;
      }
    }
  }
}
