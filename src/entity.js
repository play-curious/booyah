import _ from "underscore";
import * as util from "./util";
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
        super(...arguments);
        this.isSetup = false;
        this.eventListeners = [];
    }
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
    update(options) {
        if (!this.isSetup) {
            console.error("update() called before setup()", this);
            console.trace();
        }
        this._update(options);
    }
    teardown(options) {
        if (!this.isSetup) {
            console.error("teardown() called before setup()", this);
            console.trace();
        }
        this._teardown(options);
        this._off(); // Remove all event listeners
        this.config = null;
        this.isSetup = false;
    }
    onSignal(signal, data) {
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
    _off(emitter, event, cb) {
        const props = {
            emitter,
            event,
            cb,
        };
        const [listenersToRemove, listenersToKeep] = _.partition(this.eventListeners, props);
        for (const listener of listenersToRemove)
            listener.emitter.off(listener.event, listener.cb, this);
        this.eventListeners = listenersToKeep;
    }
    _setup(config) { }
    _update(options) { }
    _teardown(options) { }
    _onSignal(signal, data) { }
    static processEntityConfig(config, alteredConfig) {
        if (!alteredConfig)
            return config;
        if (typeof alteredConfig == "function")
            return alteredConfig(config);
        return alteredConfig;
    }
    static extendConfig(values) {
        return (config) => _.extend({}, config, values);
    }
}
/** Empty class just to indicate an entity that does nothing and never requests a transition  */
export class NullEntity extends Entity {
}
/** An entity that returns the requested transition immediately  */
export class TransitoryEntity extends Entity {
    constructor(transition = true) {
        super();
        this.transition = transition;
    }
    _setup() {
        this.requestedTransition = this.transition;
    }
}
/**
 Allows a bunch of entities to execute in parallel.
 Updates child entities until they ask for a transition, at which point they are torn down.
 If autoTransition=true, requests a transition when all child entities have completed.
 */
