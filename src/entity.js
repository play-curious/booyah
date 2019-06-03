import * as util from "./util.js";

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
export class Entity extends PIXI.utils.EventEmitter {
  constructor() {
    super();

    this.isSetup = false;
    this.eventListeners = [];
  }

  // @config includes narrator
  setup(config) {
    if (this.isSetup) {
      console.error("setup() called twice", this);
      console.trace();
    }

    this.config = config;
    this.isSetup = true;
    this.requestedTransition = null;

    this._setup(config);
  }

  // options include { playTime, timeSinceStart, timeScale, gameState }
  update(options) {
    if (!this.isSetup) {
      console.error("update() called before setup()", this);
      console.trace();
    }

    this._update(options);
  }

  teardown() {
    if (!this.isSetup) {
      console.error("teardown() called before setup()", this);
      console.trace();
    }

    this._teardown();

    this._off(); // Remove all event listeners

    this.config = null;
    this.isSetup = false;
  }

  // @signal is string, @data is whatever
  onSignal(signal, data = null) {
    if (!this.config) {
      console.error("onSignal() called before setup()", this);
    }

    this._onSignal(signal, data);
  }

  _on(emitter, event, cb) {
    this.eventListeners.push({ emitter, event, cb });
    emitter.on(event, cb, this);
  }

  // if @cb is null, will remove all event listeners for the given emitter and event
  _off(emitter = null, event = null, cb = null) {
    const props = {};
    if (emitter) props.emitter = emitter;
    if (event) props.event = event;
    if (cb) props.cb = cb;

    _.each(_.filter(this.eventListeners, props), listener =>
      listener.emitter.off(listener.event, listener.cb)
    );
    this.eventListeners = _.reject(this.eventListeners, _.matcher(props));
  }

  // Noop methods than can be overriden by subclasses
  _setup(config) {}
  _update(options) {}
  _teardown(options) {}
  _onSignal(signal, data) {}
}

/*
  Allows a bunch of entities to execute in parallel.
  Updates child entities until they ask for a transition, at which point they are torn down.
  Requests a transition only when all child entities have completed.
  Options:
    * autoTransition: Should the entity request a transition when all the child entities are done?  (defaults to false)  
*/
export class ParallelEntity extends Entity {
  constructor(entities = [], options = {}) {
    super();

    util.setupOptions(this, options, {
      autoTransition: false
    });

    this.entities = entities;
    // By default all entities are active
    this.entityIsActive = _.map(this.entities, () => true);
  }

  setup(config) {
    super.setup(config);

    for (const entity of this.entities) {
      if (!entity.isSetup) {
        entity.setup(config);
      }
    }
  }

  update(options) {
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

  onSignal(signal, data) {
    super.onSignal(signal, data);

    for (let i = 0; i < this.entities.length; i++) {
      if (this.entityIsActive[i]) this.entities[i].onSignal(signal, data);
    }
  }

  addEntity(entity) {
    // If we have already been setup, setup this new entity
    if (this.isSetup && !entity.isSetup) {
      entity.setup(this.config);
    }

    this.entities.push(entity);
    this.entityIsActive.push(true);
  }

  removeEntity(entity) {
    const index = this.entities.indexOf(entity);
    if (index === -1) throw new Error("Cannot find entity to remove");

    if (entity.isSetup) {
      entity.teardown();
    }

    this.entities.splice(index, 1);
    this.entityIsActive.splice(index, 1);
  }

  removeAllEntities() {
    for (const entity of this.entities) {
      if (entity.isSetup) {
        entity.teardown();
      }

      this.entities = [];
      this.entityIsActive = [];
    }
  }
}

/**
  Runs one child entity after another. 
  When done, requestes the last transition demanded.
  Optionally can loop back to the first entity.
*/
export class EntitySequence extends Entity {
  // @options includes loop (default: false)
  constructor(entities, options = {}) {
    super();

    this.entities = entities;
    this.loop = options.loop || false;
  }

  // Does not setup entity
  addEntity(entity) {
    if (this.requestedTransition) return;

    this.entities.push(entity);
  }

  skip() {
    if (this.requestedTransition) return;

    this._advance({ name: "skip" });
  }

  setup(config) {
    super.setup(config);

    this.currentEntityIndex = 0;

    this._activateEntity(0);
  }

  update(options) {
    super.update(options);

    if (this.lastRequestedTransition) return;

    const timeSinceChildStart = options.timeSinceStart - this.childStartedAt;
    const childOptions = _.extend({}, options, {
      timeSinceStart: timeSinceChildStart
    });

    this.lastUpdateOptions = options;

    if (this.currentEntityIndex >= this.entities.length) return;

    this.entities[this.currentEntityIndex].update(childOptions);

    const transition = this.entities[this.currentEntityIndex]
      .requestedTransition;
    if (transition) this._advance(transition);
  }

