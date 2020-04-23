import * as PIXI from 'pixi.js-legacy';
import _, {partition} from 'underscore';

export type EntityResolvable = Entity | {
    entity: Entity
    config: EntityConfig
}
export interface EventListener {
    emitter?: PIXI.utils.EventEmitter
    event?: string
    cb?: ()=>void
}

export interface EntityConfig {

}

export interface UpdateOptions {
    playTime: number
    timeSinceStart: number
    timeScale: number
    gameState: 'playing' | 'paused'
}

export interface TearDownOptions {

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
export default abstract class Entity extends PIXI.utils.EventEmitter {

    public isSetup = false;
    public eventListeners:EventListener[] = []
    public requestedTransition:boolean
    public config:EntityConfig

    public setup( config:EntityConfig ): void {

        if (this.isSetup) {
            console.error("setup() called twice", this);
            console.trace();
        }

        this.config = config;
        this.isSetup = true;
        this.requestedTransition = null;

        this._setup(config);
    }

    public update( options:UpdateOptions ): void {

        if (!this.isSetup) {
            console.error("update() called before setup()", this);
            console.trace();
        }

        this._update(options);
    }

    public teardown( options?:TearDownOptions ): void {
        if (!this.isSetup) {
            console.error("teardown() called before setup()", this);
            console.trace();
        }

        this._teardown(options);

        this._off(); // Remove all event listeners

        this.config = null;
        this.isSetup = false;
    }

    public onSignal( signal:string, data?:any ): void {
        if (!this.config) {
            console.error("onSignal() called before setup()", this);
        }

        this._onSignal(signal, data);
    }

    protected _on(emitter:PIXI.utils.EventEmitter, event:string, cb:()=>void): void {
        this.eventListeners.push({ emitter, event, cb });
        emitter.on(event, cb, this);
    }

    // if @cb is null, will remove all event listeners for the given emitter and event
    protected _off(emitter?:PIXI.utils.EventEmitter, event?:string, cb?:()=>void): void {
        const props:EventListener = {};
        if (emitter) props.emitter = emitter;
        if (event) props.event = event;
        if (cb) props.cb = cb;

        const [listenersToRemove, listenersToKeep] = partition(
            this.eventListeners,
            props as any
        );
        for (const listener of listenersToRemove)
            listener.emitter.off(listener.event, listener.cb, this);

        this.eventListeners = listenersToKeep;
    }

    public _setup(config:EntityConfig){}
    public _update(options:UpdateOptions){}
    public _teardown(options?:TearDownOptions){}
    public _onSignal(signal:string, data?:any){}

    public static processEntityConfig(
        config:EntityConfig,
        alteredConfig:
            EntityConfig|
            ((config:EntityConfig)=>EntityConfig)
    ): EntityConfig {
        if (!alteredConfig) return config;
        if (typeof alteredConfig == 'function') return alteredConfig(config);
        return alteredConfig;
    }

    public static extendConfig(values:any[]):(config:EntityConfig)=>{} {
        return config => _.extend({}, config, values);
    }
}