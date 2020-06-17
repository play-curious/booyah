import * as PIXI from "pixi.js";

import _ from "underscore";
import * as util from "./util";
import * as booyah from "./booyah";

export interface IEventListener {
  emitter: PIXI.utils.EventEmitter;
  event: string;
  cb: () => any;
}

export interface Transition {
  readonly name: string;
  readonly params: {};
}

export function makeTransition(name = "default", params = {}) {
  return { name, params };
}

export type EntityConfig = {
  container: PIXI.Container;
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

export interface FrameInfo {
  playTime: number;
  timeSinceStart: number;
  timeSinceLastFrame: number;
  timeScale: number;
  gameState: booyah.GameState;
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
 If the entity wishes to be terminated, it should set this.transition to a truthy value.
 Typical options include { playTime, timeSinceStart, timeSinceLastFrame, timeScale, gameState }
 For more complicated transitions, it can return an object like { name: "", params: {} }
 4. teardown() is called just once.
 The entity should remove any changes it made, such as adding display objects to the scene, or subscribing to events.

 The base class will check that this lifecyle is respected, and will log errors to signal any problems.

 In the case that, subclasses do not need to override these methods, but override the underscore versions of them: _setup(), _update(), etc.
 This ensures that the base class behavior of will be called automatically.
 */
export abstract class Entity extends PIXI.utils.EventEmitter {
  public isSetup = false;
  public eventListeners: IEventListener[] = [];
  public transition: Transition;
  public entityConfig: EntityConfig;
  public lastFrameInfo: FrameInfo;

  public setup(frameInfo: FrameInfo, entityConfig: EntityConfig): void {
    if (this.isSetup) {
      console.error("setup() called twice", this);
      console.trace();
    }

    this.entityConfig = entityConfig;
    this.lastFrameInfo = frameInfo;
    this.isSetup = true;
    this.transition = null;

    this._setup(frameInfo, entityConfig);
  }

  public update(frameInfo: FrameInfo): void {
    if (!this.isSetup) {
      console.error("update() called before setup()", this);
      console.trace();
    }

    this.lastFrameInfo = frameInfo;
    this._update(frameInfo);
  }

  public teardown(frameInfo: FrameInfo): void {
    if (!this.isSetup) {
      console.error("teardown() called before setup()", this);
      console.trace();
    }

    this.lastFrameInfo = frameInfo;
    this._teardown(frameInfo);

    this._off(); // Remove all event listeners

    this.entityConfig = null;
    this.isSetup = false;
  }

  public onSignal(frameInfo: FrameInfo, signal: string, data?: any): void {
    if (!this.entityConfig) {
      console.error("onSignal() called before setup()", this);
    }

    this.lastFrameInfo = frameInfo;
    this._onSignal(frameInfo, signal, data);
  }

  protected _on(
    emitter: PIXI.utils.EventEmitter,
    event: string,
    cb: () => void
  ): void {
    this.eventListeners.push({ emitter, event, cb });
    emitter.on(event, cb, this);
  }

  // if @cb is null, will remove all event listeners for the given emitter and event
  protected _off(
    emitter?: PIXI.utils.EventEmitter,
    event?: string,
    cb?: () => void
  ): void {
    const props: IEventListener = {
      emitter,
      event,
      cb,
    };

    const [listenersToRemove, listenersToKeep] = _.partition(
      this.eventListeners,
      props as any
    );
    for (const listener of listenersToRemove)
      listener.emitter.off(listener.event, listener.cb, this);

    this.eventListeners = listenersToKeep;
  }

  public _setup(frameInfo: FrameInfo, entityConfig: EntityConfig) {}
  public _update(frameInfo: FrameInfo) {}
  public _teardown(frameInfo: FrameInfo) {}
  public _onSignal(frameInfo: FrameInfo, signal: string, data?: any) {}
}

/** Empty class just to indicate an entity that does nothing and never requests a transition  */
export class NullEntity extends Entity {}

/** An entity that returns the requested transition immediately  */
export class TransitoryEntity extends Entity {
  constructor(readonly requestTransition = makeTransition()) {
    super();
  }

  _setup() {
    this.transition = this.requestTransition;
  }
}

export type EntityFactory = (transition: Transition) => Entity;
export type EntityResolvable = Entity | EntityFactory;

/** Base class for entities that contain other entities */
export abstract class CompositeEntity extends Entity {
  protected childEntities: Entity[];

  public update(frameInfo: FrameInfo): void {
    super.update(frameInfo);

    for (const childEntity of this.childEntities) {
      childEntity.update(frameInfo);
    }
  }

  public teardown(frameInfo: FrameInfo): void {
    for (const childEntity of this.childEntities) {
      this._deactivateEntity(childEntity);
    }

    this.childEntities = [];

    super.teardown(frameInfo);
  }

  public onSignal(frameInfo: FrameInfo, signal: string, data?: any) {
    super.onSignal(frameInfo, signal, data);

    for (const childEntity of this.childEntities) {
      childEntity.onSignal(frameInfo, signal, data);
    }
  }

  protected _activateEntity(
    entityResolvable: EntityResolvable,
    config?: EntityConfigResolvable,
    transition?: Transition
  ): Entity {
    if (!this.isSetup) throw new Error("CompositeEntity is not yet active");

    let entity;
    if (_.isFunction(entityResolvable)) {
      entity = entityResolvable(transition ?? makeTransition());
    } else {
      entity = entityResolvable;
    }

    this.childEntities.push(entity);

    const childConfig = processEntityConfig(this.entityConfig, config);
    entity.setup(this.lastFrameInfo, childConfig);
    return entity;
  }

  protected _deactivateEntity(entity: Entity): void {
    if (!this.isSetup) throw new Error("CompositeEntity is not yet active");

    const index = this.childEntities.indexOf(entity);
    if (index === -1) throw new Error("Cannot find entity to remove");

    if (entity.isSetup) {
      this._deactivateEntity(entity);
    }

    this.childEntities.splice(index, 1);

    entity.teardown(this.lastFrameInfo);
  }
}

export interface EntityContext {
  entity: EntityResolvable;
  config?: EntityConfigResolvable;
}

export function makeEntityContext(
  entity: EntityResolvable,
  config?: EntityConfigResolvable
) {
  return { entity, config };
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
  protected childEntityContexts: ParallelEntityContext[] = [];
  protected contextToEntity = new Map<ParallelEntityContext, Entity>();

  constructor(entityContexts: ParallelEntityContext[] = []) {
    super();

    this.childEntityContexts = entityContexts;
  }

  _setup() {
    for (const entityContext of this.childEntityContexts) {
      if (entityContext.activated)
        this._activateEntity(entityContext.entity, entityContext.config);
    }
  }

  _update() {
    if (!_.some(this.childEntities)) this.transition = makeTransition();
  }

  addEntity(entityContext: ParallelEntityContext) {
    const index = this.childEntityContexts.indexOf(entityContext);
    if (index === -1) throw new Error("Entity context already added");

    this.childEntityContexts.push(entityContext);

    // Automatically activate the child entity
    if (this.isSetup && entityContext.activated) {
      const entity = this._activateEntity(
        entityContext.entity,
        entityContext.config
      );
      this.contextToEntity.set(entityContext, entity);
    }
  }

  removeEntity(entityContext: ParallelEntityContext): void {
    const index = this.childEntityContexts.indexOf(entityContext);
    if (index === -1) throw new Error("Cannot find entity context");

    this.childEntityContexts.splice(index, 1);

    const entity = this.contextToEntity.get(entityContext);
    if (entity) {
      this._deactivateEntity(entity);
      this.contextToEntity.delete(entityContext);
    }
  }

  removeAllEntities(): void {
    for (const entityContext of this.childEntityContexts) {
      this.removeEntity(entityContext);
    }
  }

  activateEntity(entityContext: ParallelEntityContext): void {
    const index = this.childEntityContexts.indexOf(entityContext);
    if (index === -1) throw new Error("Cannot find entity context");

    if (this.contextToEntity.has(entityContext))
      throw new Error("Entity is already activated");

    const entity = this._activateEntity(
      entityContext.entity,
      entityContext.config
    );
    this.contextToEntity.set(entityContext, entity);
    entityContext.activated = true;
  }

  deactivateEntity(entityContext: ParallelEntityContext): void {
    const index = this.childEntityContexts.indexOf(entityContext);
    if (index === -1) throw new Error("Cannot find entity context");

    const entity = this.contextToEntity.get(entityContext);
    if (!entity) throw new Error("Entity not yet activated");

    this._deactivateEntity(entity);
    this.contextToEntity.delete(entityContext);
  }
}

export interface EntitySequenceOptions {
  loop?: boolean;
}

export interface ParallelEntityContext {
  entity: EntityResolvable;
  config?: EntityConfigResolvable;
  activated?: boolean;
}

/**
  Runs one child entity after another. 
  When done, requestes the last transition demanded.
  Optionally can loop back to the first entity.
*/
export class EntitySequence extends CompositeEntity {
  private currentEntityIndex = 0;
  private currentEntity: Entity = null;
  private lastTransition: Transition;

  constructor(
    private entityContexts: EntityContext[],
    private readonly options: EntitySequenceOptions = { loop: false }
  ) {
    super();
  }

  // Does not setup entity
  addEntity(entityContext: EntityContext) {
    this.entityContexts.push(entityContext);
  }

  skip() {
    this._advance(makeTransition("skip"));
  }

  private _switchEntity() {
    if (this.currentEntity) {
      this._deactivateEntity(this.currentEntity);
      this.currentEntity = null;
    }

    if (this.currentEntityIndex < this.entityContexts.length) {
      const entityContext = this.entityContexts[this.currentEntityIndex];
      this.currentEntity = this._activateEntity(
        entityContext.entity,
        entityContext.config
      );
    }
  }

  _setup() {
    this.currentEntityIndex = 0;
    this.currentEntity = null;

    if (this.entityContexts.length === 0) {
      // Empty sequence, stop immediately
      this.transition = makeTransition();
    } else {
      // Start the sequence
      this._switchEntity();
    }
  }

  _update() {
    this.currentEntity.update(this.lastFrameInfo);

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

  _advance(transition: Transition) {
    this.currentEntityIndex++;
    this._switchEntity();

    // If we've reached the end of the sequence, stop
    if (this.currentEntityIndex >= this.entityContexts.length) {
      this.transition = transition;
    }
  }
}

export type StateTable = { [n: string]: EntityContext };

export type TransitionFunction = (transition: Transition) => Transition;
export type TransitionDescriptor = Transition | TransitionFunction;
export type TransitionTable = { [name: string]: TransitionDescriptor };

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
  public startingState: TransitionDescriptor;
  public startingProgress: {};
  public visitedStates: Transition[];
  public progress: {};
  public state: Entity;
  public endingStates: string[];
  public stateParams: {};
  private lastTransition: Transition;

  constructor(
    public states: StateTable,
    public transitions: TransitionTable,
    options = {}
  ) {
    super();

    util.setupOptions(this, options, {
      startingState: makeTransition("start"),
      endingStates: ["end"],
      startingProgress: {},
    });
  }

  setup(frameInfo: FrameInfo, entityConfig: EntityConfig) {
    super.setup(frameInfo, entityConfig);

    this.visitedStates = [];
    this.progress = util.cloneData(this.startingProgress);

    const startingState = _.isFunction(this.startingState)
      ? this.startingState(makeTransition())
      : this.startingState;
    this._changeState(startingState);
  }

  _update() {
    if (!this.state) return;

    const transition = this.state.transition;
    if (transition) {
      let nextStateDescriptor: Transition;
      // The transition could directly be the name of another state
      if (!(transition.name in this.transitions)) {
        if (transition.name in this.states) {
          nextStateDescriptor = transition;
        } else {
          throw new Error(
            `Cannot find transition for state '${transition.name}'`
          );
        }
      } else {
        const transitionDescriptor = this.transitions[transition.name];
        if (_.isFunction(transitionDescriptor)) {
          nextStateDescriptor = transitionDescriptor(transition);
        } else {
          nextStateDescriptor = transitionDescriptor;
        }
      }

      // Unpack the next state
      let nextState: Transition;
      if (!nextStateDescriptor.params) {
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

  _changeState(nextState: Transition) {
    // If reached an ending state, stop here. Teardown can happen later
    if (_.contains(this.endingStates, nextState.name)) {
      this.transition = nextState;
      this.visitedStates.push(nextState);
      return;
    }

    if (this.state) {
      this._deactivateEntity(this.state);
      this.state = null;
    }

    if (nextState.name in this.states) {
      const nextStateContext = this.states[nextState.name];
      this.state = this._activateEntity(
        nextStateContext.entity,
        nextStateContext.config
      );
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
export class FunctionalEntity extends ParallelEntity {
  // @functions is an object, with keys: setup, update, teardown, onSignal
  constructor(
    public readonly functions: {
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
      ) => Transition | undefined;
    },
    entityContexts: EntityContext[] = []
  ) {
    super(entityContexts);
  }

  _setup() {
    if (this.functions.setup)
      this.functions.setup(this.lastFrameInfo, this.entityConfig, this);
  }

  _update() {
    if (this.functions.update) this.functions.update(this.lastFrameInfo, this);
    if (this.functions.requestTransition) {
      this.transition = this.functions.requestTransition(
        this.lastFrameInfo,
        this
      );
    }
  }

  _teardown(frameInfo: FrameInfo) {
    if (this.functions.teardown)
      this.functions.teardown(this.lastFrameInfo, this);
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
export class FunctionCallEntity extends Entity {
  constructor(public f: (arg: any) => any, public that: any) {
    super();
    this.that = that && this;
  }

  _setup() {
    this.f.call(this.that);

    this.transition = makeTransition();
  }
}

// Waits until time is up, then requests transition
export class WaitingEntity extends Entity {
  /** @wait is in milliseconds */
  constructor(public wait: number) {
    super();
  }

  _update(frameInfo: FrameInfo) {
    if (frameInfo.timeSinceStart >= this.wait) {
      this.transition = makeTransition();
    }
  }
}

/**
  An entity that creates a new PIXI container in the setup entityConfig for it's children, and manages the container. 
*/
export class ContainerEntity extends ParallelEntity {
  public oldConfig: any;
  public newConfig: any;
  public container: PIXI.Container;

  constructor(entities: ParallelEntityContext[] = [], public name?: string) {
    super(entities);
  }

  setup(frameInfo: FrameInfo, entityConfig: EntityConfig) {
    this.oldConfig = entityConfig;

    this.container = new PIXI.Container();
    this.container.name = this.name;
    this.oldConfig.container.addChild(this.container);

    this.newConfig = _.extend({}, entityConfig, {
      container: this.container,
    });

    super.setup(frameInfo, this.newConfig);
  }

  teardown(frameInfo: FrameInfo) {
    super.teardown(frameInfo);

    this.oldConfig.container.removeChild(this.container);
  }
}

/**
  Manages a video asset. Can optionally loop the video.
  Asks for a transition when the video has ended.
*/
export class VideoEntity extends Entity {
  public container: PIXI.Container;
  public videoElement: any;
  public videoSprite: any;
  public loop: boolean;

  constructor(public videoName: string, options: any = {}) {
    super();

    util.setupOptions(this, options, {
      loop: false,
    });
  }

  _setup(frameInfo: FrameInfo, entityConfig: EntityConfig) {
    // This container is used so that the video is inserted in the right place,
    // even if the sprite isn't added until later.
    this.container = new PIXI.Container();
    this.entityConfig.container.addChild(this.container);

    this.videoElement = this.entityConfig.videoAssets[this.videoName];
    this.videoElement.loop = this.loop;
    this.videoElement.currentTime = 0;

    this.videoSprite = null;

    // videoElement.play() might not return a promise on older browsers
    Promise.resolve(this.videoElement.play()).then(() => {
      // Including a slight delay seems to workaround a bug affecting Firefox
      window.setTimeout(() => this._startVideo(), 100);
    });
  }

  _update(frameInfo: FrameInfo) {
    if (this.videoElement.ended) this.transition = makeTransition();
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
    this.entityConfig.container.removeChild(this.container);
    this.container = null;

    super.teardown(frameInfo);
  }

  _startVideo() {
    const videoResource = new PIXI.resources.VideoResource(this.videoElement);
    //@ts-ignore
    this.videoSprite = PIXI.Sprite.from(videoResource);
    this.container.addChild(this.videoSprite);
  }
}

/** 
  Creates a toggle switch that has different textures in the "off" and "on" positions.
*/
export class ToggleSwitch extends Entity {
  public container: PIXI.Container;
  public spriteOn: PIXI.Sprite;
  public spriteOff: PIXI.Sprite;
  public position: PIXI.IPoint;
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

  setup(frameInfo: FrameInfo, entityConfig: any) {
    super.setup(frameInfo, entityConfig);

    this.container = new PIXI.Container();
    this.container.position = this.position;

    this.spriteOn = new PIXI.Sprite(this.onTexture);
    this.spriteOn.interactive = true;
    this._on(this.spriteOn, "pointertap", this._turnOff);
    this.container.addChild(this.spriteOn);

    this.spriteOff = new PIXI.Sprite(this.offTexture);
    this.spriteOff.interactive = true;
    this._on(this.spriteOff, "pointertap", this._turnOn);
    this.container.addChild(this.spriteOff);

    this._updateVisibility();

    this.entityConfig.container.addChild(this.container);
  }

  teardown(frameInfo: FrameInfo) {
    this.entityConfig.container.removeChild(this.container);

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
*/
export class AnimatedSpriteEntity extends Entity {
  constructor(public animatedSprite: PIXI.AnimatedSprite) {
    super();
  }

  _setup() {
    if (this.animatedSprite.onComplete)
      console.warn("Warning: overwriting this.animatedSprite.onComplete");
    this.animatedSprite.onComplete = this._onAnimationComplete.bind(this);

    this.entityConfig.container.addChild(this.animatedSprite);
    this.animatedSprite.gotoAndPlay(0);
  }

  onSignal(frameInfo: FrameInfo, signal: string, data?: any) {
    if (signal == "pause") this.animatedSprite.stop();
    else if (signal == "play") this.animatedSprite.play();
  }

  _teardown(frameInfo: FrameInfo) {
    this.animatedSprite.stop();
    this.animatedSprite.onComplete = null;
    this.entityConfig.container.removeChild(this.animatedSprite);
  }

  _onAnimationComplete() {
    this.transition = makeTransition();
  }
}

export class SkipButton extends Entity {
  public sprite: PIXI.Sprite;

  setup(frameInfo: FrameInfo, entityConfig: EntityConfig) {
    super.setup(frameInfo, entityConfig);

    this.sprite = new PIXI.Sprite(
      this.entityConfig.app.loader.resources[
        this.entityConfig.directives.graphics.skip as number
      ].texture
    );
    this.sprite.anchor.set(0.5);
    this.sprite.position.set(
      this.entityConfig.app.screen.width - 50,
      this.entityConfig.app.screen.height - 50
    );
    this.sprite.interactive = true;
    this._on(this.sprite, "pointertap", this._onSkip);

    this.entityConfig.container.addChild(this.sprite);
  }

  teardown(frameInfo: FrameInfo) {
    this.entityConfig.container.removeChild(this.sprite);

    super.teardown(frameInfo);
  }

  _onSkip() {
    this.transition = makeTransition("skip");
    this.emit("skip");
  }
}

/**
  Similar in spirit to ParallelEntity, but does not hold onto entities that have completed. 
  Instead, entities that have completed are removed after teardown 
*/
export class DeflatingEntity extends Entity {
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

  setup(frameInfo: FrameInfo, entityConfig: any) {
    super.setup(frameInfo, entityConfig);

    for (const entity of this.entities) {
      if (!entity.isSetup) {
        entity.setup(frameInfo, entityConfig);
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
      this.transition = makeTransition();
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
      entity.setup(this.lastFrameInfo, this.entityConfig);
    }

    this.entities.push(entity);
  }

  removeEntity(entity: Entity) {
    const index = this.entities.indexOf(entity);
    if (index === -1) throw new Error("Cannot find entity to remove");

    if (entity.isSetup) {
      entity.teardown(this.lastFrameInfo);
    }

    this.entities.splice(index, 1);
  }
}

/**
 * Does not request a transition until done() is called with a given transition
 */
export class Block extends Entity {
  done(transition = makeTransition()) {
    this.transition = transition;
  }
}

/**
 * Executes a function once and requests a transition equal to its value.
 */
export class Decision extends Entity {
  constructor(private f: () => Transition | undefined) {
    super();
  }

  _setup() {
    this.transition = this.f();
  }
}

/**
 * Waits for an event to be delivered, and decides to request a transition depending on the event value.
 * @handler is a function of the event arguments, and should return a transition (or false if no transition)
 */
export class WaitForEvent extends Entity {
  constructor(
    public emitter: PIXI.utils.EventEmitter,
    public eventName: string,
    public handler: (...args: any) => Transition = _.constant(makeTransition())
  ) {
    super();
  }

  _setup() {
    this._on(this.emitter, this.eventName, this._handleEvent);
  }

  _handleEvent(...args: any) {
    this.transition = this.handler(...args);
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
      this._activateEntity(entityContext.entity, entityContext.config);
    }

    this._checkForTransition();
  }

  _update(frameInfo: FrameInfo) {
    this._checkForTransition();
  }

  private _checkForTransition(): void {
    for (let i = 0; i < this.entityContexts.length; i++) {
      if (this.childEntities[i].transition) {
        this.transition = this.entityContexts[i].transition;
        break;
      }
    }
  }
}
