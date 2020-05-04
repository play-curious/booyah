import * as entity from "./entity";
import p2 from "p2";
export declare type p2Vec = [number, number];
export declare function p2VecToPoint(a: p2Vec): PIXI.Point;
export declare function pointToP2Vec(a: PIXI.Point): p2Vec;
export declare function distanceBetweenBodies(a: any, b: any): number;
export declare class Simulation extends entity.ParallelEntity {
    world: p2.World;
    worldOptions: p2.WorldOptions;
    oldConfig: any;
    container: PIXI.Container;
    zoom: number;
    constructor(options: any);
    setup(config: any): void;
    update(options: any): void;
    teardown(): void;
}
/**
  Meant to be a child of a Simulation.
*/
export declare class BodyEntity extends entity.ParallelEntity {
    body: any;
    display: any;
    constructor(options: any);
    setup(config: any): void;
    update(options: any): void;
    teardown(): void;
}
