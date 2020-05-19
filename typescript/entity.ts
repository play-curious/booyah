import _ from "underscore";
import * as util from "./util";
import { Directives, GameState, PlayOptions } from "./booyah";

export interface IEventListener {
  emitter: PIXI.utils.EventEmitter;
  event: string;
  cb: () => any;
}

export interface TransitionResolvable {
  name: string;
  params: any;
}

export type EntityConfig = { [k: string]: any };

export interface FrameInfo {
  playTime: number;
  timeSinceStart: number;
  timeSinceLastFrame: number;
  timeScale: number;
  gameState: GameState;
}

/**
 In Booyah, the game is structured as a tree of entities. This is the base class for all entities.

 An entity has the following lifecycle:
 1. It is instantiated using the contructor.
 Only parameters specific to the entity should be passed here.
 The entity should not make any changes to the environment here, it should wait for setup().
 2. setup() is called just once, with a configuration.
 This is when the entity should add dispaly objects  to the scene, or subscribe to events.
 The typical config contains { app, preloader, narrator, jukebox, container }
 3. update() is called one or more times, with options.
 It could also never be called, in case the entity is torn down directly.
 If the entity wishes to be terminated, it should set this.requestedTransition to a truthy value.
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
  public requestedTransition: any;
  public config: EntityConfig;

  public setup(config: EntityConfig): void {
    if (this.isSetup) {
      console.error("setup() called twice", this);
      console.trace();
    }

    this.config = config;
    this.isSetup = true;
    this.requestedTransition = null;

    this._setup(config);
  }

  public update(options: FrameInfo): void {
    if (!this.isSetup) {
      console.error("update() called before setup()", this);
      console.trace();
    }

    this._update(options);
  }

  public teardown(options?: any): void {
    if (!this.isSetup) {
      console.error("teardown() called before setup()", this);
      console.trace();
    }

    this._teardown(options);

    this._off(); // Remove all event listeners

    this.config = null;
    this.isSetup = false;
  }

  public onSignal(signal: string, data?: any): void {
    if (!this.config) {
      console.error("onSignal() called before setup()", this);
    }

    this._onSignal(signal, data);
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

  public _setup(config: any) {}
  public _update(options: any) {}
  public _teardown(options?: any) {}
  public _onSignal(signal: string, data?: any) {}

  public static processEntityConfig(config: any, alteredConfig: any): any {
    if (!alteredConfig) return config;
    if (typeof alteredConfig == "function") return alteredConfig(config);
    return alteredConfig;
  }

  public static extendConfig(values: any[]): (config: any) => {} {
    return (config) => _.extend({}, config, values);
  }
}

/** Empty class just to indicate an entity that does nothing and never requests a transition  */
export class NullEntity extends Entity {}

/** An entity that returns the requested transition immediately  */
export class TransitoryEntity extends Entity {
  constructor(public transition = true) {
    super();
  }

  _setup() {
    this.requestedTransition = this.transition;
  }
}

export interface ParallelEntityOptions {
  autoTransition?: boolean;
}

/**
 Allows a bunch of entities to execute in parallel.
 Updates child entities until they ask for a transition, at which point they are torn down.
 If autoTransition=true, requests a transition when all child entities have completed.
 */
export class ParallelEntity extends Entity {
  public entities: Entity[] = [];
  public entityConfigs: EntityConfig[] = [];
  public entityIsActive: boolean[] = [];
  public autoTransition: boolean = false;
  /**
   @entities can be subclasses of entity.Entity or an object like { entity:, config: }
   @options:
   * autoTransition: Should the entity request a transition when all the child entities are done?  (defaults to false)
   */
  constructor(entities: any[] = [], options: ParallelEntityOptions = {}) {
    super();

    util.setupOptions(this, options, {
      autoTransition: false,
    });

    for (const currentEntity of entities) {
      if (currentEntity instanceof Entity) {
        this.addEntity(currentEntity);
      } else {
        this.addEntity(currentEntity.entity, currentEntity.config);
      }
    }
  }

