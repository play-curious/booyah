import * as PIXI from 'pixi.js-legacy';
import {partition} from 'underscore';

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

export default abstract class Entity extends PIXI.utils.EventEmitter {

    public isSetup = false;
    public eventListeners:EventListener[] = []
    public requestedTransition:any
    public config:EntityConfig

    abstract _setup?( config:EntityConfig ): void
    abstract _update?(options:UpdateOptions): void
    abstract _teardown?(options:TearDownOptions): void
    abstract _onSignal?(signal:string, data?:any): void

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

    public teardown( options:TearDownOptions ): void {
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
}