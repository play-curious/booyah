import * as _ from "underscore";

import * as chip from "./chip";

interface HMR {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dispose: (data: any) => void;
  accept: (cb: (dependencies: string[]) => void) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export class RunnerOptions {
  rootContext: chip.ChipContext = {};
  inputSignal: chip.Signal = chip.makeSignal();

  /** If minFps <= 0, it is ignored */
  minFps = 10;

  /** Enable hot reloading by passing it `module.hot` */
  hmr?: HMR;
}

/**
 * Manages running the game code at a regular refresh rate.
 */
export class Runner {
  private _options: RunnerOptions;
  private _isRunning = false;
  private _lastTimeStamp: number;
  private _rootContext: chip.ChipContext;
  private _rootChip: chip.Chip;

  /**
   *
   * @param _rootChipResolvable The chip at the root of the game
   * @param options
   */
  constructor(
    private readonly _rootChipResolvable: chip.ChipResolvable,
    options?: Partial<RunnerOptions>
  ) {
    this._options = chip.fillInOptions(options, new RunnerOptions());

    this._isRunning = false;
  }

  start() {
    if (this._isRunning) throw new Error("Already started");

    this._isRunning = true;
    this._lastTimeStamp = 0;

    this._rootContext = chip.processChipContext(this._options.rootContext, {});
    this._rootChip = _.isFunction(this._rootChipResolvable)
      ? this._rootChipResolvable(this._rootContext, chip.makeSignal())
      : this._rootChipResolvable;

    this._rootChip.once("terminated", () => (this._isRunning = false));

    const tickInfo: chip.TickInfo = {
      timeSinceLastTick: 0,
    };
    this._rootChip.activate(
      tickInfo,
      this._rootContext,
      this._options.inputSignal
    );

    requestAnimationFrame(() => this._onTick());

    if (this._options.hmr) this._enableHotReloading();
  }

  stop() {
    if (!this._isRunning) throw new Error("Already stopped");

    this._isRunning = false;
    this._rootChip.terminate(chip.makeSignal("stop"));
  }

  private _onTick() {
    if (!this._isRunning) return;

    const timeStamp = performance.now();

    let timeSinceLastTick = timeStamp - this._lastTimeStamp;
    this._lastTimeStamp = timeStamp;

    // If no time elapsed, don't update
    if (timeSinceLastTick <= 0) return;

    // Optionally clamp time since last frame
    if (this._options.minFps >= 0) {
      timeSinceLastTick = Math.min(
        timeSinceLastTick,
        1000 / this._options.minFps
      );
    }

    const tickInfo: chip.TickInfo = {
      timeSinceLastTick,
    };

    this._rootChip.tick(tickInfo);

    requestAnimationFrame(() => this._onTick());
  }

  private _enableHotReloading() {
    console.log("enabling hot reloading");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._options.hmr.dispose((data: any) => {
      // module is about to be replaced.
      // You can save data that should be accessible to the new asset in `data`
      console.log("this._options.hmr.dispose() called");

      data.reloadMemento = this._rootChip.makeReloadMemento();
    });

    this._options.hmr.accept((dependencies: string[]) => {
      // module or one of its dependencies was just updated.
      // data stored in `dispose` is available in `this._options.hmr.data`
      console.log("this._options.hmr.accept() called");

      const reloadMemento = this._options.hmr.data.reloadMemento;
      console.log("reloading from", reloadMemento);

      const tickInfo: chip.TickInfo = {
        timeSinceLastTick: 0,
      };
      this._rootChip.terminate(chip.makeSignal("beforeReload"));
      this._rootChip.activate(
        tickInfo,
        this._rootContext,
        chip.makeSignal("afterReload"),
        reloadMemento
      );
    });
  }

  get isRunning(): boolean {
    return this._isRunning;
  }
}