  setup(config: any) {
    super.setup(config);

    for (let i = 0; i < this.entities.length; i++) {
      const entity = this.entities[i];
      if (!entity.isSetup) {
        const entityConfig = ParallelEntity.processEntityConfig(
          this.config,
          this.entityConfigs[i]
        );
        entity.setup(entityConfig);
      }

      this.entityIsActive[i] = true;
    }
  }

  update(options: any) {
    super.update(options);

    for (let i = 0; i < this.entities.length; i++) {
      if (this.entityIsActive[i]) {
        const entity = this.entities[i];

        entity.update(options);

        if (entity.requestedTransition) {
          entity.teardown();

          this.entityIsActive[i] = false;
        }
      }
    }

    if (this.autoTransition && !_.some(this.entityIsActive))
      this.requestedTransition = true;
  }

  teardown() {
    for (let i = 0; i < this.entities.length; i++) {
      if (this.entityIsActive[i]) {
        this.entities[i].teardown();
        this.entityIsActive[i] = false;
      }
    }

    super.teardown();
  }

  onSignal(signal: string, data?: any) {
    super.onSignal(signal, data);

    for (let i = 0; i < this.entities.length; i++) {
      if (this.entityIsActive[i]) this.entities[i].onSignal(signal, data);
    }
  }

  // If config is provided, it will overload the config provided to this entity by setup()
  addEntity(entity: Entity, config: any = null) {
    this.entities.push(entity);
    this.entityConfigs.push(config);
    this.entityIsActive.push(true);

    // If we have already been setup, setup this new entity
    if (this.isSetup && !entity.isSetup) {
      const entityConfig = ParallelEntity.processEntityConfig(
        this.config,
        config
      );
      entity.setup(entityConfig);
    }
  }

  removeEntity(entity: Entity): void {
    const index = this.entities.indexOf(entity);
    if (index === -1) throw new Error("Cannot find entity to remove");

    if (entity.isSetup) {
      entity.teardown();
    }

    this.entities.splice(index, 1);
    this.entityConfigs.splice(index, 1);
    this.entityIsActive.splice(index, 1);
  }

  removeAllEntities(): void {
    for (const entity of this.entities) {
      if (entity.isSetup) {
        entity.teardown();
      }

      this.entities = [];
      this.entityConfigs = [];
      this.entityIsActive = [];
    }
  }
}

export interface EntitySequenceOptions {
  loop?: boolean;
}

/**
  Runs one child entity after another. 
  When done, requestes the last transition demanded.
  Optionally can loop back to the first entity.
*/
export class EntitySequence extends Entity implements EntitySequenceOptions {
  public loop: boolean;
  public currentEntityIndex = 0;
  public currentEntity: Entity = null;
  public lastUpdateOptions: any;
  public lastRequestedTransition: any;
  public childStartedAt: number;

  constructor(public entities: Entity[], options: EntitySequenceOptions = {}) {
    super();
    this.loop = !!options.loop;
  }

  // Does not setup entity
  addEntity(entity: Entity) {
    if (this.requestedTransition) return;

    this.entities.push(entity);
  }

  skip() {
    if (this.requestedTransition) return;

    this._advance({ name: "skip" });
  }

  setup(config: any) {
    super.setup(config);

    this.currentEntityIndex = 0;
    this.currentEntity = null;

    this._activateEntity(0);
  }

  update(options: any) {
    super.update(options);

    if (this.lastRequestedTransition) return;

    const timeSinceChildStart = options.timeSinceStart - this.childStartedAt;
    const childOptions = _.extend({}, options, {
      timeSinceStart: timeSinceChildStart,
    });

    this.lastUpdateOptions = options;

    if (this.currentEntityIndex >= this.entities.length) return;

    this.currentEntity.update(childOptions);

    const transition = this.currentEntity.requestedTransition;
    if (transition) this._advance(transition);
  }

  teardown() {
    this._deactivateEntity();

    super.teardown();
  }

  onSignal(signal: string, data?: any) {
    if (this.requestedTransition) return;

    super.onSignal(signal, data);

    this.currentEntity.onSignal(signal, data);

    if (signal === "reset") this.restart();
  }

  restart() {
    this._deactivateEntity();

    this.currentEntityIndex = 0;
    this.requestedTransition = false;

    this._activateEntity(0);
  }