  teardown() {
    if (this.requestedTransition) return;

    this._deactivateEntity();

    super.teardown();
  }

  onSignal(signal, data) {
    if (this.requestedTransition) return;

    super.onSignal(signal, data);

    this.entities[this.currentEntityIndex].onSignal(signal, data);

    if (signal === "reset") this.restart();
  }

  restart() {
    this._deactivateEntity();

    this.currentEntityIndex = 0;
    this.requestedTransition = false;

    this._activateEntity(0);
  }

  _activateEntity(time) {
    this.entities[this.currentEntityIndex].setup(this.config);
    this.childStartedAt = time;
  }

  _deactivateEntity() {
    this.entities[this.currentEntityIndex].teardown();
  }

  _advance(transition) {
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
  By default, the state machine begins at the state called "start", and stops at "end".

  The transitions are not provided directly by the states (entities) by rather by a transition table provided in the constructor.
  A transition is defined as either a name (string) or { name, params }. 
  To use have a transition table within a transition table, use the function makeTransitionTable()
*/
export class StateMachine extends Entity {
  /**
      @states: an object of names to Entity, or to function(params): Entity
      @transitions: an object of names to transition, or to function(name, params, previousName, previousParams): Transition
  */
  constructor(states, transitions, options) {
    super();

    this.states = states;
    this.transitions = transitions;

    util.setupOptions(this, options, {
      startingState: "start",
      startingStateParams: {},
      endingState: "end"
    });
  }

  setup(config) {
    super.setup(config);

    this.visitedStates = [];

    this._changeState(0, this.startingState, this.startingStateParams);
  }

  update(options) {
    super.update(options);

    if (!this.state) return;

    const timeSinceStateStart = options.timeSinceStart - this.sceneStartedAt;
    const stateOptions = _.extend({}, options, {
      timeSinceStart: timeSinceStateStart
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

      // Follow the transition
      if (!(this.stateName in this.transitions)) {
        throw new Error(`Cannot find transition for state '${this.stateName}'`);
      }

      const transitionDescriptor = this.transitions[this.stateName];
      let nextStateDescriptor;
      if (_.isFunction(transitionDescriptor)) {
        nextStateDescriptor = transitionDescriptor(
          requestedTransitionName,
          requestedTransitionParams,
          this.stateName,
          this.stateParams
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

  onSignal(signal, data = null) {
    super.onSignal(signal, data);

    if (this.state) this.state.onSignal(signal, data);
  }

  _changeState(timeSinceStart, nextStateName, nextStateParams) {
    // If reached ending state, stop here. Teardown can happen later
    if (nextStateName === this.endingState) {
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
        this.state = nextStateDescriptor(nextStateParams);
      } else {
        this.state = nextStateDescriptor;
      }

      this.state.setup(this.config);
    } else {
      throw new Error(`Cannot find state '${nextStateName}`);
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
export function makeTransitionTable(table) {
  const f = function(
    requestedTransitionName,
    requestedTransitionParams,
    previousStateName,
    previousStateParams
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
  constructor(entities = []) {
    super();
    this.entities = entities;
  }

  setup(config) {
    super.setup(config);

    for (const entity of this.entities) {
      if (!entity.isSetup) {
        entity.setup(config);
      }
    }
  }

  update(options) {
    super.update(options);

    for (const entity of this.entities) {
      entity.update(options);
    }

    if (this.entities.length && this.entities[0].requestedTransition) {
      this.requestedTransition = this.entities[0].requestedTransition;
    }
  }

  teardown() {
    for (const entity of this.entities) {
      entity.teardown();
    }

    super.teardown();
  }

  onSignal(signal, data) {
    super.onSignal(signal, data);

    for (const entity of this.entities) {
      entity.onSignal(signal, data);
    }
  }

  addEntity(entity) {
    // If we have already been setup, setup this new entity
    if (this.isSetup && !entity.isSetup) {
      entity.setup(this.config);
    }

    this.entities.push(entity);
  }

  removeEntity(entity) {
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

  Example usage:
    new FunctionalEntity({
      setup: (config) => console.log("setup", config),
      teardown: () => console.log("teardown"),
    });
*/
export class FunctionalEntity extends ParallelEntity {
  // @functions is an object, with keys: setup, update, teardown, onSignal
  constructor(functions, childEntities = []) {
    super();

    this.functions = functions;

    for (let childEntity of childEntities) this.addEntity(childEntity);
  }

  setup(config) {
    super.setup(config);

    if (this.functions.setup) this.functions.setup(config, this);
  }

  update(options) {
    super.update(options);

    if (this.functions.update) this.functions.update(options, this);
  }

  teardown() {
    if (this.functions.teardown) this.functions.teardown(this);

    super.teardown();
  }

  onSignal(signal, data = null) {
    super.onSignal(signal, data);

    if (this.functions.onSignal) this.functions.onSignal(signal, data);
  }
}

/**
  An entity that calls a provided function just once (in setup), and immediately requests a transition
*/
export class FunctionCallEntity extends Entity {
  constructor(f) {
    super();

    this.f = f;
  }

  _setup() {
    this.f();

    this.requestedTransition = true;
  }
}

// Waits until time is up, then requests transition
export class WaitingEntity extends Entity {
  /* @wait is in milliseconds */
  constructor(wait) {
    super();

    this.wait = wait;
  }

  _update(options) {
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
  constructor(displayObject) {
    super();

    this.displayObject = displayObject;
  }

  _setup(config) {
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
  constructor(entities = [], name = null) {
    super(entities);

    this.name = name;
  }

  setup(config) {
    this.oldConfig = config;

    this.container = new PIXI.Container();
    this.container.name = this.name;
    this.oldConfig.container.addChild(this.container);

    this.newConfig = _.extend({}, config, {
      container: this.container
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
  constructor(videoName, options = {}) {
    super();

    this.videoName = videoName;
    util.setupOptions(this, options, {
      loop: false
    });
  }

  _setup(config) {
    this.videoElement = this.config.app.loader.resources[this.videoName].data;
    this.videoElement.loop = this.loop;
    this.videoElement.currentTime = 0;
    this.videoElement.play();

    this.videoSprite = PIXI.Sprite.from(this.videoElement);

    this.config.container.addChild(this.videoSprite);
  }

  _update(options) {
    if (this.videoElement.ended) this.requestedTransition = true;
  }

  _onSignal(signal, data) {
    if (signal === "pause") {
      this.videoElement.pause();
    } else if (signal === "play") {
      this.videoElement.play();
    }
  }

  teardown() {
    this.videoElement.pause();
    this.config.container.removeChild(this.videoSprite);

    super.teardown();
  }
}

/** 
  Creates a toggle switch that has different textures in the "off" and "on" positions.
*/
export class ToggleSwitch extends Entity {
  constructor(options) {
    super();

    util.setupOptions(this, options, {
      onTexture: util.REQUIRED_OPTION,
      offTexture: util.REQUIRED_OPTION,
      isOn: false,
      position: new PIXI.Point()
    });
  }

  setup(options) {
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

  setIsOn(isOn, silent = false) {
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
*/
export class AnimatedSpriteEntity extends Entity {
  constructor(animatedSprite) {
    super();

    this.animatedSprite = animatedSprite;
  }

  setup(config) {
    super.setup(config);

    this.config.container.addChild(this.animatedSprite);
  }

  onSignal(signal, data = null) {
    if (signal == "pause") this.animatedSprite.stop();
    else if (signal == "play") this.animatedSprite.play();
  }

  teardown() {
    this.config.container.removeChild(this.animatedSprite);

    super.teardown();
  }
}

export class SkipButton extends Entity {
  setup(config) {
    super.setup(config);

    this.sprite = new PIXI.Sprite(
      this.config.app.loader.resources["booyah/images/button-skip.png"].texture
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
  /** Options include:
        autoTransition: If true, requests transition when the entity has no children (default true)
  */
  constructor(options = {}) {
    super();

    util.setupOptions(this, options, {
      autoTransition: true
    });

    this.entities = [];
  }

  setup(config) {
    super.setup(config);

    for (const entity of this.entities) {
      if (!entity.isSetup) {
        entity.setup(config);
      }
    }
  }

  update(options) {
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

  onSignal(signal, data) {
    super.onSignal(signal, data);

    for (const entity of this.entities) {
      entity.onSignal(signal, data);
    }
  }

  addEntity(entity) {
    // If we have already been setup, setup this new entity
    if (this.isSetup && !entity.isSetup) {
      entity.setup(this.config);
    }

    this.entities.push(entity);
  }

  removeEntity(entity) {
    const index = this.entities.indexOf(entity);
    if (index === -1) throw new Error("Cannot find entity to remove");

    if (entity.isSetup) {
      entity.teardown();
    }

    this.entities.splice(index, 1);
  }
}

export class AwaitEvent extends Entity {
  _setup(config) {
    this.transition = null;
  }

  done(transition) {
    this.requestedTransition = transition;
  }
}

/**
 * A composite entity that requests a transition as soon as one of it's children requests one
 */
export class Alternative extends Entity {
  // Takes an array of type: { entity, transition } or just entity
  // transition defaults to the string version of the index in the array (to avoid problem of 0 being considered as falsy)
  constructor(entityPairs = []) {
    super();

    this.entityPairs = _.map(entityPairs, (entityPair, key) => {
      if (entityPair instanceof Entity)
        return {
          entity: entityPair,
          transition: key.toString()
        };

      if (!entityPair.entity) throw new Error("Missing entity");

      // Assume an object of type { entity, transition }
      return _.defaults({}, entityPair, {
        transition: key.toString()
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

  _update(options) {
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
