import * as PIXI from "pixi.js";
import p2 from "p2";
import _ from "underscore";

import * as util from "./util";
import * as chip from "./chip";

export type p2Vec = [number, number];

export function p2VecToPoint(a: p2Vec): PIXI.Point {
  return new PIXI.Point(a[0], a[1]);
}

export function pointToP2Vec(a: PIXI.Point): p2Vec {
  return [a.x, a.y];
}

export function distanceBetweenBodies(a: any, b: any): number {
  const x = a.position[0] - b.position[0];
  const y = a.position[1] - b.position[1];
  return Math.sqrt(x * x + y * y);
}

export class Simulation extends chip.ParallelChip {
  public world: p2.World;
  public worldOptions: p2.WorldOptions;
  public oldConfig: any;
  public container: PIXI.Container;
  public zoom: number;

  constructor(options: { zoom?: number; worldOptions: {} }) {
    super();

    util.setupOptions(this, options, {
      zoom: 50,
      worldOptions: {},
    });
  }

  activate(
    tickInfo: chip.TickInfo,
    chipContext: chip.ChipContext,
    inputSignal: chip.Signal
  ) {
    this.world = new p2.World(this.worldOptions);
    this.oldConfig = chipContext;

    this.container = new PIXI.Container();
    // center at origin
    this.container.position.x = chipContext.app.renderer.width / 2;
    this.container.position.y = chipContext.app.renderer.height / 2;

    this.container.scale.x = this.zoom; // zoom in
    this.container.scale.y = -this.zoom; // Note: we flip the y-axis to make "up" the physics "up"
    this.oldConfig.container.addChild(this.container);

    chipContext = _.extend({}, chipContext, {
      world: this.world,
      container: this.container,
    });

    super.activate(tickInfo, chipContext, inputSignal);
  }

  tick(tickInfo: chip.TickInfo) {
    super.tick(tickInfo);

    // Limit how fast the physics can catch up
    const stepTime = Math.min(tickInfo.timeSinceLastFrame / 1000, 1 / 30);
    this.world.step(stepTime);
  }

  terminate(tickInfo: chip.TickInfo) {
    this.world.clear();

    this.oldConfig.container.removeChild(this.container);

    super.terminate(tickInfo);
  }
}

/**
  Meant to be a child of a Simulation.
*/
export class BodyChip extends chip.ParallelChip {
  public body: any;
  public display: any;

  constructor(options: { body?: any; display?: any }) {
    super();

    util.setupOptions(this, options, {
      body: null,
      display: null,
    });
  }

  activate(
    tickInfo: chip.TickInfo,
    chipContext: chip.ChipContext,
    inputSignal: chip.Signal
  ) {
    super.activate(tickInfo, chipContext, inputSignal);

    this._chipContext.world.addBody(this.body);

    if (this.display) this._chipContext.container.addChild(this.display);
  }

  tick(tickInfo: chip.TickInfo) {
    super.tick(tickInfo);

    // Transfer positions of the physics objects to Pixi.js
    // OPT: no need to do this for static bodies (mass = 0) except for the first framce
    if (this.display) {
      this.display.position.x = this.body.position[0];
      this.display.position.y = this.body.position[1];
      this.display.rotation = this.body.angle;
    }
  }

  terminate(tickInfo: chip.TickInfo) {
    this._chipContext.world.removeBody(this.body);

    if (this.display) this._chipContext.container.removeChild(this.display);

    super.terminate(tickInfo);
  }
}