  _activateEntity(time: number) {
    const entityDescriptor = this.entities[this.currentEntityIndex];
    if (_.isFunction(entityDescriptor)) {
      this.currentEntity = entityDescriptor(this);
    } else {
      this.currentEntity = entityDescriptor;
    }

    this.currentEntity.setup(this.config);
    this.childStartedAt = time;
  }

  _deactivateEntity() {
    if (this.currentEntity && this.currentEntity.isSetup)
      this.currentEntity.teardown();
  }

  _advance(transition: any) {
    if (this.currentEntityIndex < this.entities.length - 1) {
      this._deactivateEntity();
      this.currentEntityIndex = this.currentEntityIndex + 1;
      this._activateEntity(this.lastUpdateOptions.timeSinceStart);
    } else if (this.loop) {
      this._deactivateEntity();
      this.currentEntityIndex = 0;
      this._activateEntity(this.lastUpdateOptions.timeSinceStart);
    } else {
      this._deactivateEntity();
      this.requestedTransition = transition;
    }
  }
}

/** 
  Represents a state machine, where each state has a name, and is represented by an entity.
  Only one state is active at a time. 
  The state machine has one starting state, but can have multiple ending states.
  When the machine reaches an ending state, it requests a transition with a name equal to the name of the ending state.
  By default, the state machine begins at the state called "start", and stops at "end".

  The transitions are not provided directly by the states (entities) by rather by a transition table provided in the constructor.
  A transition is defined as either a name (string) or { name, params }. 
  To use have a transition table within a transition table, use the function makeTransitionTable()
*/
export class StateMachine extends Entity {
  public startingStateParams: any;
  public startingState: any;
  public startingProgress: any;
  public visitedStates: any;
  public progress: any;
  public state: Entity;
  public stateName: string;
  public sceneStartedAt: number;
  public endingStates: any;
  public stateParams: {};

  constructor(
    public states: { [n: string]: Entity },
    public transitions: { [k: string]: TransitionResolvable },
    options: any = {}
  ) {
    super();

    util.setupOptions(this, options, {
      startingState: "start",
      endingStates: ["end"],
      startingStateParams: {},
      startingProgress: {},
    });
  }

  setup(config: EntityConfig) {
    super.setup(config);

    this.visitedStates = [];
    this.progress = util.cloneData(this.startingProgress);

    const startingState = _.isFunction(this.startingState)
      ? this.startingState()
      : this.startingState;
    const startingStateParams = _.isFunction(this.startingStateParams)
      ? this.startingStateParams()
      : this.startingStateParams;
    this._changeState(0, startingState, startingStateParams);
  }

  update(options: FrameInfo) {
    super.update(options);

    if (!this.state) return;

    const timeSinceStateStart = options.timeSinceStart - this.sceneStartedAt;
    const stateOptions = _.extend({}, options, {
      timeSinceStart: timeSinceStateStart,
    });
    this.state.update(stateOptions);

    const requestedTransition = this.state.requestedTransition;
    if (requestedTransition) {
      // Unpack requested transition
      let requestedTransitionName, requestedTransitionParams;
      if (_.isObject(requestedTransition)) {
        requestedTransitionName = requestedTransition.name;
        requestedTransitionParams = requestedTransition.params;
      } else {
        requestedTransitionName = requestedTransition;
      }

      let nextStateDescriptor;
      // The transition could directly be the name of another state
      if (
        _.isString(requestedTransitionName) &&
        requestedTransitionName in this.states &&
        !(this.stateName in this.transitions)
      ) {
        nextStateDescriptor = requestedTransition;
      } else if (!(this.stateName in this.transitions)) {
        throw new Error(`Cannot find transition for state '${this.stateName}'`);
      } else {
        const transitionDescriptor = this.transitions[this.stateName];
        if (_.isFunction(transitionDescriptor)) {
          nextStateDescriptor = transitionDescriptor(
            requestedTransitionName,
            requestedTransitionParams,
            this
          );
        } else if (_.isString(transitionDescriptor)) {
          nextStateDescriptor = transitionDescriptor;
        } else {
          throw new Error(
            `Cannot decode transition descriptor '${JSON.stringify(
              transitionDescriptor
            )}'`
          );
        }
      }

      // Unpack the next state
      let nextStateName, nextStateParams;
      if (
        _.isObject(nextStateDescriptor) &&
        _.isString(nextStateDescriptor.name)
      ) {
        nextStateName = nextStateDescriptor.name;
        nextStateParams = nextStateDescriptor.params;
      } else if (_.isString(nextStateDescriptor)) {
        nextStateName = nextStateDescriptor;
        nextStateParams = requestedTransition.params; // By default, pass through the params in the requested transition
      } else {
        throw new Error(
          `Cannot decode state descriptor '${JSON.stringify(
            nextStateDescriptor
          )}'`
        );
      }

      this._changeState(options.timeSinceStart, nextStateName, nextStateParams);
    }
  }

