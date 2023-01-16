import * as PIXI from "pixi.js";

import _ from "underscore";
import * as util from "./util";

export interface IEventListener {
  emitter: PIXI.utils.EventEmitter;
  event: string;
  cb: () => any;
}

export interface Transition {
  readonly name: string;
  readonly params: Record<string, any>;
}

export function makeTransition(name = "default", params = {}) {
  return { name, params };
}

export type EntityConfig = {
  [k: string]: any;
};

export type EntityConfigFactory = (config: EntityConfig) => EntityConfig;
export type EntityConfigResolvable = EntityConfig | EntityConfigFactory;

export function processEntityConfig(
  entityConfig: EntityConfig,
  alteredConfig: EntityConfigResolvable
): EntityConfig {
  if (!alteredConfig) return entityConfig;
  if (typeof alteredConfig == "function") return alteredConfig(entityConfig);
  return alteredConfig;
}

export function extendConfig(values: {}): (
  entityConfig: EntityConfig
) => EntityConfig {
  return (entityConfig) => _.extend({}, entityConfig, values);
}

export type GameState =
  | "preloading"
  | "loadingFixed"
  | "ready"
  | "playing"
  | "paused"
  | "done";

export interface FrameInfo {
  playTime: number;
  timeSinceStart: number;
  timeSinceLastFrame: number;
  timeScale: number;
  gameState: GameState;
}

export type EntityFactory = (transition: Transition) => Entity;

export type EntityResolvable = Entity | EntityFactory;

export interface EntityContext {
  entity: EntityResolvable;
  config?: EntityConfigResolvable;
  id?: string;
}

export function isEntity(e: any): e is Entity {
  return "isSetup" in e;
}

export function isEntityResolvable(
  e: EntityResolvable | EntityContext
): e is EntityResolvable {
  return typeof e === "function" || isEntity(e);
}

export type ReloadMementoData = Record<string, unknown>;

export type ReloadMemento = {
  className: string;
  data: ReloadMementoData;
  children: Record<string, ReloadMemento>;
};

/**
 * In Booyah, the game is structured as a tree of entities. This is the interface for all entities.
 * When creating a new entity, you most likely want to extend EntityBase or CompositeEntity,
 * which both implement this interface and do the busywork for you.
 **/
export interface Entity extends PIXI.utils.EventEmitter {
  readonly isSetup: boolean;
  readonly transition: Transition;
  readonly children: Record<string, Entity>;

  setup(
    frameInfo: FrameInfo,
    entityConfig: EntityConfig,
    enteringTransition: Transition,
    reloadMemento?: ReloadMemento
  ): void;
  update(frameInfo: FrameInfo): void;
  teardown(frameInfo: FrameInfo): void;
  onSignal(frameInfo: FrameInfo, signal: string, data?: any): void;
  makeReloadMemento(): ReloadMemento;
}

/**
 In Booyah, the game is structured as a tree of entities. This is the base class for all entities.

 An entity has the following lifecycle:
 1. It is instantiated using the contructor.
 Only parameters specific to the entity should be passed here.
 The entity should not make any changes to the environment here, it should wait for setup().
 2. setup() is called just once, with a configuration.
 This is when the entity should add dispaly objects  to the scene, or subscribe to events.
 The typical entityConfig contains { app, preloader, narrator, jukebox, container }
 3. update() is called one or more times, with options.
 It could also never be called, in case the entity is torn down directly.
 If the entity wishes to be terminated, it should set this._transition to a truthy value.
 Typical options include { playTime, timeSinceStart, timeSinceLastFrame, timeScale, gameState }
 For more complicated transitions, it can return an object like { name: "", params: {} }
 4. teardown() is called just once.
 The entity should remove any changes it made, such as adding display objects to the scene, or subscribing to events.

 The base class will check that this lifecyle is respected, and will log errors to signal any problems.

 In the case that, subclasses do not need to override these methods, but override the underscore versions of them: _setup(), _update(), etc.
 This ensures that the base class behavior of will be called automatically.
 */