export class ParallelEntity extends Entity {
    /**
     @entities can be subclasses of entity.Entity or an object like { entity:, config: }
     @options:
     * autoTransition: Should the entity request a transition when all the child entities are done?  (defaults to false)
     */
    constructor(entities = [], options = {}) {
        super();
        this.entities = [];
        this.entityConfigs = [];
        this.entityIsActive = [];
        this.autoTransition = false;
        util.setupOptions(this, options, {
            autoTransition: false,
        });
        for (const currentEntity of entities) {
            if (currentEntity instanceof Entity) {
                this.addEntity(currentEntity);
            }
            else {
                this.addEntity(currentEntity.entity, currentEntity.config);
            }
        }
    }
    setup(config) {
        super.setup(config);
        for (let i = 0; i < this.entities.length; i++) {
            const entity = this.entities[i];
            if (!entity.isSetup) {
                const entityConfig = ParallelEntity.processEntityConfig(this.config, this.entityConfigs[i]);
                entity.setup(entityConfig);
            }
            this.entityIsActive[i] = true;
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
            if (this.entityIsActive[i])
                this.entities[i].onSignal(signal, data);
        }
    }
    // If config is provided, it will overload the config provided to this entity by setup()
    addEntity(entity, config = null) {
        this.entities.push(entity);
        this.entityConfigs.push(config);
        this.entityIsActive.push(true);
        // If we have already been setup, setup this new entity
        if (this.isSetup && !entity.isSetup) {
            const entityConfig = ParallelEntity.processEntityConfig(this.config, config);
            entity.setup(entityConfig);
        }
    }
    removeEntity(entity) {
        const index = this.entities.indexOf(entity);
        if (index === -1)
            throw new Error("Cannot find entity to remove");
        if (entity.isSetup) {
            entity.teardown();
        }
        this.entities.splice(index, 1);
        this.entityConfigs.splice(index, 1);
        this.entityIsActive.splice(index, 1);
    }
    removeAllEntities() {
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
/**
  Runs one child entity after another.
  When done, requestes the last transition demanded.
  Optionally can loop back to the first entity.
*/
export class EntitySequence extends Entity {
    constructor(entities, options = {}) {
        super();
        this.entities = entities;
        this.currentEntityIndex = 0;
        this.currentEntity = null;
        this.loop = !!options.loop;
    }
    // Does not setup entity
    addEntity(entity) {
        if (this.requestedTransition)
            return;
        this.entities.push(entity);
    }
    skip() {
        if (this.requestedTransition)
            return;
        this._advance({ name: "skip" });
    }
    setup(config) {
        super.setup(config);
        this.currentEntityIndex = 0;
        this.currentEntity = null;
        this._activateEntity(0);
    }
    update(options) {
        super.update(options);
        if (this.lastRequestedTransition)
            return;
        const timeSinceChildStart = options.timeSinceStart - this.childStartedAt;
        const childOptions = _.extend({}, options, {
            timeSinceStart: timeSinceChildStart,
        });
        this.lastUpdateOptions = options;
        if (this.currentEntityIndex >= this.entities.length)
            return;
        this.currentEntity.update(childOptions);
        const transition = this.currentEntity.requestedTransition;
        if (transition)
            this._advance(transition);
    }
    teardown() {
        this._deactivateEntity();
        super.teardown();
    }
    onSignal(signal, data) {
        if (this.requestedTransition)
            return;
        super.onSignal(signal, data);
        this.currentEntity.onSignal(signal, data);
        if (signal === "reset")
            this.restart();
    }
    restart() {
        this._deactivateEntity();
        this.currentEntityIndex = 0;
        this.requestedTransition = false;
        this._activateEntity(0);
    }
    _activateEntity(time) {
        const entityDescriptor = this.entities[this.currentEntityIndex];
        if (_.isFunction(entityDescriptor)) {
            this.currentEntity = entityDescriptor(this);
        }
        else {
            this.currentEntity = entityDescriptor;
        }
        this.currentEntity.setup(this.config);
        this.childStartedAt = time;
    }
    _deactivateEntity() {
        if (this.currentEntity && this.currentEntity.isSetup)
            this.currentEntity.teardown();
    }
    _advance(transition) {
        if (this.currentEntityIndex < this.entities.length - 1) {
            this._deactivateEntity();
            this.currentEntityIndex = this.currentEntityIndex + 1;
            this._activateEntity(this.lastUpdateOptions.timeSinceStart);
        }
        else if (this.loop) {
            this._deactivateEntity();
            this.currentEntityIndex = 0;
            this._activateEntity(this.lastUpdateOptions.timeSinceStart);
        }
        else {
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
    constructor(states, transitions, options = {}) {
        super();
        this.states = states;
        this.transitions = transitions;
        util.setupOptions(this, options, {
            startingState: "start",
            endingStates: ["end"],
            startingStateParams: {},
            startingProgress: {},
        });
    }
    setup(config) {
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
    update(options) {
        super.update(options);
        if (!this.state)
            return;
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
            }
            else {
                requestedTransitionName = requestedTransition;
            }
            let nextStateDescriptor;
            // The transition could directly be the name of another state
            if (_.isString(requestedTransitionName) &&
                requestedTransitionName in this.states &&
                !(this.stateName in this.transitions)) {
                nextStateDescriptor = requestedTransition;
            }
            else if (!(this.stateName in this.transitions)) {
                throw new Error(`Cannot find transition for state '${this.stateName}'`);
            }
            else {
                const transitionDescriptor = this.transitions[this.stateName];
                if (_.isFunction(transitionDescriptor)) {
                    nextStateDescriptor = transitionDescriptor(requestedTransitionName, requestedTransitionParams, this);
                }
                else if (_.isString(transitionDescriptor)) {
                    nextStateDescriptor = transitionDescriptor;
                }
                else {
                    throw new Error(`Cannot decode transition descriptor '${JSON.stringify(transitionDescriptor)}'`);
                }
            }
            // Unpack the next state
            let nextStateName, nextStateParams;
            if (_.isObject(nextStateDescriptor) &&
                _.isString(nextStateDescriptor.name)) {
                nextStateName = nextStateDescriptor.name;
                nextStateParams = nextStateDescriptor.params;
            }
            else if (_.isString(nextStateDescriptor)) {
                nextStateName = nextStateDescriptor;
                nextStateParams = requestedTransition.params; // By default, pass through the params in the requested transition
            }
            else {
                throw new Error(`Cannot decode state descriptor '${JSON.stringify(nextStateDescriptor)}'`);
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
    onSignal(signal, data) {
        super.onSignal(signal, data);
        if (this.state)
            this.state.onSignal(signal, data);
    }
    _changeState(timeSinceStart, nextStateName, nextStateParams) {
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
            }
            else {
                this.state = nextStateDescriptor;
            }
            this.state.setup(this.config);
        }
        else {
            throw new Error(`Cannot find state '${nextStateName}'`);
        }
        this.sceneStartedAt = timeSinceStart;
        const previousStateName = this.stateName;
        const previousStateParams = this.stateParams;
        this.stateName = nextStateName;
        this.stateParams = nextStateParams;
        this.visitedStates.push(nextStateName);
        this.emit("stateChange", nextStateName, nextStateParams, previousStateName, previousStateParams);
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
    const f = function (requestedTransitionName, requestedTransitionParams, previousStateName, previousStateParams) {
        if (requestedTransitionName in table) {
            const transitionDescriptor = table[requestedTransitionName];
            if (_.isFunction(transitionDescriptor)) {
                return transitionDescriptor(requestedTransitionName, requestedTransitionParams, previousStateName, previousStateParams);
            }
            else {
                return transitionDescriptor;
            }
        }
        else {
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
        if (index === -1)
            throw new Error("Cannot find entity to remove");
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
    constructor(functions, childEntities = []) {
        super();
        this.functions = functions;
        for (let childEntity of childEntities)
            this.addEntity(childEntity);
    }
    setup(config) {
        super.setup(config);
        if (this.functions.setup)
            this.functions.setup(config, this);
    }
    update(options) {
        super.update(options);
        if (this.functions.update)
            this.functions.update(options, this);
        if (this.functions.requestTransition) {
            this.requestedTransition = this.functions.requestTransition(options, this);
        }
    }
    teardown() {
        if (this.functions.teardown)
            this.functions.teardown(this);
        super.teardown();
    }
    onSignal(signal, data) {
        super.onSignal(signal, data);
        if (this.functions.onSignal)
            this.functions.onSignal(signal, data);
    }
}
/**
  An entity that calls a provided function just once (in setup), and immediately requests a transition.
  Optionally takes a @that parameter, which is set as _this_ during the call.
*/
export class FunctionCallEntity extends Entity {
    constructor(f, that) {
        super();
        this.f = f;
        this.that = that;
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
    constructor(entities = [], name) {
        super(entities);
        this.name = name;
    }
    setup(config) {
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
    constructor(videoName, options = {}) {
        super();
        this.videoName = videoName;
        util.setupOptions(this, options, {
            loop: false,
        });
    }
    _setup(config) {
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
    _update(options) {
        if (this.videoElement.ended)
            this.requestedTransition = true;
    }
    _onSignal(signal, data) {
        if (signal === "pause") {
            this.videoElement.pause();
        }
        else if (signal === "play") {
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
    constructor(options) {
        super();
        util.setupOptions(this, options, {
            onTexture: util.REQUIRED_OPTION,
            offTexture: util.REQUIRED_OPTION,
            isOn: false,
            position: new PIXI.Point(),
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
        if (!silent)
            this.emit("change", this.isOn);
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
    constructor(animatedSprite) {
        super();
        this.animatedSprite = animatedSprite;
    }
    _setup() {
        if (this.animatedSprite.onComplete)
            console.warn("Warning: overwriting this.animatedSprite.onComplete");
        this.animatedSprite.onComplete = this._onAnimationComplete.bind(this);
        this.config.container.addChild(this.animatedSprite);
        this.animatedSprite.gotoAndPlay(0);
    }
    onSignal(signal, data) {
        if (signal == "pause")
            this.animatedSprite.stop();
        else if (signal == "play")
            this.animatedSprite.play();
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
    setup(config) {
        super.setup(config);
        this.sprite = new PIXI.Sprite(this.config.app.loader.resources[this.config.directives.graphics.skip].texture);
        this.sprite.anchor.set(0.5);
        this.sprite.position.set(this.config.app.screen.width - 50, this.config.app.screen.height - 50);
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
        this.entities = [];
        util.setupOptions(this, options, {
            autoTransition: true,
        });
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
        for (let i = 0; i < this.entities.length;) {
            const entity = this.entities[i];
            entity.update(options);
            if (entity.requestedTransition) {
                console.debug("Cleanup up child entity", entity);
                if (entity.isSetup) {
                    entity.teardown();
                }
                this.entities.splice(i, 1);
            }
            else {
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
        if (index === -1)
            throw new Error("Cannot find entity to remove");
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
    constructor(f) {
        super();
        this.f = f;
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
    constructor(emitter, eventName, handler = _.constant(true)) {
        super();
        this.emitter = emitter;
        this.eventName = eventName;
        this.handler = handler;
    }
    _setup() {
        this._on(this.emitter, this.eventName, this._handleEvent);
    }
    _handleEvent(...args) {
        this.requestedTransition = this.handler(...args);
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
/**
 * A composite entity in which only entity is active at a time.
 * By default, the first entity is active
 */
export class SwitchingEntity extends Entity {
    constructor() {
        super();
        this.entities = [];
        this.entityConfigs = [];
        this.activeEntityIndex = -1;
    }
    setup(config) {
        super.setup(config);
        if (this.entities && this.activeEntityIndex > 0) {
            this.switchToIndex(this.activeEntityIndex);
        }
    }
    update(options) {
        super.update(options);
        if (this.activeEntityIndex >= 0) {
            this.entities[this.activeEntityIndex].update(options);
        }
    }
    teardown() {
        this.switchToIndex(-1);
        super.teardown();
    }
    onSignal(signal, data) {
        super.onSignal(signal, data);
        if (this.activeEntityIndex >= 0) {
            this.entities[this.activeEntityIndex].onSignal(signal, data);
        }
    }
    // If config is provided, it will overload the config provided to this entity by setup()
    addEntity(entity, config) {
        this.entities.push(entity);
        this.entityConfigs.push(config);
    }
    switchToIndex(index) {
        if (this.activeEntityIndex >= 0) {
            this.entities[this.activeEntityIndex].teardown();
        }
        this.activeEntityIndex = index;
        if (this.activeEntityIndex >= 0) {
            const entityConfig = processEntityConfig(this.config, this.entityConfigs[this.activeEntityIndex]);
            this.entities[this.activeEntityIndex].setup(entityConfig);
        }
    }
    switchToEntity(entity) {
        if (entity === null) {
            this.switchToIndex(-1);
        }
        else {
            const index = this.entities.indexOf(entity);
            if (index === -1)
                throw new Error("Cannot find entity");
            this.switchToIndex(index);
        }
    }
    activeEntity() {
        if (this.activeEntityIndex >= 0)
            return this.entities[this.activeEntityIndex];
        return null;
    }
    removeEntity(entity) {
        const index = this.entities.indexOf(entity);
        if (index === -1)
            throw new Error("Cannot find entity");
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
export function processEntityConfig(config, alteredConfig) {
    if (!alteredConfig)
        return config;
    if (typeof alteredConfig == "function")
        return alteredConfig(config);
    return alteredConfig;
}
export function extendConfig(values) {
    return (config) => _.extend({}, config, values);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW50aXR5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vdHlwZXNjcmlwdC9lbnRpdHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxDQUFDLE1BQU0sWUFBWSxDQUFDO0FBQzNCLE9BQU8sS0FBSyxJQUFJLE1BQU0sUUFBUSxDQUFDO0FBd0IvQjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXNCRztBQUNILE1BQU0sT0FBZ0IsTUFBTyxTQUFRLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWTtJQUE1RDs7UUFDUyxZQUFPLEdBQUcsS0FBSyxDQUFDO1FBQ2hCLG1CQUFjLEdBQXFCLEVBQUUsQ0FBQztJQTZGL0MsQ0FBQztJQXpGUSxLQUFLLENBQUMsTUFBb0I7UUFDL0IsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQ2hCLE9BQU8sQ0FBQyxLQUFLLENBQUMsc0JBQXNCLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDNUMsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO1NBQ2pCO1FBRUQsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7UUFDcEIsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQztRQUVoQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3RCLENBQUM7SUFFTSxNQUFNLENBQUMsT0FBa0I7UUFDOUIsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUU7WUFDakIsT0FBTyxDQUFDLEtBQUssQ0FBQyxnQ0FBZ0MsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUN0RCxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7U0FDakI7UUFFRCxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3hCLENBQUM7SUFFTSxRQUFRLENBQUMsT0FBYTtRQUMzQixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUNqQixPQUFPLENBQUMsS0FBSyxDQUFDLGtDQUFrQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3hELE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztTQUNqQjtRQUVELElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFeEIsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsNkJBQTZCO1FBRTFDLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDO1FBQ25CLElBQUksQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDO0lBQ3ZCLENBQUM7SUFFTSxRQUFRLENBQUMsTUFBYyxFQUFFLElBQVU7UUFDeEMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDaEIsT0FBTyxDQUFDLEtBQUssQ0FBQyxrQ0FBa0MsRUFBRSxJQUFJLENBQUMsQ0FBQztTQUN6RDtRQUVELElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFFUyxHQUFHLENBQ1gsT0FBZ0MsRUFDaEMsS0FBYSxFQUNiLEVBQWM7UUFFZCxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNqRCxPQUFPLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDOUIsQ0FBQztJQUVELGtGQUFrRjtJQUN4RSxJQUFJLENBQ1osT0FBaUMsRUFDakMsS0FBYyxFQUNkLEVBQWU7UUFFZixNQUFNLEtBQUssR0FBbUI7WUFDNUIsT0FBTztZQUNQLEtBQUs7WUFDTCxFQUFFO1NBQ0gsQ0FBQztRQUVGLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxlQUFlLENBQUMsR0FBRyxDQUFDLENBQUMsU0FBUyxDQUN0RCxJQUFJLENBQUMsY0FBYyxFQUNuQixLQUFZLENBQ2IsQ0FBQztRQUNGLEtBQUssTUFBTSxRQUFRLElBQUksaUJBQWlCO1lBQ3RDLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUUxRCxJQUFJLENBQUMsY0FBYyxHQUFHLGVBQWUsQ0FBQztJQUN4QyxDQUFDO0lBRU0sTUFBTSxDQUFDLE1BQVcsSUFBRyxDQUFDO0lBQ3RCLE9BQU8sQ0FBQyxPQUFZLElBQUcsQ0FBQztJQUN4QixTQUFTLENBQUMsT0FBYSxJQUFHLENBQUM7SUFDM0IsU0FBUyxDQUFDLE1BQWMsRUFBRSxJQUFVLElBQUcsQ0FBQztJQUV4QyxNQUFNLENBQUMsbUJBQW1CLENBQUMsTUFBVyxFQUFFLGFBQWtCO1FBQy9ELElBQUksQ0FBQyxhQUFhO1lBQUUsT0FBTyxNQUFNLENBQUM7UUFDbEMsSUFBSSxPQUFPLGFBQWEsSUFBSSxVQUFVO1lBQUUsT0FBTyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDckUsT0FBTyxhQUFhLENBQUM7SUFDdkIsQ0FBQztJQUVNLE1BQU0sQ0FBQyxZQUFZLENBQUMsTUFBYTtRQUN0QyxPQUFPLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDbEQsQ0FBQztDQUNGO0FBRUQsZ0dBQWdHO0FBQ2hHLE1BQU0sT0FBTyxVQUFXLFNBQVEsTUFBTTtDQUFHO0FBRXpDLG1FQUFtRTtBQUNuRSxNQUFNLE9BQU8sZ0JBQWlCLFNBQVEsTUFBTTtJQUMxQyxZQUFtQixhQUFhLElBQUk7UUFDbEMsS0FBSyxFQUFFLENBQUM7UUFEUyxlQUFVLEdBQVYsVUFBVSxDQUFPO0lBRXBDLENBQUM7SUFFRCxNQUFNO1FBQ0osSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7SUFDN0MsQ0FBQztDQUNGO0FBTUQ7Ozs7R0FJRztBQUNILE1BQU0sT0FBTyxjQUFlLFNBQVEsTUFBTTtJQUt4Qzs7OztPQUlHO0lBQ0gsWUFBWSxXQUFrQixFQUFFLEVBQUUsVUFBaUMsRUFBRTtRQUNuRSxLQUFLLEVBQUUsQ0FBQztRQVZILGFBQVEsR0FBYSxFQUFFLENBQUM7UUFDeEIsa0JBQWEsR0FBbUIsRUFBRSxDQUFDO1FBQ25DLG1CQUFjLEdBQWMsRUFBRSxDQUFDO1FBQy9CLG1CQUFjLEdBQVksS0FBSyxDQUFDO1FBU3JDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRTtZQUMvQixjQUFjLEVBQUUsS0FBSztTQUN0QixDQUFDLENBQUM7UUFFSCxLQUFLLE1BQU0sYUFBYSxJQUFJLFFBQVEsRUFBRTtZQUNwQyxJQUFJLGFBQWEsWUFBWSxNQUFNLEVBQUU7Z0JBQ25DLElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLENBQUM7YUFDL0I7aUJBQU07Z0JBQ0wsSUFBSSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQzthQUM1RDtTQUNGO0lBQ0gsQ0FBQztJQUVELEtBQUssQ0FBQyxNQUFXO1FBQ2YsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVwQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDN0MsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRTtnQkFDbkIsTUFBTSxZQUFZLEdBQUcsY0FBYyxDQUFDLG1CQUFtQixDQUNyRCxJQUFJLENBQUMsTUFBTSxFQUNYLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQ3RCLENBQUM7Z0JBQ0YsTUFBTSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQzthQUM1QjtZQUVELElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDO1NBQy9CO0lBQ0gsQ0FBQztJQUVELE1BQU0sQ0FBQyxPQUFZO1FBQ2pCLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFdEIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQzdDLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDMUIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFFaEMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFFdkIsSUFBSSxNQUFNLENBQUMsbUJBQW1CLEVBQUU7b0JBQzlCLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztvQkFFbEIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUM7aUJBQ2hDO2FBQ0Y7U0FDRjtRQUVELElBQUksSUFBSSxDQUFDLGNBQWMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQztZQUNyRCxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDO0lBQ3BDLENBQUM7SUFFRCxRQUFRO1FBQ04sS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQzdDLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDMUIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDNUIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUM7YUFDaEM7U0FDRjtRQUVELEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNuQixDQUFDO0lBRUQsUUFBUSxDQUFDLE1BQWMsRUFBRSxJQUFVO1FBQ2pDLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRTdCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUM3QyxJQUFJLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztTQUNyRTtJQUNILENBQUM7SUFFRCx3RkFBd0Y7SUFDeEYsU0FBUyxDQUFDLE1BQWMsRUFBRSxTQUFjLElBQUk7UUFDMUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDM0IsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDaEMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFL0IsdURBQXVEO1FBQ3ZELElBQUksSUFBSSxDQUFDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUU7WUFDbkMsTUFBTSxZQUFZLEdBQUcsY0FBYyxDQUFDLG1CQUFtQixDQUNyRCxJQUFJLENBQUMsTUFBTSxFQUNYLE1BQU0sQ0FDUCxDQUFDO1lBQ0YsTUFBTSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQztTQUM1QjtJQUNILENBQUM7SUFFRCxZQUFZLENBQUMsTUFBYztRQUN6QixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM1QyxJQUFJLEtBQUssS0FBSyxDQUFDLENBQUM7WUFBRSxNQUFNLElBQUksS0FBSyxDQUFDLDhCQUE4QixDQUFDLENBQUM7UUFFbEUsSUFBSSxNQUFNLENBQUMsT0FBTyxFQUFFO1lBQ2xCLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztTQUNuQjtRQUVELElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMvQixJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDcEMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFRCxpQkFBaUI7UUFDZixLQUFLLE1BQU0sTUFBTSxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUU7WUFDbEMsSUFBSSxNQUFNLENBQUMsT0FBTyxFQUFFO2dCQUNsQixNQUFNLENBQUMsUUFBUSxFQUFFLENBQUM7YUFDbkI7WUFFRCxJQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQztZQUNuQixJQUFJLENBQUMsYUFBYSxHQUFHLEVBQUUsQ0FBQztZQUN4QixJQUFJLENBQUMsY0FBYyxHQUFHLEVBQUUsQ0FBQztTQUMxQjtJQUNILENBQUM7Q0FDRjtBQU1EOzs7O0VBSUU7QUFDRixNQUFNLE9BQU8sY0FBZSxTQUFRLE1BQU07SUFReEMsWUFBbUIsUUFBa0IsRUFBRSxVQUFpQyxFQUFFO1FBQ3hFLEtBQUssRUFBRSxDQUFDO1FBRFMsYUFBUSxHQUFSLFFBQVEsQ0FBVTtRQU45Qix1QkFBa0IsR0FBRyxDQUFDLENBQUM7UUFDdkIsa0JBQWEsR0FBVyxJQUFJLENBQUM7UUFPbEMsSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQztJQUM3QixDQUFDO0lBRUQsd0JBQXdCO0lBQ3hCLFNBQVMsQ0FBQyxNQUFjO1FBQ3RCLElBQUksSUFBSSxDQUFDLG1CQUFtQjtZQUFFLE9BQU87UUFFckMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDN0IsQ0FBQztJQUVELElBQUk7UUFDRixJQUFJLElBQUksQ0FBQyxtQkFBbUI7WUFBRSxPQUFPO1FBRXJDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBRUQsS0FBSyxDQUFDLE1BQVc7UUFDZixLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXBCLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxDQUFDLENBQUM7UUFDNUIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7UUFFMUIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMxQixDQUFDO0lBRUQsTUFBTSxDQUFDLE9BQVk7UUFDakIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUV0QixJQUFJLElBQUksQ0FBQyx1QkFBdUI7WUFBRSxPQUFPO1FBRXpDLE1BQU0sbUJBQW1CLEdBQUcsT0FBTyxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDO1FBQ3pFLE1BQU0sWUFBWSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLE9BQU8sRUFBRTtZQUN6QyxjQUFjLEVBQUUsbUJBQW1CO1NBQ3BDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxpQkFBaUIsR0FBRyxPQUFPLENBQUM7UUFFakMsSUFBSSxJQUFJLENBQUMsa0JBQWtCLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNO1lBQUUsT0FBTztRQUU1RCxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUV4QyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLG1CQUFtQixDQUFDO1FBQzFELElBQUksVUFBVTtZQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUVELFFBQVE7UUFDTixJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUV6QixLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDbkIsQ0FBQztJQUVELFFBQVEsQ0FBQyxNQUFjLEVBQUUsSUFBVTtRQUNqQyxJQUFJLElBQUksQ0FBQyxtQkFBbUI7WUFBRSxPQUFPO1FBRXJDLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRTdCLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUUxQyxJQUFJLE1BQU0sS0FBSyxPQUFPO1lBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3pDLENBQUM7SUFFRCxPQUFPO1FBQ0wsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFFekIsSUFBSSxDQUFDLGtCQUFrQixHQUFHLENBQUMsQ0FBQztRQUM1QixJQUFJLENBQUMsbUJBQW1CLEdBQUcsS0FBSyxDQUFDO1FBRWpDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDMUIsQ0FBQztJQUVELGVBQWUsQ0FBQyxJQUFZO1FBQzFCLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUNoRSxJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsRUFBRTtZQUNsQyxJQUFJLENBQUMsYUFBYSxHQUFHLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDO1NBQzdDO2FBQU07WUFDTCxJQUFJLENBQUMsYUFBYSxHQUFHLGdCQUFnQixDQUFDO1NBQ3ZDO1FBRUQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3RDLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDO0lBQzdCLENBQUM7SUFFRCxpQkFBaUI7UUFDZixJQUFJLElBQUksQ0FBQyxhQUFhLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPO1lBQ2xELElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDbEMsQ0FBQztJQUVELFFBQVEsQ0FBQyxVQUFlO1FBQ3RCLElBQUksSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtZQUN0RCxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUN6QixJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixHQUFHLENBQUMsQ0FBQztZQUN0RCxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxjQUFjLENBQUMsQ0FBQztTQUM3RDthQUFNLElBQUksSUFBSSxDQUFDLElBQUksRUFBRTtZQUNwQixJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUN6QixJQUFJLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxDQUFDO1lBQzVCLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGNBQWMsQ0FBQyxDQUFDO1NBQzdEO2FBQU07WUFDTCxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUN6QixJQUFJLENBQUMsbUJBQW1CLEdBQUcsVUFBVSxDQUFDO1NBQ3ZDO0lBQ0gsQ0FBQztDQUNGO0FBRUQ7Ozs7Ozs7Ozs7RUFVRTtBQUNGLE1BQU0sT0FBTyxZQUFhLFNBQVEsTUFBTTtJQVl0QyxZQUNTLE1BQStCLEVBQy9CLFdBQWtELEVBQ3pELFVBQWUsRUFBRTtRQUVqQixLQUFLLEVBQUUsQ0FBQztRQUpELFdBQU0sR0FBTixNQUFNLENBQXlCO1FBQy9CLGdCQUFXLEdBQVgsV0FBVyxDQUF1QztRQUt6RCxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUU7WUFDL0IsYUFBYSxFQUFFLE9BQU87WUFDdEIsWUFBWSxFQUFFLENBQUMsS0FBSyxDQUFDO1lBQ3JCLG1CQUFtQixFQUFFLEVBQUU7WUFDdkIsZ0JBQWdCLEVBQUUsRUFBRTtTQUNyQixDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsS0FBSyxDQUFDLE1BQW9CO1FBQ3hCLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFcEIsSUFBSSxDQUFDLGFBQWEsR0FBRyxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBRXRELE1BQU0sYUFBYSxHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQztZQUNwRCxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRTtZQUN0QixDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQztRQUN2QixNQUFNLG1CQUFtQixHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDO1lBQ2hFLENBQUMsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEVBQUU7WUFDNUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQztRQUM3QixJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsRUFBRSxhQUFhLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBRUQsTUFBTSxDQUFDLE9BQWtCO1FBQ3ZCLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFdEIsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLO1lBQUUsT0FBTztRQUV4QixNQUFNLG1CQUFtQixHQUFHLE9BQU8sQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQztRQUN6RSxNQUFNLFlBQVksR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxPQUFPLEVBQUU7WUFDekMsY0FBYyxFQUFFLG1CQUFtQjtTQUNwQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUVoQyxNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsbUJBQW1CLENBQUM7UUFDM0QsSUFBSSxtQkFBbUIsRUFBRTtZQUN2Qiw4QkFBOEI7WUFDOUIsSUFBSSx1QkFBdUIsRUFBRSx5QkFBeUIsQ0FBQztZQUN2RCxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQUMsRUFBRTtnQkFDbkMsdUJBQXVCLEdBQUcsbUJBQW1CLENBQUMsSUFBSSxDQUFDO2dCQUNuRCx5QkFBeUIsR0FBRyxtQkFBbUIsQ0FBQyxNQUFNLENBQUM7YUFDeEQ7aUJBQU07Z0JBQ0wsdUJBQXVCLEdBQUcsbUJBQW1CLENBQUM7YUFDL0M7WUFFRCxJQUFJLG1CQUFtQixDQUFDO1lBQ3hCLDZEQUE2RDtZQUM3RCxJQUNFLENBQUMsQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUM7Z0JBQ25DLHVCQUF1QixJQUFJLElBQUksQ0FBQyxNQUFNO2dCQUN0QyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQ3JDO2dCQUNBLG1CQUFtQixHQUFHLG1CQUFtQixDQUFDO2FBQzNDO2lCQUFNLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFO2dCQUNoRCxNQUFNLElBQUksS0FBSyxDQUFDLHFDQUFxQyxJQUFJLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQzthQUN6RTtpQkFBTTtnQkFDTCxNQUFNLG9CQUFvQixHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUM5RCxJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsb0JBQW9CLENBQUMsRUFBRTtvQkFDdEMsbUJBQW1CLEdBQUcsb0JBQW9CLENBQ3hDLHVCQUF1QixFQUN2Qix5QkFBeUIsRUFDekIsSUFBSSxDQUNMLENBQUM7aUJBQ0g7cUJBQU0sSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDLEVBQUU7b0JBQzNDLG1CQUFtQixHQUFHLG9CQUFvQixDQUFDO2lCQUM1QztxQkFBTTtvQkFDTCxNQUFNLElBQUksS0FBSyxDQUNiLHdDQUF3QyxJQUFJLENBQUMsU0FBUyxDQUNwRCxvQkFBb0IsQ0FDckIsR0FBRyxDQUNMLENBQUM7aUJBQ0g7YUFDRjtZQUVELHdCQUF3QjtZQUN4QixJQUFJLGFBQWEsRUFBRSxlQUFlLENBQUM7WUFDbkMsSUFDRSxDQUFDLENBQUMsUUFBUSxDQUFDLG1CQUFtQixDQUFDO2dCQUMvQixDQUFDLENBQUMsUUFBUSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxFQUNwQztnQkFDQSxhQUFhLEdBQUcsbUJBQW1CLENBQUMsSUFBSSxDQUFDO2dCQUN6QyxlQUFlLEdBQUcsbUJBQW1CLENBQUMsTUFBTSxDQUFDO2FBQzlDO2lCQUFNLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFO2dCQUMxQyxhQUFhLEdBQUcsbUJBQW1CLENBQUM7Z0JBQ3BDLGVBQWUsR0FBRyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxrRUFBa0U7YUFDakg7aUJBQU07Z0JBQ0wsTUFBTSxJQUFJLEtBQUssQ0FDYixtQ0FBbUMsSUFBSSxDQUFDLFNBQVMsQ0FDL0MsbUJBQW1CLENBQ3BCLEdBQUcsQ0FDTCxDQUFDO2FBQ0g7WUFFRCxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxjQUFjLEVBQUUsYUFBYSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1NBQzNFO0lBQ0gsQ0FBQztJQUVELFFBQVE7UUFDTixJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDZCxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1lBQ2xCLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO1NBQ3ZCO1FBRUQsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ25CLENBQUM7SUFFRCxRQUFRLENBQUMsTUFBYyxFQUFFLElBQVU7UUFDakMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFN0IsSUFBSSxJQUFJLENBQUMsS0FBSztZQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRUQsWUFBWSxDQUNWLGNBQXNCLEVBQ3RCLGFBQXFCLEVBQ3JCLGVBQW9CO1FBRXBCLG1FQUFtRTtRQUNuRSxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxhQUFhLENBQUMsRUFBRTtZQUNoRCxJQUFJLENBQUMsbUJBQW1CLEdBQUcsYUFBYSxDQUFDO1lBQ3pDLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ3ZDLE9BQU87U0FDUjtRQUVELElBQUksSUFBSSxDQUFDLEtBQUssRUFBRTtZQUNkLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7U0FDdkI7UUFFRCxJQUFJLGFBQWEsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQ2hDLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUN2RCxJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsRUFBRTtnQkFDckMsSUFBSSxDQUFDLEtBQUssR0FBRyxtQkFBbUIsQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLENBQUM7YUFDekQ7aUJBQU07Z0JBQ0wsSUFBSSxDQUFDLEtBQUssR0FBRyxtQkFBbUIsQ0FBQzthQUNsQztZQUVELElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztTQUMvQjthQUFNO1lBQ0wsTUFBTSxJQUFJLEtBQUssQ0FBQyxzQkFBc0IsYUFBYSxHQUFHLENBQUMsQ0FBQztTQUN6RDtRQUVELElBQUksQ0FBQyxjQUFjLEdBQUcsY0FBYyxDQUFDO1FBRXJDLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQztRQUN6QyxNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDN0MsSUFBSSxDQUFDLFNBQVMsR0FBRyxhQUFhLENBQUM7UUFDL0IsSUFBSSxDQUFDLFdBQVcsR0FBRyxlQUFlLENBQUM7UUFFbkMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFdkMsSUFBSSxDQUFDLElBQUksQ0FDUCxhQUFhLEVBQ2IsYUFBYSxFQUNiLGVBQWUsRUFDZixpQkFBaUIsRUFDakIsbUJBQW1CLENBQ3BCLENBQUM7SUFDSixDQUFDO0NBQ0Y7QUFFRDs7Ozs7Ozs7OztFQVVFO0FBQ0YsTUFBTSxVQUFVLG1CQUFtQixDQUFDLEtBQWdDO0lBQ2xFLE1BQU0sQ0FBQyxHQUFHLFVBQ1IsdUJBQStCLEVBQy9CLHlCQUE4QixFQUM5QixpQkFBeUIsRUFDekIsbUJBQXdCO1FBRXhCLElBQUksdUJBQXVCLElBQUksS0FBSyxFQUFFO1lBQ3BDLE1BQU0sb0JBQW9CLEdBQUcsS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7WUFDNUQsSUFBSSxDQUFDLENBQUMsVUFBVSxDQUFDLG9CQUFvQixDQUFDLEVBQUU7Z0JBQ3RDLE9BQU8sb0JBQW9CLENBQ3pCLHVCQUF1QixFQUN2Qix5QkFBeUIsRUFDekIsaUJBQWlCLEVBQ2pCLG1CQUFtQixDQUNwQixDQUFDO2FBQ0g7aUJBQU07Z0JBQ0wsT0FBTyxvQkFBb0IsQ0FBQzthQUM3QjtTQUNGO2FBQU07WUFDTCxNQUFNLElBQUksS0FBSyxDQUFDLHFCQUFxQix1QkFBdUIsRUFBRSxDQUFDLENBQUM7U0FDakU7SUFDSCxDQUFDLENBQUM7SUFDRixDQUFDLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDLHlCQUF5QjtJQUUxQyxPQUFPLENBQUMsQ0FBQztBQUNYLENBQUM7QUFFRCwwREFBMEQ7QUFDMUQsTUFBTSxPQUFPLGVBQWdCLFNBQVEsTUFBTTtJQUN6QyxZQUFtQixXQUFxQixFQUFFO1FBQ3hDLEtBQUssRUFBRSxDQUFDO1FBRFMsYUFBUSxHQUFSLFFBQVEsQ0FBZTtJQUUxQyxDQUFDO0lBRU0sS0FBSyxDQUFDLE1BQVc7UUFDdEIsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVwQixLQUFLLE1BQU0sTUFBTSxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUU7WUFDbEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUU7Z0JBQ25CLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7YUFDdEI7U0FDRjtJQUNILENBQUM7SUFFTSxNQUFNLENBQUMsT0FBWTtRQUN4QixLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRXRCLEtBQUssTUFBTSxNQUFNLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRTtZQUNsQyxNQUFNLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1NBQ3hCO1FBRUQsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixFQUFFO1lBQ2hFLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixDQUFDO1NBQ2pFO0lBQ0gsQ0FBQztJQUVNLFFBQVE7UUFDYixLQUFLLE1BQU0sTUFBTSxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUU7WUFDbEMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO1NBQ25CO1FBRUQsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ25CLENBQUM7SUFFTSxRQUFRLENBQUMsTUFBYyxFQUFFLElBQVU7UUFDeEMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFN0IsS0FBSyxNQUFNLE1BQU0sSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFO1lBQ2xDLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1NBQy9CO0lBQ0gsQ0FBQztJQUVNLFNBQVMsQ0FBQyxNQUFjO1FBQzdCLHVEQUF1RDtRQUN2RCxJQUFJLElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFO1lBQ25DLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1NBQzNCO1FBRUQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDN0IsQ0FBQztJQUVNLFlBQVksQ0FBQyxNQUFjO1FBQ2hDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVDLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQztZQUFFLE1BQU0sSUFBSSxLQUFLLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUVsRSxJQUFJLE1BQU0sQ0FBQyxPQUFPLEVBQUU7WUFDbEIsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO1NBQ25CO1FBRUQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ2pDLENBQUM7Q0FDRjtBQUVEOzs7Ozs7Ozs7O0VBVUU7QUFDRixNQUFNLE9BQU8sZ0JBQWlCLFNBQVEsY0FBYztJQUNsRCx3RUFBd0U7SUFDeEUsWUFDUyxTQU1OLEVBQ0QsZ0JBQTBCLEVBQUU7UUFFNUIsS0FBSyxFQUFFLENBQUM7UUFURCxjQUFTLEdBQVQsU0FBUyxDQU1mO1FBS0QsS0FBSyxJQUFJLFdBQVcsSUFBSSxhQUFhO1lBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUNyRSxDQUFDO0lBRUQsS0FBSyxDQUFDLE1BQVc7UUFDZixLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXBCLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLO1lBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQy9ELENBQUM7SUFFRCxNQUFNLENBQUMsT0FBWTtRQUNqQixLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRXRCLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNO1lBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2hFLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsRUFBRTtZQUNwQyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsQ0FDekQsT0FBTyxFQUNQLElBQUksQ0FDTCxDQUFDO1NBQ0g7SUFDSCxDQUFDO0lBRUQsUUFBUTtRQUNOLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRO1lBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFM0QsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ25CLENBQUM7SUFFRCxRQUFRLENBQUMsTUFBYyxFQUFFLElBQVU7UUFDakMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFN0IsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVE7WUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDckUsQ0FBQztDQUNGO0FBRUQ7OztFQUdFO0FBQ0YsTUFBTSxPQUFPLGtCQUFtQixTQUFRLE1BQU07SUFDNUMsWUFBbUIsQ0FBb0IsRUFBUyxJQUFTO1FBQ3ZELEtBQUssRUFBRSxDQUFDO1FBRFMsTUFBQyxHQUFELENBQUMsQ0FBbUI7UUFBUyxTQUFJLEdBQUosSUFBSSxDQUFLO1FBRXZELElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxJQUFJLElBQUksQ0FBQztJQUMzQixDQUFDO0lBRUQsTUFBTTtRQUNKLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUV2QixJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDO0lBQ2xDLENBQUM7Q0FDRjtBQUVELG1EQUFtRDtBQUNuRCxNQUFNLE9BQU8sYUFBYyxTQUFRLE1BQU07SUFDdkMsK0JBQStCO0lBQy9CLFlBQW1CLElBQVk7UUFDN0IsS0FBSyxFQUFFLENBQUM7UUFEUyxTQUFJLEdBQUosSUFBSSxDQUFRO0lBRS9CLENBQUM7SUFFRCxPQUFPLENBQUMsT0FBWTtRQUNsQixJQUFJLE9BQU8sQ0FBQyxjQUFjLElBQUksSUFBSSxDQUFDLElBQUksRUFBRTtZQUN2QyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDO1NBQ2pDO0lBQ0gsQ0FBQztDQUNGO0FBRUQ7OztFQUdFO0FBQ0YsTUFBTSxPQUFPLG1CQUFvQixTQUFRLE1BQU07SUFDN0MsWUFBbUIsYUFBa0I7UUFDbkMsS0FBSyxFQUFFLENBQUM7UUFEUyxrQkFBYSxHQUFiLGFBQWEsQ0FBSztJQUVyQyxDQUFDO0lBRUQsTUFBTSxDQUFDLE1BQVc7UUFDaEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRUQsU0FBUztRQUNQLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDeEQsQ0FBQztDQUNGO0FBRUQ7O0VBRUU7QUFDRixNQUFNLE9BQU8sZUFBZ0IsU0FBUSxjQUFjO0lBS2pELFlBQVksV0FBcUIsRUFBRSxFQUFTLElBQWE7UUFDdkQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRDBCLFNBQUksR0FBSixJQUFJLENBQVM7SUFFekQsQ0FBQztJQUVELEtBQUssQ0FBQyxNQUFXO1FBQ2YsSUFBSSxDQUFDLFNBQVMsR0FBRyxNQUFNLENBQUM7UUFFeEIsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUN0QyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFbEQsSUFBSSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxNQUFNLEVBQUU7WUFDcEMsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTO1NBQzFCLENBQUMsQ0FBQztRQUVILEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQzlCLENBQUM7SUFFRCxRQUFRO1FBQ04sS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRWpCLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDdkQsQ0FBQztDQUNGO0FBRUQ7OztFQUdFO0FBQ0YsTUFBTSxPQUFPLFdBQVksU0FBUSxNQUFNO0lBTXJDLFlBQW1CLFNBQWlCLEVBQUUsVUFBZSxFQUFFO1FBQ3JELEtBQUssRUFBRSxDQUFDO1FBRFMsY0FBUyxHQUFULFNBQVMsQ0FBUTtRQUdsQyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUU7WUFDL0IsSUFBSSxFQUFFLEtBQUs7U0FDWixDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsTUFBTSxDQUFDLE1BQW9CO1FBQ3pCLDJFQUEyRTtRQUMzRSw4Q0FBOEM7UUFDOUMsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUN0QyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRS9DLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzVELElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7UUFDbkMsSUFBSSxDQUFDLFlBQVksQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDO1FBRWxDLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1FBRXhCLG1FQUFtRTtRQUNuRSxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO1lBQ2xELHVFQUF1RTtZQUN2RSxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNuRCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxPQUFPLENBQUMsT0FBWTtRQUNsQixJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSztZQUFFLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUM7SUFDL0QsQ0FBQztJQUVELFNBQVMsQ0FBQyxNQUFjLEVBQUUsSUFBVTtRQUNsQyxJQUFJLE1BQU0sS0FBSyxPQUFPLEVBQUU7WUFDdEIsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQztTQUMzQjthQUFNLElBQUksTUFBTSxLQUFLLE1BQU0sRUFBRTtZQUM1QixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxDQUFDO1NBQzFCO0lBQ0gsQ0FBQztJQUVELFFBQVE7UUFDTixJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzFCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbEQsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7UUFFdEIsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ25CLENBQUM7SUFFRCxXQUFXO1FBQ1QsTUFBTSxhQUFhLEdBQUcsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDMUUsWUFBWTtRQUNaLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDbkQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQzVDLENBQUM7Q0FDRjtBQUVEOztFQUVFO0FBQ0YsTUFBTSxPQUFPLFlBQWEsU0FBUSxNQUFNO0lBU3RDLFlBQVksT0FBWTtRQUN0QixLQUFLLEVBQUUsQ0FBQztRQUVSLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRTtZQUMvQixTQUFTLEVBQUUsSUFBSSxDQUFDLGVBQWU7WUFDL0IsVUFBVSxFQUFFLElBQUksQ0FBQyxlQUFlO1lBQ2hDLElBQUksRUFBRSxLQUFLO1lBQ1gsUUFBUSxFQUFFLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRTtTQUMzQixDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsS0FBSyxDQUFDLE9BQVk7UUFDaEIsS0FBSyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUVyQixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ3RDLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUM7UUFFeEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2hELElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztRQUNqQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsWUFBWSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNyRCxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFdkMsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2xELElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQztRQUNsQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsWUFBWSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNyRCxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFeEMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFFekIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRUQsUUFBUTtRQUNOLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFbEQsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ25CLENBQUM7SUFFRCxPQUFPLENBQUMsSUFBYSxFQUFFLE1BQU0sR0FBRyxLQUFLO1FBQ25DLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBRXpCLElBQUksQ0FBQyxNQUFNO1lBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzlDLENBQUM7SUFFRCxRQUFRO1FBQ04sSUFBSSxDQUFDLElBQUksR0FBRyxLQUFLLENBQUM7UUFDbEIsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFDekIsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFFRCxPQUFPO1FBQ0wsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFDekIsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFFRCxpQkFBaUI7UUFDZixJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQ2xDLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztJQUN0QyxDQUFDO0NBQ0Y7QUFFRDs7OztFQUlFO0FBQ0YsTUFBTSxPQUFPLG9CQUFxQixTQUFRLE1BQU07SUFDOUMsWUFBbUIsY0FBbUM7UUFDcEQsS0FBSyxFQUFFLENBQUM7UUFEUyxtQkFBYyxHQUFkLGNBQWMsQ0FBcUI7SUFFdEQsQ0FBQztJQUVELE1BQU07UUFDSixJQUFJLElBQUksQ0FBQyxjQUFjLENBQUMsVUFBVTtZQUNoQyxPQUFPLENBQUMsSUFBSSxDQUFDLHFEQUFxRCxDQUFDLENBQUM7UUFDdEUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUV0RSxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQyxjQUFjLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFFRCxRQUFRLENBQUMsTUFBYyxFQUFFLElBQVU7UUFDakMsSUFBSSxNQUFNLElBQUksT0FBTztZQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLENBQUM7YUFDN0MsSUFBSSxNQUFNLElBQUksTUFBTTtZQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDeEQsQ0FBQztJQUVELFNBQVM7UUFDUCxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQzNCLElBQUksQ0FBQyxjQUFjLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztRQUN0QyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ3pELENBQUM7SUFFRCxvQkFBb0I7UUFDbEIsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQztJQUNsQyxDQUFDO0NBQ0Y7QUFFRCxNQUFNLE9BQU8sVUFBVyxTQUFRLE1BQU07SUFHcEMsS0FBSyxDQUFDLE1BQW9CO1FBQ3hCLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFcEIsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQzNCLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQzlCLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFjLENBQy9DLENBQUMsT0FBTyxDQUNWLENBQUM7UUFDRixJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDNUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUN0QixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLEVBQUUsRUFDakMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQ25DLENBQUM7UUFDRixJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7UUFDL0IsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLFlBQVksRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFbEQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRUQsUUFBUTtRQUNOLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFL0MsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ25CLENBQUM7SUFFRCxPQUFPO1FBQ0wsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQztRQUNoQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3BCLENBQUM7Q0FDRjtBQUVEOzs7RUFHRTtBQUNGLE1BQU0sT0FBTyx3QkFBeUIsU0FBUSxNQUFNO0lBSWxEOztNQUVFO0lBQ0YsWUFBWSxVQUFlLEVBQUU7UUFDM0IsS0FBSyxFQUFFLENBQUM7UUFQSCxhQUFRLEdBQWEsRUFBRSxDQUFDO1FBUzdCLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRTtZQUMvQixjQUFjLEVBQUUsSUFBSTtTQUNyQixDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsS0FBSyxDQUFDLE1BQVc7UUFDZixLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXBCLEtBQUssTUFBTSxNQUFNLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRTtZQUNsQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRTtnQkFDbkIsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQzthQUN0QjtTQUNGO0lBQ0gsQ0FBQztJQUVELE1BQU0sQ0FBQyxPQUFZO1FBQ2pCLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFdEIsaUZBQWlGO1FBQ2pGLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBSTtZQUMxQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hDLE1BQU0sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7WUFFdkIsSUFBSSxNQUFNLENBQUMsbUJBQW1CLEVBQUU7Z0JBQzlCLE9BQU8sQ0FBQyxLQUFLLENBQUMseUJBQXlCLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBRWpELElBQUksTUFBTSxDQUFDLE9BQU8sRUFBRTtvQkFDbEIsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO2lCQUNuQjtnQkFFRCxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7YUFDNUI7aUJBQU07Z0JBQ0wsQ0FBQyxFQUFFLENBQUM7YUFDTDtTQUNGO1FBRUQsSUFBSSxJQUFJLENBQUMsY0FBYyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRTtZQUNwRCxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDO1NBQ2pDO0lBQ0gsQ0FBQztJQUVELFFBQVE7UUFDTixLQUFLLE1BQU0sTUFBTSxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUU7WUFDbEMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO1NBQ25CO1FBRUQsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ25CLENBQUM7SUFFRCxRQUFRLENBQUMsTUFBYyxFQUFFLElBQVU7UUFDakMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFN0IsS0FBSyxNQUFNLE1BQU0sSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFO1lBQ2xDLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1NBQy9CO0lBQ0gsQ0FBQztJQUVELFNBQVMsQ0FBQyxNQUFjO1FBQ3RCLHVEQUF1RDtRQUN2RCxJQUFJLElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFO1lBQ25DLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1NBQzNCO1FBRUQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDN0IsQ0FBQztJQUVELFlBQVksQ0FBQyxNQUFjO1FBQ3pCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVDLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQztZQUFFLE1BQU0sSUFBSSxLQUFLLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUVsRSxJQUFJLE1BQU0sQ0FBQyxPQUFPLEVBQUU7WUFDbEIsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO1NBQ25CO1FBRUQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ2pDLENBQUM7Q0FDRjtBQUVEOztHQUVHO0FBQ0gsTUFBTSxPQUFPLEtBQU0sU0FBUSxNQUFNO0lBQy9CLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSTtRQUNwQixJQUFJLENBQUMsbUJBQW1CLEdBQUcsVUFBVSxDQUFDO0lBQ3hDLENBQUM7Q0FDRjtBQUVEOztHQUVHO0FBQ0gsTUFBTSxPQUFPLFFBQVMsU0FBUSxNQUFNO0lBQ2xDLFlBQW9CLENBQWdCO1FBQ2xDLEtBQUssRUFBRSxDQUFDO1FBRFUsTUFBQyxHQUFELENBQUMsQ0FBZTtJQUVwQyxDQUFDO0lBRUQsTUFBTTtRQUNKLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFDdEMsQ0FBQztDQUNGO0FBRUQ7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLFlBQWEsU0FBUSxNQUFNO0lBQ3RDLFlBQ1MsT0FBZ0MsRUFDaEMsU0FBaUIsRUFDakIsVUFBcUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7UUFFNUQsS0FBSyxFQUFFLENBQUM7UUFKRCxZQUFPLEdBQVAsT0FBTyxDQUF5QjtRQUNoQyxjQUFTLEdBQVQsU0FBUyxDQUFRO1FBQ2pCLFlBQU8sR0FBUCxPQUFPLENBQThDO0lBRzlELENBQUM7SUFFRCxNQUFNO1FBQ0osSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFFRCxZQUFZLENBQUMsR0FBRyxJQUFTO1FBQ3ZCLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7SUFDbkQsQ0FBQztDQUNGO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLE9BQU8sV0FBWSxTQUFRLE1BQU07SUFHckMsZ0VBQWdFO0lBQ2hFLHdIQUF3SDtJQUN4SCxZQUNFLGNBQW1FLEVBQUU7UUFFckUsS0FBSyxFQUFFLENBQUM7UUFFUixJQUFJLENBQUMsV0FBVyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLENBQUMsVUFBVSxFQUFFLEdBQUcsRUFBRSxFQUFFO1lBQ3hELElBQUksVUFBVSxZQUFZLE1BQU07Z0JBQzlCLE9BQU87b0JBQ0wsTUFBTSxFQUFFLFVBQVU7b0JBQ2xCLFVBQVUsRUFBRSxHQUFHLENBQUMsUUFBUSxFQUFFO2lCQUMzQixDQUFDO1lBRUosa0RBQWtEO1lBQ2xELE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsVUFBVSxFQUFFO2dCQUNoQyxVQUFVLEVBQUUsR0FBRyxDQUFDLFFBQVEsRUFBRTthQUMzQixDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxNQUFNO1FBQ0osS0FBSyxNQUFNLFVBQVUsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFO1lBQ3pDLFVBQVUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNyQyxJQUFJLFVBQVUsQ0FBQyxNQUFNLENBQUMsbUJBQW1CO2dCQUN2QyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsVUFBVSxDQUFDLFVBQVUsQ0FBQztTQUNwRDtJQUNILENBQUM7SUFFRCxPQUFPLENBQUMsT0FBWTtRQUNsQixLQUFLLE1BQU0sVUFBVSxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUU7WUFDekMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDbEMsSUFBSSxVQUFVLENBQUMsTUFBTSxDQUFDLG1CQUFtQjtnQkFDdkMsSUFBSSxDQUFDLG1CQUFtQixHQUFHLFVBQVUsQ0FBQyxVQUFVLENBQUM7U0FDcEQ7SUFDSCxDQUFDO0lBRUQsU0FBUztRQUNQLEtBQUssTUFBTSxVQUFVLElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRTtZQUN6QyxVQUFVLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO1NBQzlCO0lBQ0gsQ0FBQztDQUNGO0FBRUQ7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLGVBQWdCLFNBQVEsTUFBTTtJQUt6QztRQUNFLEtBQUssRUFBRSxDQUFDO1FBTEgsYUFBUSxHQUFhLEVBQUUsQ0FBQztRQUN4QixrQkFBYSxHQUFVLEVBQUUsQ0FBQztRQUMxQixzQkFBaUIsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUk5QixDQUFDO0lBRUQsS0FBSyxDQUFDLE1BQVc7UUFDZixLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXBCLElBQUksSUFBSSxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsaUJBQWlCLEdBQUcsQ0FBQyxFQUFFO1lBQy9DLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7U0FDNUM7SUFDSCxDQUFDO0lBRUQsTUFBTSxDQUFDLE9BQVk7UUFDakIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUV0QixJQUFJLElBQUksQ0FBQyxpQkFBaUIsSUFBSSxDQUFDLEVBQUU7WUFDL0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7U0FDdkQ7SUFDSCxDQUFDO0lBRUQsUUFBUTtRQUNOLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV2QixLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDbkIsQ0FBQztJQUVELFFBQVEsQ0FBQyxNQUFjLEVBQUUsSUFBVTtRQUNqQyxLQUFLLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUU3QixJQUFJLElBQUksQ0FBQyxpQkFBaUIsSUFBSSxDQUFDLEVBQUU7WUFDL0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1NBQzlEO0lBQ0gsQ0FBQztJQUVELHdGQUF3RjtJQUN4RixTQUFTLENBQUMsTUFBYyxFQUFFLE1BQVk7UUFDcEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDM0IsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUVELGFBQWEsQ0FBQyxLQUFhO1FBQ3pCLElBQUksSUFBSSxDQUFDLGlCQUFpQixJQUFJLENBQUMsRUFBRTtZQUMvQixJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1NBQ2xEO1FBRUQsSUFBSSxDQUFDLGlCQUFpQixHQUFHLEtBQUssQ0FBQztRQUUvQixJQUFJLElBQUksQ0FBQyxpQkFBaUIsSUFBSSxDQUFDLEVBQUU7WUFDL0IsTUFBTSxZQUFZLEdBQUcsbUJBQW1CLENBQ3RDLElBQUksQ0FBQyxNQUFNLEVBQ1gsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FDM0MsQ0FBQztZQUVGLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDO1NBQzNEO0lBQ0gsQ0FBQztJQUVELGNBQWMsQ0FBQyxNQUFjO1FBQzNCLElBQUksTUFBTSxLQUFLLElBQUksRUFBRTtZQUNuQixJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDeEI7YUFBTTtZQUNMLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzVDLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQztnQkFBRSxNQUFNLElBQUksS0FBSyxDQUFDLG9CQUFvQixDQUFDLENBQUM7WUFFeEQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztTQUMzQjtJQUNILENBQUM7SUFFRCxZQUFZO1FBQ1YsSUFBSSxJQUFJLENBQUMsaUJBQWlCLElBQUksQ0FBQztZQUM3QixPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFFL0MsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRUQsWUFBWSxDQUFDLE1BQWM7UUFDekIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDNUMsSUFBSSxLQUFLLEtBQUssQ0FBQyxDQUFDO1lBQUUsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBRXhELElBQUksS0FBSyxLQUFLLElBQUksQ0FBQyxpQkFBaUIsRUFBRTtZQUNwQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDeEI7UUFFRCxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDL0IsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7SUFFRCxpQkFBaUI7UUFDZixJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFdkIsSUFBSSxDQUFDLFFBQVEsR0FBRyxFQUFFLENBQUM7UUFDbkIsSUFBSSxDQUFDLGFBQWEsR0FBRyxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLGlCQUFpQixHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQzlCLENBQUM7Q0FDRjtBQUVELE1BQU0sVUFBVSxtQkFBbUIsQ0FDakMsTUFBb0IsRUFDcEIsYUFBaUU7SUFFakUsSUFBSSxDQUFDLGFBQWE7UUFBRSxPQUFPLE1BQU0sQ0FBQztJQUNsQyxJQUFJLE9BQU8sYUFBYSxJQUFJLFVBQVU7UUFBRSxPQUFPLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNyRSxPQUFPLGFBQWEsQ0FBQztBQUN2QixDQUFDO0FBRUQsTUFBTSxVQUFVLFlBQVksQ0FBQyxNQUFXO0lBQ3RDLE9BQU8sQ0FBQyxNQUFvQixFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDaEUsQ0FBQyJ9