  teardown() {
    if (this.state) {
      this.state.teardown();
      this.state = null;
      this.stateName = null;
    }

    super.teardown();
  }

  onSignal(signal: string, data?: any) {
    super.onSignal(signal, data);

    if (this.state) this.state.onSignal(signal, data);
  }

  _changeState(
    timeSinceStart: number,
    nextStateName: string,
    nextStateParams: any
  ) {
    // If reached an ending state, stop here. Teardown can happen later
    if (_.contains(this.endingStates, nextStateName)) {
      this.requestedTransition = nextStateName;
      this.visitedStates.push(nextStateName);
      return;
    }

    if (this.state) {
      this.state.teardown();
    }

    if (nextStateName in this.states) {
      const nextStateDescriptor = this.states[nextStateName];
      if (_.isFunction(nextStateDescriptor)) {
        this.state = nextStateDescriptor(nextStateParams, this);
      } else {
        this.state = nextStateDescriptor;
      }

      this.state.setup(this.config);
    } else {
      throw new Error(`Cannot find state '${nextStateName}'`);
    }

    this.sceneStartedAt = timeSinceStart;

    const previousStateName = this.stateName;
    const previousStateParams = this.stateParams;
    this.stateName = nextStateName;
    this.stateParams = nextStateParams;

    this.visitedStates.push(nextStateName);

    this.emit(
      "stateChange",
      nextStateName,
      nextStateParams,
      previousStateName,
      previousStateParams
    );
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
export function makeTransitionTable(table: { [key: string]: string }) {
  const f = function (
    requestedTransitionName: string,
    requestedTransitionParams: any,
    previousStateName: string,
    previousStateParams: any
  ) {
    if (requestedTransitionName in table) {
      const transitionDescriptor = table[requestedTransitionName];
      if (_.isFunction(transitionDescriptor)) {
        return transitionDescriptor(
          requestedTransitionName,
          requestedTransitionParams,
          previousStateName,
          previousStateParams
        );
      } else {
        return transitionDescriptor;
      }
    } else {
      throw new Error(`Cannot find state ${requestedTransitionName}`);
    }
  };
  f.table = table; // For debugging purposes

  return f;
}

/* Deprecated for most uses. Instead use ParallelEntity */
export class CompositeEntity extends Entity {
  constructor(public entities: Entity[] = []) {
    super();
  }

  public setup(config: any): void {
    super.setup(config);

    for (const entity of this.entities) {
      if (!entity.isSetup) {
        entity.setup(config);
      }
    }
  }

  public update(options: any): void {
    super.update(options);

    for (const entity of this.entities) {
      entity.update(options);
    }

    if (this.entities.length && this.entities[0].requestedTransition) {
      this.requestedTransition = this.entities[0].requestedTransition;
    }
  }

  public teardown(): void {
    for (const entity of this.entities) {
      entity.teardown();
    }

    super.teardown();
  }

  public onSignal(signal: string, data?: any): void {
    super.onSignal(signal, data);

    for (const entity of this.entities) {
      entity.onSignal(signal, data);
    }
  }

  public addEntity(entity: Entity): void {
    // If we have already been setup, setup this new entity
    if (this.isSetup && !entity.isSetup) {
      entity.setup(this.config);
    }

    this.entities.push(entity);
  }

  public removeEntity(entity: Entity): void {
    const index = this.entities.indexOf(entity);
    if (index === -1) throw new Error("Cannot find entity to remove");

    if (entity.isSetup) {
      entity.teardown();
    }

    this.entities.splice(index, 1);
  }
}

/**
  An entity that gets its behavior from functions provided inline in the constructor.
  Useful for small entities that don't require their own class definition.
  Additionally, a function called requestTransition(options, entity), called after update(), can set the requested transition 

  Example usage:
    new FunctionalEntity({
      setup: (config) => console.log("setup", config),
      teardown: () => console.log("teardown"),
    });
*/
export class FunctionalEntity extends ParallelEntity {
  // @functions is an object, with keys: setup, update, teardown, onSignal
  constructor(
    public functions: {
      setup: (config: any, entity: FunctionalEntity) => void;
      update: (options: any, entity: FunctionalEntity) => void;
      teardown: (entity: FunctionalEntity) => void;
      onSignal: (signal: string, data?: any) => void;
      requestTransition?: any;
    },
    childEntities: Entity[] = []
  ) {
    super();

    for (let childEntity of childEntities) this.addEntity(childEntity);
  }

  setup(config: any) {
    super.setup(config);

    if (this.functions.setup) this.functions.setup(config, this);
  }

  update(options: any) {
    super.update(options);

    if (this.functions.update) this.functions.update(options, this);
    if (this.functions.requestTransition) {
      this.requestedTransition = this.functions.requestTransition(
        options,
        this
      );
    }
  }

  teardown() {
    if (this.functions.teardown) this.functions.teardown(this);

    super.teardown();
  }

  onSignal(signal: string, data?: any) {
    super.onSignal(signal, data);

    if (this.functions.onSignal) this.functions.onSignal(signal, data);
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

    this.requestedTransition = true;
  }
}

// Waits until time is up, then requests transition
export class WaitingEntity extends Entity {
  /** @wait is in milliseconds */
  constructor(public wait: number) {
    super();
  }

  _update(options: any) {
    if (options.timeSinceStart >= this.wait) {
      this.requestedTransition = true;
    }
  }
}

/**
  An entity that manages a PIXI DisplayObject, such as a Sprite or Graphics. 
  Useful for automatically adding and removing the DisplayObject to the parent container.
*/
export class DisplayObjectEntity extends Entity {
  constructor(public displayObject: any) {
    super();
  }

  _setup(config: any) {
    this.config.container.addChild(this.displayObject);
  }

  _teardown() {
    this.config.container.removeChild(this.displayObject);
  }
}

/**
  An entity that creates a new PIXI container in the setup config for it's children, and manages the container. 
*/
export class ContainerEntity extends ParallelEntity {
  public oldConfig: any;
  public newConfig: any;
  public container: PIXI.Container;

  constructor(entities: Entity[] = [], public name?: string) {
    super(entities);
  }

  setup(config: any) {
    this.oldConfig = config;

    this.container = new PIXI.Container();
    this.container.name = this.name;
    this.oldConfig.container.addChild(this.container);

    this.newConfig = _.extend({}, config, {
      container: this.container,
    });

    super.setup(this.newConfig);
  }

  teardown() {
    super.teardown();

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

  _setup(config: EntityConfig) {
    // This container is used so that the video is inserted in the right place,
    // even if the sprite isn't added until later.
    this.container = new PIXI.Container();
    this.config.container.addChild(this.container);

    this.videoElement = this.config.videoAssets[this.videoName];
    this.videoElement.loop = this.loop;
    this.videoElement.currentTime = 0;

    this.videoSprite = null;

    // videoElement.play() might not return a promise on older browsers
    Promise.resolve(this.videoElement.play()).then(() => {
      // Including a slight delay seems to workaround a bug affecting Firefox
      window.setTimeout(() => this._startVideo(), 100);
    });
  }

  _update(options: any) {
    if (this.videoElement.ended) this.requestedTransition = true;
  }

  _onSignal(signal: string, data?: any) {
    if (signal === "pause") {
      this.videoElement.pause();
    } else if (signal === "play") {
      this.videoElement.play();
    }
  }

  teardown() {
    this.videoElement.pause();
    this.videoSprite = null;
    this.config.container.removeChild(this.container);
    this.container = null;

    super.teardown();
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

  setup(options: any) {
    super.setup(options);

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

    this.config.container.addChild(this.container);
  }

  teardown() {
    this.config.container.removeChild(this.container);

    super.teardown();
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

    this.config.container.addChild(this.animatedSprite);
    this.animatedSprite.gotoAndPlay(0);
  }

  onSignal(signal: string, data?: any) {
    if (signal == "pause") this.animatedSprite.stop();
    else if (signal == "play") this.animatedSprite.play();
  }

  _teardown() {
    this.animatedSprite.stop();
    this.animatedSprite.onComplete = null;
    this.config.container.removeChild(this.animatedSprite);
  }

  _onAnimationComplete() {
    this.requestedTransition = true;
  }
}

export class SkipButton extends Entity {
  public sprite: PIXI.Sprite;

  setup(config: EntityConfig) {
    super.setup(config);

    this.sprite = new PIXI.Sprite(
      this.config.app.loader.resources[
        this.config.directives.graphics.skip as number
      ].texture
    );
    this.sprite.anchor.set(0.5);
    this.sprite.position.set(
      this.config.app.screen.width - 50,
      this.config.app.screen.height - 50
    );
    this.sprite.interactive = true;
    this._on(this.sprite, "pointertap", this._onSkip);

    this.config.container.addChild(this.sprite);
  }

  teardown() {
    this.config.container.removeChild(this.sprite);

    super.teardown();
  }

  _onSkip() {
    this.requestedTransition = true;
    this.emit("skip");
  }
}

/**
  Similar in spirit to ParallelEntity, but does not hold onto entities that have completed. 
  Instead, entities that have completed are removed after teardown 
*/
export class DeflatingCompositeEntity extends Entity {
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

  setup(config: any) {
    super.setup(config);

    for (const entity of this.entities) {
      if (!entity.isSetup) {
        entity.setup(config);
      }
    }
  }

  update(options: any) {
    super.update(options);

    // Slightly complicated for-loop so that we can remove entities that are complete
    for (let i = 0; i < this.entities.length; ) {
      const entity = this.entities[i];
      entity.update(options);

      if (entity.requestedTransition) {
        console.debug("Cleanup up child entity", entity);

        if (entity.isSetup) {
          entity.teardown();
        }

        this.entities.splice(i, 1);
      } else {
        i++;
      }
    }

    if (this.autoTransition && this.entities.length == 0) {
      this.requestedTransition = true;
    }
  }

  teardown() {
    for (const entity of this.entities) {
      entity.teardown();
    }

    super.teardown();
  }

  onSignal(signal: string, data?: any) {
    super.onSignal(signal, data);

    for (const entity of this.entities) {
      entity.onSignal(signal, data);
    }
  }

  addEntity(entity: Entity) {
    // If we have already been setup, setup this new entity
    if (this.isSetup && !entity.isSetup) {
      entity.setup(this.config);
    }

    this.entities.push(entity);
  }

  removeEntity(entity: Entity) {
    const index = this.entities.indexOf(entity);
    if (index === -1) throw new Error("Cannot find entity to remove");

    if (entity.isSetup) {
      entity.teardown();
    }

    this.entities.splice(index, 1);
  }
}

/**
 * Does not request a transition until done() is called with a given transition
 */
export class Block extends Entity {
  done(transition = true) {
    this.requestedTransition = transition;
  }
}

/**
 * Executes a function once and requests a transition equal to its value.
 */
export class Decision extends Entity {
  constructor(private f: () => boolean) {
    super();
  }

  _setup() {
    this.requestedTransition = this.f();
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
    public handler: (...args: any) => boolean = _.constant(true)
  ) {
    super();
  }

  _setup() {
    this._on(this.emitter, this.eventName, this._handleEvent);
  }

  _handleEvent(...args: any) {
    this.requestedTransition = this.handler(...args);
  }
}

/**
 * A composite entity that requests a transition as soon as one of it's children requests one
 */
export class Alternative extends Entity {
  public entityPairs: { entity: Entity; transition: string }[];

  // Takes an array of type: { entity, transition } or just entity
  // transition defaults to the string version of the index in the array (to avoid problem of 0 being considered as falsy)
  constructor(
    entityPairs: (Entity | { entity: Entity; transition: string })[] = []
  ) {
    super();

    this.entityPairs = _.map(entityPairs, (entityPair, key) => {
      if (entityPair instanceof Entity)
        return {
          entity: entityPair,
          transition: key.toString(),
        };

      // Assume an object of type { entity, transition }
      return _.defaults({}, entityPair, {
        transition: key.toString(),
      });
    });
  }

  _setup() {
    for (const entityPair of this.entityPairs) {
      entityPair.entity.setup(this.config);
      if (entityPair.entity.requestedTransition)
        this.requestedTransition = entityPair.transition;
    }
  }

  _update(options: any) {
    for (const entityPair of this.entityPairs) {
      entityPair.entity.update(options);
      if (entityPair.entity.requestedTransition)
        this.requestedTransition = entityPair.transition;
    }
  }

  _teardown() {
    for (const entityPair of this.entityPairs) {
      entityPair.entity.teardown();
    }
  }
}

/**
 * A composite entity in which only entity is active at a time.
 * By default, the first entity is active
 */
export class SwitchingEntity extends Entity {
  public entities: Entity[] = [];
  public entityConfigs: any[] = [];
  public activeEntityIndex = -1;

  constructor() {
    super();
  }

  setup(config: any) {
    super.setup(config);

    if (this.entities && this.activeEntityIndex > 0) {
      this.switchToIndex(this.activeEntityIndex);
    }
  }

  update(options: any) {
    super.update(options);

    if (this.activeEntityIndex >= 0) {
      this.entities[this.activeEntityIndex].update(options);
    }
  }

  teardown() {
    this.switchToIndex(-1);

    super.teardown();
  }

  onSignal(signal: string, data?: any) {
    super.onSignal(signal, data);

    if (this.activeEntityIndex >= 0) {
      this.entities[this.activeEntityIndex].onSignal(signal, data);
    }
  }

  // If config is provided, it will overload the config provided to this entity by setup()
  addEntity(entity: Entity, config?: any) {
    this.entities.push(entity);
    this.entityConfigs.push(config);
  }

  switchToIndex(index: number) {
    if (this.activeEntityIndex >= 0) {
      this.entities[this.activeEntityIndex].teardown();
    }

    this.activeEntityIndex = index;

    if (this.activeEntityIndex >= 0) {
      const entityConfig = processEntityConfig(
        this.config,
        this.entityConfigs[this.activeEntityIndex]
      );

      this.entities[this.activeEntityIndex].setup(entityConfig);
    }
  }

  switchToEntity(entity: Entity) {
    if (entity === null) {
      this.switchToIndex(-1);
    } else {
      const index = this.entities.indexOf(entity);
      if (index === -1) throw new Error("Cannot find entity");

      this.switchToIndex(index);
    }
  }

  activeEntity() {
    if (this.activeEntityIndex >= 0)
      return this.entities[this.activeEntityIndex];

    return null;
  }

  removeEntity(entity: Entity) {
    const index = this.entities.indexOf(entity);
    if (index === -1) throw new Error("Cannot find entity");

    if (index === this.activeEntityIndex) {
      this.switchToIndex(-1);
    }

    this.entities.splice(index, 1);
    this.entityConfigs.splice(index, 1);
  }

  removeAllEntities() {
    this.switchToIndex(-1);

    this.entities = [];
    this.entityConfigs = [];
    this.activeEntityIndex = -1;
  }
}

export function processEntityConfig(
  config: EntityConfig,
  alteredConfig: EntityConfig | ((c: EntityConfig) => EntityConfig)
): EntityConfig {
  if (!alteredConfig) return config;
  if (typeof alteredConfig == "function") return alteredConfig(config);
  return alteredConfig;
}

export function extendConfig(values: any): (c: EntityConfig) => EntityConfig {
  return (config: EntityConfig) => _.extend({}, config, values);
}