export abstract class EntityBase
  extends PIXI.utils.EventEmitter
  implements Entity
{
  protected _entityConfig: EntityConfig;
  protected _lastFrameInfo: FrameInfo;
  protected _enteringTransition: Transition;
  protected _reloadMemento?: ReloadMemento;
  protected _eventListeners: IEventListener[] = [];
  protected _transition: Transition;
  protected _isSetup = false;

  get entityConfig(): EntityConfig {
    return this._entityConfig;
  }

  public setup(
    frameInfo: FrameInfo,
    entityConfig: EntityConfig,
    enteringTransition: Transition,
    reloadMemento?: ReloadMemento
  ): void {
    if (this._isSetup) throw new Error("setup() called twice");

    this._entityConfig = entityConfig;
    this._lastFrameInfo = frameInfo;
    this._enteringTransition = enteringTransition;
    this._isSetup = true;
    this._transition = null;

    if (reloadMemento && reloadMemento.className === this.constructor.name)
      this._reloadMemento = reloadMemento;
    else delete this._reloadMemento;

    this._setup(frameInfo, entityConfig, enteringTransition, reloadMemento);
  }

  public update(frameInfo: FrameInfo): void {
    if (!this._isSetup) throw new Error("update() called before setup()");
    if (this._transition)
      throw new Error("update() called despite requesting transition");

    this._lastFrameInfo = frameInfo;
    this._update(frameInfo);
  }

  public teardown(frameInfo: FrameInfo): void {
    if (!this._isSetup) throw new Error("teardown() called before setup()");

    this._lastFrameInfo = frameInfo;
    this._teardown(frameInfo);

    this._off(); // Remove all event listeners

    this._isSetup = false;
  }

  public onSignal(frameInfo: FrameInfo, signal: string, data?: any): void {
    if (!this._isSetup) throw new Error("onSignal() called before setup()");

    this._lastFrameInfo = frameInfo;
    this._onSignal(frameInfo, signal, data);
  }

  protected _on(
    emitter: PIXI.utils.EventEmitter,
    event: string,
    cb: (...args: any) => void
  ): void {
    this._eventListeners.push({ emitter, event, cb });
    emitter.on(event, cb, this);
  }

  protected _once(
    emitter: PIXI.utils.EventEmitter,
    event: string,
    cb: (...args: any) => void
  ): void {
    this._eventListeners.push({ emitter, event, cb });
    emitter.once(event, cb, this);
  }

  // if @cb is null, will remove all event listeners for the given emitter and event
  protected _off(
    emitter?: PIXI.utils.EventEmitter,
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
      listener.emitter.off(listener.event, listener.cb, this);

    this._eventListeners = listenersToKeep;
  }

  public get children(): Record<string, Entity> {
    return {};
  }
  public get transition(): Transition {
    return this._transition;
  }
  public get isSetup(): boolean {
    return this._isSetup;
  }
  public makeReloadMemento(): ReloadMemento {
    if (!this._isSetup)
      throw new Error("makeReloadMemento() called before setup()");

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

  protected _setup(
    frameInfo: FrameInfo,
    entityConfig: EntityConfig,
    enteringTransition: Transition,
    reloadMemento?: ReloadMemento
  ) {}
  protected _update(frameInfo: FrameInfo) {}
  protected _teardown(frameInfo: FrameInfo) {}
  protected _onSignal(frameInfo: FrameInfo, signal: string, data?: any) {}
  /** By default, an entity be automatically reloaded */
  protected _makeReloadMementoData(): ReloadMementoData {
    return undefined;
  }
}

/** Empty class just to indicate an entity that does nothing and never requests a transition  */
export class NullEntity extends EntityBase {}

/** An entity that returns the requested transition immediately  */
export class TransitoryEntity extends EntityBase {
  constructor(readonly requestTransition = makeTransition()) {
    super();
  }

  _setup() {
    this._transition = this.requestTransition;
  }
}

export class ActivateChildEntityOptions {
  config?: EntityConfigResolvable;
  transition?: Transition;
  id?: string;
  reloadMemento?: ReloadMemento;
}

/** Base class for entities that contain other entities
 *
 * Events:
 * - activatedChildEntity(entity: Entity, config: EntityConfig, transition: Transition)
 * - deactivatedChildEntity(entity: Entity)
 */
export abstract class CompositeEntity extends EntityBase {
  protected _childEntities: Record<string, Entity> = {};

  public setup(
    frameInfo: FrameInfo,
    entityConfig: EntityConfig,
    enteringTransition: Transition,
    reloadMemento?: ReloadMemento
  ): void {
    super.setup(frameInfo, entityConfig, enteringTransition, reloadMemento);
  }
  /**
   * By default, updates all child entities and remove those that have a transition
   * Overload this method in subclasses to change the behavior
   */
  public update(frameInfo: FrameInfo): void {
    super.update(frameInfo);

    this._updateChildEntities();
  }

  public teardown(frameInfo: FrameInfo): void {
    this._deactivateAllChildEntities();

    super.teardown(frameInfo);
  }

  public onSignal(frameInfo: FrameInfo, signal: string, data?: any) {
    super.onSignal(frameInfo, signal, data);

    for (const childEntity of Object.values(this._childEntities)) {
      childEntity.onSignal(frameInfo, signal, data);
    }
  }

  public get children(): Record<string, Entity> {
    return this._childEntities;
  }

  protected _activateChildEntity(
    entityResolvable: EntityResolvable,
    options?: Partial<ActivateChildEntityOptions>
  ): Entity {
    if (!this.isSetup) throw new Error("CompositeEntity is not yet active");

    options = util.fillInOptions(options, new ActivateChildEntityOptions());
    if (options.id && options.id in this._childEntities)
      throw new Error("Duplicate child entity id provided");

    const enteringTransition = options.transition ?? makeTransition();

    let entity;
    if (_.isFunction(entityResolvable)) {
      entity = entityResolvable(enteringTransition);
    } else {
      entity = entityResolvable;
    }

    // Look for reload memento, if an id is provided
    let reloadMemento: ReloadMemento;
    if (options.id && this._reloadMemento?.children[options.id]) {
      reloadMemento = this._reloadMemento.children[options.id];
    }

    // If no childId is provided, use a random temporary value
    const childId =
      options.id ?? `unknown_${_.random(Number.MAX_SAFE_INTEGER)}`;
    this._childEntities[childId] = entity;

    const childConfig = processEntityConfig(this._entityConfig, options.config);
    entity.setup(
      this._lastFrameInfo,
      childConfig,
      enteringTransition,
      reloadMemento
    );

    this.emit("activatedChildEntity", entity, childConfig, enteringTransition);

    return entity;
  }

  protected _deactivateChildEntity(entity: Entity): void {
    if (!this.isSetup) throw new Error("CompositeEntity is not yet active");

    // Try to find value
    let childId: string;
    for (const id in this._childEntities) {
      if (this._childEntities[id] === entity) {
        childId = id;
        break;
      }
    }
    if (!childId) throw new Error("Cannot find entity to remove");

    entity.teardown(this._lastFrameInfo);

    delete this._childEntities[childId];

    this.emit("deactivatedChildEntity", entity);
  }

  /**
   * Updates all child entities, and deactivates any that need a transition.
   * Returns true if any have been deactivated.
   */
  protected _updateChildEntities(): boolean {
    let needDeactivation = false;

    for (const id in this._childEntities) {
      const childEntity = this._childEntities[id];

      if (childEntity.transition) {
        childEntity.teardown(this._lastFrameInfo);
        delete this._childEntities[id];
        this.emit("deactivatedChildEntity", childEntity);

        needDeactivation = true;
      } else {
        childEntity.update(this._lastFrameInfo);
      }
    }

    return needDeactivation;
  }

  protected _deactivateAllChildEntities() {
    for (const childEntity of Object.values(this._childEntities)) {
      childEntity.teardown(this._lastFrameInfo);
      this.emit("deactivatedChildEntity", childEntity);
    }

    this._childEntities = {};
  }
}

export class ParallelEntityOptions {
  transitionOnCompletion: boolean = true;
}

export interface ParallelEntityContext extends EntityContext {
  activated?: boolean;
}

/**
 Allows a bunch of entities to execute in parallel.
 Updates child entities until they ask for a transition, at which point they are torn down.
 Requests a transition when all child entities have completed.
*/
export class ParallelEntity extends CompositeEntity {
  public readonly options: ParallelEntityOptions;

  protected childEntityContexts: ParallelEntityContext[] = [];
  protected contextToEntity = new Map<ParallelEntityContext, Entity>();

  constructor(
    entityContexts: Array<EntityResolvable | ParallelEntityContext> = [],
    options?: Partial<ParallelEntityOptions>
  ) {
    super();

    this.options = util.fillInOptions(options, new ParallelEntityOptions());

    for (const e of entityContexts) this.addChildEntity(e);
  }

  setup(
    frameInfo: FrameInfo,
    entityConfig: EntityConfig,
    enteringTransition?: Transition,
    reloadMemento?: ReloadMemento
  ) {
    super.setup(frameInfo, entityConfig, enteringTransition, reloadMemento);

    for (const entityContext of this.childEntityContexts) {
      if (entityContext.activated) this.activateChildEntity(entityContext);
    }
  }

  update(frameInfo: FrameInfo) {
    super.update(frameInfo);

    if (this.options.transitionOnCompletion && !_.some(this._childEntities))
      this._transition = makeTransition();
  }

  addChildEntity(entity: ParallelEntityContext | EntityResolvable) {
    const index = this.indexOfChildEntityContext(entity);
    if (index !== -1) throw new Error("Entity context already added");

    let entityContext: ParallelEntityContext;
    if (isEntityResolvable(entity)) {
      entityContext = { entity, activated: true };
    } else {
      entityContext = entity;
    }

    this.childEntityContexts.push(entityContext);

    // Automatically activate the child entity
    if (this.isSetup && entityContext.activated) {
      const entity = this._activateChildEntity(entityContext.entity, {
        config: entityContext.config,
      });
      this.contextToEntity.set(entityContext, entity);
    }
  }

  removeChildEntity(e: ParallelEntityContext | EntityResolvable): void {
    const index = this.indexOfChildEntityContext(e);
    if (index === -1) throw new Error("Cannot find entity context");

    const entityContext = this.childEntityContexts[index];
    this.childEntityContexts.splice(index, 1);

    const entity = this.contextToEntity.get(entityContext);
    if (entity) {
      this._deactivateChildEntity(entity);
      this.contextToEntity.delete(entityContext);
    }
  }

  removeAllChildEntities(): void {
    this._deactivateAllChildEntities();

    this.childEntityContexts = [];
    this.contextToEntity.clear();
  }

  activateChildEntity(
    e: number | ParallelEntityContext | EntityResolvable
  ): void {
    let index: number;
    if (typeof e === "number") {
      index = e;
      if (index < 0 || index >= this.childEntityContexts.length)
        throw new Error("Invalid index");
    } else {
      index = this.indexOfChildEntityContext(e);
      if (index === -1) throw new Error("Cannot find entity context");
    }

    const entityContext = this.childEntityContexts[index];
    if (this.contextToEntity.has(entityContext))
      throw new Error("Entity is already activated");

    const entity = this._activateChildEntity(entityContext.entity, {
      config: entityContext.config,
      id: entityContext.id ?? index.toString(),
    });
    this.contextToEntity.set(entityContext, entity);
    entityContext.activated = true;
  }

  deactivateChildEntity(
    e: ParallelEntityContext | EntityResolvable | number
  ): void {
    let index: number;
    if (typeof e === "number") {
      index = e;
      if (index < 0 || index >= this.childEntityContexts.length)
        throw new Error("Invalid index");
    } else {
      index = this.indexOfChildEntityContext(e);
      if (index === -1) throw new Error("Cannot find entity context");
    }

    const entityContext = this.childEntityContexts[index];
    const entity = this.contextToEntity.get(entityContext);
    if (!entity) throw new Error("Entity not yet activated");

    this._deactivateChildEntity(entity);
    entityContext.activated = false;
    this.contextToEntity.delete(entityContext);
  }

  indexOfChildEntityContext(
    entity: ParallelEntityContext | EntityResolvable
  ): number {
    if (isEntityResolvable(entity)) {
      return _.indexOf(this.childEntityContexts, { entity });
    } else {
      return this.childEntityContexts.indexOf(entity);
    }
  }

  teardown(frameInfo: FrameInfo): void {
    this.contextToEntity.clear();

    super.teardown(frameInfo);
  }
}

export class EntitySequenceOptions {
  loop = false;
  transitionOnCompletion = true;
}

/**
  Runs one child entity after another. 
  When done, requestes the last transition demanded.
  Optionally can loop back to the first entity.
*/
export class EntitySequence extends CompositeEntity {
  public readonly options: EntitySequenceOptions;

  private entityContexts: EntityContext[] = [];
  private currentEntityIndex = 0;
  private currentEntity: Entity = null;

  constructor(
    entityContexts: Array<EntityContext | EntityResolvable>,
    options?: Partial<EntitySequenceOptions>
  ) {
    super();

    this.options = util.fillInOptions(options, new EntitySequenceOptions());

    for (const e of entityContexts) this.addChildEntity(e);
  }

  addChildEntity(entity: EntityContext | EntityResolvable) {
    if (isEntityResolvable(entity)) {
      this.entityContexts.push({ entity: entity });
    } else {
      this.entityContexts.push(entity);
    }
  }

  skip() {
    this._advance(makeTransition("skip"));
  }

  private _switchEntity() {
    // Stop current entity
    if (this.currentEntity) {
      // The current entity may have already been deactivated, if it requested a transition
      if (_.size(this._childEntities) > 0)
        this._deactivateChildEntity(this.currentEntity);
      this.currentEntity = null;
    }

    if (this.currentEntityIndex < this.entityContexts.length) {
      const entityContext = this.entityContexts[this.currentEntityIndex];
      this.currentEntity = this._activateChildEntity(entityContext.entity, {
        config: entityContext.config,
        id: entityContext.id ?? this.currentEntityIndex.toString(),
      });
    }
  }

  _setup() {
    this.currentEntityIndex =
      (this._reloadMemento?.data.currentEntityIndex as number) ?? 0;
    this.currentEntity = null;

    if (this.entityContexts.length === 0) {
      // Empty sequence, stop immediately
      if (this.options.transitionOnCompletion)
        this._transition = makeTransition();
    } else {
      // Start the sequence
      this._switchEntity();
    }
  }

  _update() {
    if (!this.currentEntity) return;

    const transition = this.currentEntity.transition;
    if (transition) this._advance(transition);
  }

  _teardown() {
    this.currentEntity = null;
  }

  restart() {
    this.currentEntityIndex = 0;
    this._switchEntity();
  }

  private _advance(transition: Transition) {
    this.currentEntityIndex++;
    this._switchEntity();

    // If we've reached the end of the sequence...
    if (this.currentEntityIndex >= this.entityContexts.length) {
      if (this.options.loop) {
        // ... and we loop, go back to start
        this.currentEntityIndex = 0;
        this._switchEntity();
      } else if (this.options.transitionOnCompletion) {
        // otherwise request this transition
        this._transition = transition;
      }
    }
  }

  protected _makeReloadMementoData(): ReloadMementoData {
    return {
      currentEntityIndex: this.currentEntityIndex,
    };
  }
}

export type StateTable = { [n: string]: EntityContext };
export type StateTableDescriptor = {
  [n: string]: EntityContext | EntityResolvable;
};

export type TransitionFunction = (transition: Transition) => Transition;
export type TransitionDescriptor = Transition | TransitionFunction;
export type TransitionTable = { [name: string]: TransitionDescriptor };

export class StateMachineOptions {
  startingState: Transition | string = "start";
  transitions: { [n: string]: TransitionDescriptor | string };
  endingStates: string[] = ["end"];
  startingProgress: {} = {};
}

/** 
  Represents a state machine, where each state has a name, and is represented by an entity.
  Only one state is active at a time. 
  The state machine has one starting state, but can have multiple ending states.
  When the machine reaches an ending state, it requests a transition with a name equal to the name of the ending state.
  By default, the state machine begins at the state called "start", and stops at "end".

  The transitions are not provided directly by the states (entities) by rather by a transition table provided in the constructor.
  To use have a transition table within a transition table, use the function makeTransitionTable()
*/
export class StateMachine extends CompositeEntity {
  public readonly options: StateMachineOptions;

  public states: StateTable = {};
  public transitions: TransitionTable = {};
  public startingState: TransitionDescriptor;
  public visitedStates: Transition[];
  public progress: {};
  public state: Entity;
  public stateParams: {};
  private lastTransition: Transition;

  constructor(
    states: StateTableDescriptor,
    options?: Partial<StateMachineOptions>
  ) {
    super();

    // Create state table
    for (const name in states) {
      const state = states[name];
      if (isEntityResolvable(state)) {
        this.states[name] = { entity: state };
      } else {
        this.states[name] = state;
      }
    }

    this.options = util.fillInOptions(options, new StateMachineOptions());

    // Ensure all transitions are of the correct type
    if (typeof this.options.startingState === "string")
      this.startingState = makeTransition(this.options.startingState);
    else this.startingState = this.options.startingState;

    for (const key in this.options.transitions) {
      const value = this.options.transitions[key];
      if (typeof value === "string") {
        this.transitions[key] = makeTransition(value);
      } else {
        this.transitions[key] = value;
      }
    }
  }

  setup(
    frameInfo: FrameInfo,
    entityConfig: EntityConfig,
    enteringTransition?: Transition,
    reloadMemento?: ReloadMemento
  ) {
    super.setup(frameInfo, entityConfig, enteringTransition, reloadMemento);

    this.visitedStates = [];
    this.progress = util.cloneData(this.options.startingProgress);

    if (this._reloadMemento) {
      this.visitedStates = this._reloadMemento.data
        .visitedStates as Transition[];
      this._changeState(_.last(this.visitedStates));
    } else {
      const startingState = _.isFunction(this.startingState)
        ? this.startingState(makeTransition())
        : this.startingState;
      this._changeState(startingState);
    }
  }

  _update() {
    if (!this.state) return;

    const transition = this.state.transition;
    if (transition) {
      let nextStateDescriptor: Transition;
      // The transition could directly be the name of another state, or ending state
      if (!(this.lastTransition.name in this.transitions)) {
        if (
          transition.name in this.states ||
          _.contains(this.options.endingStates, transition.name)
        ) {
          nextStateDescriptor = transition;
        } else {
          throw new Error(
            `Cannot find transition for state '${transition.name}'`
          );
        }
      } else {
        const transitionDescriptor: TransitionDescriptor =
          this.transitions[this.lastTransition.name];
        if (_.isFunction(transitionDescriptor)) {
          nextStateDescriptor = transitionDescriptor(transition);
        } else {
          nextStateDescriptor = transitionDescriptor;
        }
      }

      // Unpack the next state
      let nextState: Transition;
      if (
        !nextStateDescriptor.params ||
        _.isEmpty(nextStateDescriptor.params)
      ) {
        // By default, pass through the params in the requested transition
        nextState = makeTransition(nextStateDescriptor.name, transition.params);
      } else {
        nextState = nextStateDescriptor;
      }

      this._changeState(nextState);
    }
  }

  _teardown() {
    this.state = null;
    this.lastTransition = null;
  }

  _onSignal(frameInfo: FrameInfo, signal: string, data?: any): void {
    if (signal === "reset") {
      this.teardown(frameInfo);
      this.setup(frameInfo, this._entityConfig, this._enteringTransition);
    }
  }

  protected _makeReloadMementoData(): ReloadMementoData {
    return {
      visitedStates: this.visitedStates,
    };
  }

  changeState(nextState: string | Transition): void {
    if (typeof nextState === "string") {
      nextState = makeTransition(nextState);
    }

    this._changeState(nextState);
  }

  private _changeState(nextState: Transition): void {
    // Stop current state
    if (this.state) {
      // The state may have already been deactivated, if it requested a transition
      if (_.size(this._childEntities) > 0)
        this._deactivateChildEntity(this.state);
      this.state = null;
    }

    // If reached an ending state, stop here.
    if (_.contains(this.options.endingStates, nextState.name)) {
      this.lastTransition = nextState;
      this.visitedStates.push(nextState);

      // Request transition
      this._transition = nextState;
      return;
    }

    if (nextState.name in this.states) {
      const nextStateContext = this.states[nextState.name];
      this.state = this._activateChildEntity(nextStateContext.entity, {
        config: nextStateContext.config,
        transition: nextState,
      });
    } else {
      throw new Error(`Cannot find state '${nextState.name}'`);
    }

    const previousTransition = this.lastTransition;
    this.lastTransition = nextState;

    this.visitedStates.push(nextState);

    this.emit("stateChange", previousTransition, nextState);
  }
}

/** 
  Creates a transition table for use with StateMachine.
  Example: 
    const transitions = {
      start: entity.makeTransitionTable({ 
        win: "end",
        lose: "start",
      }),
    };
    `
*/
export function makeTransitionTable(table: {
  [key: string]: string | TransitionFunction;
}): TransitionFunction {
  const f = function (transition: Transition): Transition {
    if (transition.name in table) {
      const transitionResolvable = table[transition.name];
      if (_.isFunction(transitionResolvable)) {
        return transitionResolvable(transition);
      } else {
        return makeTransition(transitionResolvable);
      }
    } else {
      throw new Error(`Cannot find state ${transition.name}`);
    }
  };
  f.table = table; // For debugging purposes

  return f;
}

export interface FunctionalEntityFunctions {
  setup: (
    frameInfo: FrameInfo,
    entityConfig: any,
    entity: FunctionalEntity
  ) => void;
  update: (frameInfo: FrameInfo, entity: FunctionalEntity) => void;
  teardown: (frameInfo: FrameInfo, entity: FunctionalEntity) => void;
  onSignal: (
    frameInfo: FrameInfo,
    signal: string,
    data: any,
    entity: FunctionalEntity
  ) => void;
  requestTransition: (
    frameInfo: FrameInfo,
    entity: FunctionalEntity
  ) => Transition | boolean;
}

/**
  An entity that gets its behavior from functions provided inline in the constructor.
  Useful for small entities that don't require their own class definition.
  Additionally, a function called requestTransition(options, entity), called after update(), can set the requested transition 

  Example usage:
    new FunctionalEntity({
      setup: (entityConfig) => console.log("setup", entityConfig),
      teardown: () => console.log("teardown"),
    });
*/
export class FunctionalEntity extends CompositeEntity {
  constructor(public readonly functions: Partial<FunctionalEntityFunctions>) {
    super();
  }

  _setup() {
    if (this.functions.setup)
      this.functions.setup(this._lastFrameInfo, this._entityConfig, this);
  }

  _update() {
    if (this.functions.update) this.functions.update(this._lastFrameInfo, this);
    if (this.functions.requestTransition) {
      const result = this.functions.requestTransition(
        this._lastFrameInfo,
        this
      );
      if (result) {
        if (_.isObject(result)) {
          this._transition = result;
        } else {
          // result is true
          this._transition = makeTransition();
        }
      }
    }
  }

  _teardown(frameInfo: FrameInfo) {
    if (this.functions.teardown)
      this.functions.teardown(this._lastFrameInfo, this);
  }

  _onSignal(frameInfo: FrameInfo, signal: string, data?: any) {
    if (this.functions.onSignal)
      this.functions.onSignal(frameInfo, signal, data, this);
  }
}

/**
  An entity that calls a provided function just once (in setup), and immediately requests a transition.
  Optionally takes a @that parameter, which is set as _this_ during the call. 
*/
export class FunctionCallEntity extends EntityBase {
  constructor(public f: (arg: any) => any, public that?: any) {
    super();
    this.that = that || this;
  }

  _setup() {
    this.f.call(this.that);

    this._transition = makeTransition();
  }
}

// Waits until time is up, then requests transition
export class WaitingEntity extends EntityBase {
  private _accumulatedTime: number;

  /** @wait is in milliseconds */
  constructor(public readonly wait: number) {
    super();
  }

  _setup() {
    this._accumulatedTime = 0;
  }

  _update(frameInfo: FrameInfo) {
    this._accumulatedTime += frameInfo.timeSinceLastFrame;

    if (this._accumulatedTime >= this.wait) {
      this._transition = makeTransition();
    }
  }
}

/**
  An entity that creates a new PIXI container in the setup entityConfig for it's children, and manages the container. 
*/
export class ContainerEntity extends ParallelEntity {
  public oldConfig: EntityConfig;
  public newConfig: EntityConfig;
  public container: PIXI.Container;

  constructor(
    entities: Array<ParallelEntityContext | EntityResolvable> = [],
    public name?: string
  ) {
    super(entities);
  }

  setup(
    frameInfo: FrameInfo,
    entityConfig: EntityConfig,
    enteringTransition: Transition,
    reloadMemento: ReloadMemento
  ) {
    this.oldConfig = entityConfig;

    this.container = new PIXI.Container();
    this.container.name = this.name;
    this.oldConfig.container.addChild(this.container);

    this.newConfig = _.extend({}, entityConfig, {
      container: this.container,
    });

    super.setup(frameInfo, this.newConfig, enteringTransition, reloadMemento);
  }

  teardown(frameInfo: FrameInfo) {
    super.teardown(frameInfo);

    this.oldConfig.container.removeChild(this.container);
  }
}

export class VideoEntityOptions {
  loop = false;
  scale: PIXI.IPoint | number = 1;
}

/**
  Manages a video asset. Can optionally loop the video.
  Asks for a transition when the video has ended.
*/
export class VideoEntity extends EntityBase {
  public container: PIXI.Container;
  public videoElement: any;
  public videoSprite: any;
  private _options: VideoEntityOptions;

  constructor(public videoName: string, options?: Partial<VideoEntityOptions>) {
    super();

    this._options = util.fillInOptions(options, new VideoEntityOptions());
  }

  _setup(frameInfo: FrameInfo, entityConfig: EntityConfig) {
    const videoPath = `video/${this.videoName}.mp4`;
    if (!(videoPath in this._entityConfig.videoAssets)) {
      throw new Error(`Cannot find video at path "${videoPath}"`);
    }

    // This container is used so that the video is inserted in the right place,
    // even if the sprite isn't added until later.
    this.container = new PIXI.Container();
    this._entityConfig.container.addChild(this.container);

    this.videoElement = this._entityConfig.videoAssets[videoPath];
    this.videoElement.loop = this._options.loop;
    this.videoElement.currentTime = 0;

    this.videoSprite = null;

    // videoElement.play() might not return a promise on older browsers
    Promise.resolve(this.videoElement.play()).then(() => {
      // Including a slight delay seems to workaround a bug affecting Firefox
      window.setTimeout(() => this._startVideo(), 100);
    });
  }

  _update(frameInfo: FrameInfo) {
    if (this.videoElement.ended) this._transition = makeTransition();
  }

  _onSignal(frameInfo: FrameInfo, signal: string, data?: any) {
    if (signal === "pause") {
      this.videoElement.pause();
    } else if (signal === "play") {
      this.videoElement.play();
    }
  }

  teardown(frameInfo: FrameInfo) {
    this.videoElement.pause();
    this.videoSprite = null;
    this._entityConfig.container.removeChild(this.container);
    this.container = null;

    super.teardown(frameInfo);
  }

  _startVideo() {
    //@ts-ignore
    const videoResource = new PIXI.resources.VideoResource(this.videoElement);
    //@ts-ignore
    this.videoSprite = PIXI.Sprite.from(videoResource);
    this.videoSprite.scale.set(this._options.scale);
    this.container.addChild(this.videoSprite);
  }
}

/**
  Manages a video that is loaded from a remote source, rather than a local asset.
  Asks for a transition when the video has ended.
*/
export class StreamingVideoEntity extends EntityBase {
  public container: PIXI.Container;
  public videoElement: HTMLVideoElement;
  public videoSprite: any;
  private _options: VideoEntityOptions;

  constructor(public videoURL: string, options?: Partial<VideoEntityOptions>) {
    super();

    this._options = util.fillInOptions(options, new VideoEntityOptions());
  }

  _setup(frameInfo: FrameInfo, entityConfig: EntityConfig) {
    // This container is used so that the video is inserted in the right place,
    // even if the sprite isn't added until later.
    this.container = new PIXI.Container();

    {
      // Make black background
      const bg = new PIXI.Graphics();
      bg.beginFill(0);
      bg.drawRect(
        0,
        0,
        this._entityConfig.app.view.width,
        this._entityConfig.app.view.height
      );
      bg.endFill();

      bg.interactive = true;

      this.container.addChild(bg);
    }

    {
      // Make loading animation
      const loadingText = new PIXI.Text("Loading", {
        fontSize: 75,
        fill: 0xffffff,
      });
      loadingText.anchor.set(0.5);
      loadingText.position.set(
        this._entityConfig.app.view.width / 2,
        this._entityConfig.app.view.height / 2
      );
      this.container.addChild(loadingText);
    }

    this._entityConfig.container.addChild(this.container);

    this.videoElement = document.createElement("video");
    this.videoElement.innerHTML += `<source src="${this.videoURL}">`;
    this.videoElement.setAttribute("crossorigin", "anonymous");
    this.videoElement.loop = this._options.loop;
    this.videoElement.currentTime = 0;

    this.videoSprite = null;

    // videoElement.play() might not return a promise on older browsers
    Promise.resolve(this.videoElement.play()).then(() => {
      // Including a slight delay seems to workaround a bug affecting Firefox
      window.setTimeout(() => this._startVideo(), 100);
    });
  }

  _update(frameInfo: FrameInfo) {
    if (this.videoElement.ended) this._transition = makeTransition();
  }

  _onSignal(frameInfo: FrameInfo, signal: string, data?: any) {
    if (signal === "pause") {
      this.videoElement.pause();
    } else if (signal === "play") {
      this.videoElement.play();
    }
  }

  teardown(frameInfo: FrameInfo) {
    this.videoElement.pause();
    this.videoSprite = null;
    this._entityConfig.container.removeChild(this.container);
    this.container = null;

    super.teardown(frameInfo);
  }

  _startVideo() {
    //@ts-ignore
    const videoResource = new PIXI.resources.VideoResource(this.videoElement);
    //@ts-ignore
    this.videoSprite = PIXI.Sprite.from(videoResource);
    this.videoSprite.scale.set(this._options.scale);
    this.container.addChild(this.videoSprite);
  }
}

/** 
  Creates a toggle switch that has different textures in the "off" and "on" positions.
*/
export class ToggleSwitch extends EntityBase {
  public container: PIXI.Container;
  public spriteOn: PIXI.Sprite;
  public spriteOff: PIXI.Sprite;
  public position: PIXI.Point;
  public onTexture: PIXI.Texture;
  public offTexture: PIXI.Texture;
  public isOn: boolean;

  constructor(options: any) {
    super();

    util.setupOptions(this, options, {
      onTexture: util.REQUIRED_OPTION,
      offTexture: util.REQUIRED_OPTION,
      isOn: false,
      position: new PIXI.Point(),
    });
  }

  setup(
    frameInfo: FrameInfo,
    entityConfig: any,
    enteringTransition: Transition
  ) {
    super.setup(frameInfo, entityConfig, enteringTransition);

    this.container = new PIXI.Container();
    this.container.position.copyFrom(this.position);

    this.spriteOn = new PIXI.Sprite(this.onTexture);
    this.spriteOn.interactive = true;
    this._on(this.spriteOn, "pointertap", this._turnOff);
    this.container.addChild(this.spriteOn);

    this.spriteOff = new PIXI.Sprite(this.offTexture);
    this.spriteOff.interactive = true;
    this._on(this.spriteOff, "pointertap", this._turnOn);
    this.container.addChild(this.spriteOff);

    this._updateVisibility();

    this._entityConfig.container.addChild(this.container);
  }

  teardown(frameInfo: FrameInfo) {
    this._entityConfig.container.removeChild(this.container);

    super.teardown(frameInfo);
  }

  setIsOn(isOn: boolean, silent = false) {
    this.isOn = isOn;
    this._updateVisibility();

    if (!silent) this.emit("change", this.isOn);
  }

  _turnOff() {
    this.isOn = false;
    this._updateVisibility();
    this.emit("change", this.isOn);
  }

  _turnOn() {
    this.isOn = true;
    this._updateVisibility();
    this.emit("change", this.isOn);
  }

  _updateVisibility() {
    this.spriteOn.visible = this.isOn;
    this.spriteOff.visible = !this.isOn;
  }
}

/** 
  Manages an animated sprite in PIXI, pausing the sprite during pauses.

  When the animation completes (if the animation is not set to loop, then this will request a transition)

 Emits:
 - beforeTearDown
*/
export class AnimatedSpriteEntity extends EntityBase {
  constructor(
    public readonly sprite: PIXI.AnimatedSprite,
    public options?: {
      resetFrame?: boolean;
      transitionOnComplete?: boolean | (() => any);
    }
  ) {
    super();
    this.options = this.options ?? {};
    this.options.resetFrame = this.options?.resetFrame ?? true;
    this.options.transitionOnComplete =
      this.options?.transitionOnComplete ?? true;
  }

  _setup() {
    // No warning
    this.sprite.autoUpdate = false;

    if (this.sprite.onComplete)
      console.warn(
        "Warning: overwriting this.sprite.onComplete value:",
        this._onAnimationComplete.bind(this)
      );
    this.sprite.onComplete = this._onAnimationComplete.bind(this);

    if (!this._entityConfig.container.children.includes(this.sprite))
      this._entityConfig.container.addChild(this.sprite);

    if (this.options.resetFrame) this.sprite.gotoAndPlay(0);
    else this.sprite.play();
  }

  _update(frameInfo: FrameInfo) {
    this.sprite.update(frameInfo.timeScale);
  }

  onSignal(frameInfo: FrameInfo, signal: string, data?: any) {
    switch (signal) {
      case "pause":
        this.sprite.stop();
        break;
      case "play":
        this.sprite.play();
        break;
    }
  }

  _teardown(frameInfo: FrameInfo) {
    this.sprite.stop();
    this.sprite.onComplete = null;
    if (this.options.resetFrame)
      this._entityConfig.container.removeChild(this.sprite);
  }

  private _onAnimationComplete() {
    if (this.options.transitionOnComplete === true) {
      this._transition = makeTransition();
    } else if (this.options.transitionOnComplete) {
      this.options.transitionOnComplete();
    }
  }
}

export class DisplayObjectEntity<
  Type extends PIXI.DisplayObject = PIXI.DisplayObject
> extends EntityBase {
  constructor(public readonly displayObject: Type) {
    super();
  }

  _setup() {
    this._entityConfig.container.addChild(this.displayObject);
  }

  _teardown() {
    this._entityConfig.container.removeChild(this.displayObject);
  }
}

export class SkipButtonOptions {
  position: PIXI.IPointData;
}

export class SkipButton extends EntityBase {
  public sprite: PIXI.Sprite;

  private _options: SkipButtonOptions;

  constructor(options?: Partial<SkipButtonOptions>) {
    super();

    this._options = util.fillInOptions(options, new SkipButtonOptions());
  }

  setup(
    frameInfo: FrameInfo,
    entityConfig: EntityConfig,
    enteringTransition: Transition
  ) {
    super.setup(frameInfo, entityConfig, enteringTransition);

    this.sprite = new PIXI.Sprite(
      this._entityConfig.app.loader.resources[
        this._entityConfig.directives.graphics.skip
      ].texture
    );
    this.sprite.anchor.set(0.5);

    if (this._options.position) {
      this.sprite.position.copyFrom(this._options.position);
    } else {
      this.sprite.position.set(
        this._entityConfig.app.screen.width - 50,
        this._entityConfig.app.screen.height - 50
      );
    }

    this.sprite.interactive = true;
    this._on(this.sprite, "pointertap", this._onSkip);

    this._entityConfig.container.addChild(this.sprite);
  }

  teardown(frameInfo: FrameInfo) {
    this._entityConfig.container.removeChild(this.sprite);

    super.teardown(frameInfo);
  }

  _onSkip() {
    this._transition = makeTransition("skip");
    this.emit("skip");
  }
}

/**
  Similar in spirit to ParallelEntity, but does not hold onto entities that have completed. 
  Instead, entities that have completed are removed after teardown 
*/
export class DeflatingEntity extends EntityBase {
  public entities: Entity[] = [];
  public autoTransition: boolean;

  /** Options include:
        autoTransition: If true, requests transition when the entity has no children (default true)
  */
  constructor(options: any = {}) {
    super();

    util.setupOptions(this, options, {
      autoTransition: true,
    });
  }

  setup(
    frameInfo: FrameInfo,
    entityConfig: any,
    enteringTransition: Transition
  ) {
    super.setup(frameInfo, entityConfig, enteringTransition);

    for (const entity of this.entities) {
      if (!entity.isSetup) {
        entity.setup(frameInfo, entityConfig, makeTransition());
      }
    }
  }

  update(frameInfo: FrameInfo) {
    super.update(frameInfo);

    // Slightly complicated for-loop so that we can remove entities that are complete
    for (let i = 0; i < this.entities.length; ) {
      const entity = this.entities[i];
      entity.update(frameInfo);

      if (entity.transition) {
        console.debug("Cleanup up child entity", entity);

        if (entity.isSetup) {
          entity.teardown(frameInfo);
        }

        this.entities.splice(i, 1);
      } else {
        i++;
      }
    }

    if (this.autoTransition && this.entities.length == 0) {
      this._transition = makeTransition();
    }
  }

  teardown(frameInfo: FrameInfo) {
    for (const entity of this.entities) {
      entity.teardown(frameInfo);
    }

    super.teardown(frameInfo);
  }

  onSignal(frameInfo: FrameInfo, signal: string, data?: any) {
    super.onSignal(frameInfo, signal, data);

    for (const entity of this.entities) {
      entity.onSignal(frameInfo, signal, data);
    }
  }

  addEntity(entity: Entity) {
    // If we have already been setup, setup this new entity
    if (this.isSetup && !entity.isSetup) {
      entity.setup(this._lastFrameInfo, this._entityConfig, makeTransition());
    }

    this.entities.push(entity);
  }

  removeEntity(entity: Entity) {
    const index = this.entities.indexOf(entity);
    if (index === -1) throw new Error("Cannot find entity to remove");

    if (entity.isSetup) {
      entity.teardown(this._lastFrameInfo);
    }

    this.entities.splice(index, 1);
  }
}

/**
 * Does not request a transition until done() is called with a given transition
 */
export class Block extends EntityBase {
  done(transition = makeTransition()) {
    this._transition = transition;
  }
}

/**
 * Executes a function once and requests a transition equal to its value.
 */
export class Decision extends EntityBase {
  constructor(private f: () => Transition | undefined) {
    super();
  }

  _setup() {
    this._transition = this.f();
  }
}

/**
 * Waits for an event to be delivered, and decides to request a transition depending on the event value.
 * @handler is a function of the event arguments, and should return either a transition or a boolean as to whether to transition or not
 */
export class WaitForEvent extends EntityBase {
  constructor(
    public emitter: PIXI.utils.EventEmitter,
    public eventName: string,
    public handler: (...args: any) => Transition | boolean = _.constant(true)
  ) {
    super();
  }

  _setup() {
    this._on(this.emitter, this.eventName, this._handleEvent);
  }

  _handleEvent(...args: any) {
    const result = this.handler(...args);
    if (!result) return;

    if (_.isObject(result)) {
      this._transition = result;
    } else {
      // result is true
      this._transition = makeTransition();
    }
  }
}

export interface AlternativeEntityContext extends EntityContext {
  transition?: Transition;
}

/**
 *  Entity that requests a transition as soon as one of it's children requests one
 */
export class Alternative extends CompositeEntity {
  private readonly entityContexts: AlternativeEntityContext[];

  // transition defaults to the string version of the index in the array (to avoid problem of 0 being considered as falsy)
  constructor(entityContexts: AlternativeEntityContext[]) {
    super();

    // Set default transition as the string version of the index in the array (to avoid problem of 0 being considered as falsy)
    this.entityContexts = _.map(entityContexts, (entityContext, key) =>
      _.defaults({}, entityContext, {
        transition: key.toString(),
      })
    );
  }

  _setup(frameInfo: FrameInfo) {
    for (const entityContext of this.entityContexts) {
      this._activateChildEntity(entityContext.entity, {
        config: entityContext.config,
      });
    }

    this._checkForTransition();
  }

  _update(frameInfo: FrameInfo) {
    this._checkForTransition();
  }

  private _checkForTransition(): void {
    for (let i = 0; i < this.entityContexts.length; i++) {
      if (this._childEntities[i].transition) {
        this._transition = this.entityContexts[i].transition;
        break;
      }
    }
  }
}
