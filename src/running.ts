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
  private _runningStatus: "stopped" | "running" | "paused" = "stopped";
  private _lastTimeStamp: number;
  private _rootContext: chip.ChipContext;
  private _rootChip: chip.Chip;
  private _visibilityChangeHandler: () => void;

  /**
   *
   * @param _rootChipResolvable The chip at the root of the game
   * @param options
   */
  constructor(
    private readonly _rootChipResolvable: chip.ChipResolvable,
    options?: Partial<RunnerOptions>,
  ) {
    this._options = chip.fillInOptions(options, new RunnerOptions());
  }

  start() {
    if (this._runningStatus !== "stopped") throw new Error("Already started");

    this._visibilityChangeHandler = () => {
      if (document.visibilityState === "hidden") {
        if (this._runningStatus !== "running") return;

        console.log("Runner: pausing");
        this._runningStatus = "paused";

        this._rootChip.pause(this._makeTickInfo());
      } else {
        if (this._runningStatus !== "paused") return;

        console.log("Runner: resuming");

        this._runningStatus = "running";
        this._rootChip.resume(this._makeTickInfo());

        requestAnimationFrame(() => this._onTick());
      }
    };
    document.addEventListener(
      "visibilitychange",
      this._visibilityChangeHandler,
    );

    this._runningStatus = "running";
    this._lastTimeStamp = 0;

    this._rootContext = chip.processChipContext(this._options.rootContext, {});
    this._rootChip = _.isFunction(this._rootChipResolvable)
      ? this._rootChipResolvable(this._rootContext, chip.makeSignal())
      : this._rootChipResolvable;

    this._rootChip.once("terminated", () => (this._runningStatus = "stopped"));

    const tickInfo: chip.TickInfo = {
      timeSinceLastTick: 0,
    };
    this._rootChip.activate(
      tickInfo,
      this._rootContext,
      this._options.inputSignal,
    );

    requestAnimationFrame(() => this._onTick());

    if (this._options.hmr) this._enableHotReloading();
  }

  stop() {
    if (this._runningStatus === "stopped") throw new Error("Already stopped");

    this._runningStatus = "stopped";
    this._rootChip.terminate(chip.makeSignal("stop"));

    document.removeEventListener(
      "visibilitychange",
      this._visibilityChangeHandler,
    );
    delete this._visibilityChangeHandler;
  }

  private _onTick() {
    if (this._runningStatus !== "running") return;

    const tickInfo = this._makeTickInfo();

    // If no time elapsed, don't call tick()
    if (tickInfo.timeSinceLastTick > 0) {
      this._rootChip.tick(tickInfo);
    }

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
        reloadMemento,
      );
    });
  }

  get runningStatus() {
    return this._runningStatus;
  }

  private _makeTickInfo(): chip.TickInfo {
    const timeStamp = performance.now();

    // Force time to be >= 0
    let timeSinceLastTick = Math.max(0, timeStamp - this._lastTimeStamp);
    this._lastTimeStamp = timeStamp;

    // Optionally clamp time since last frame
    if (this._options.minFps >= 0) {
      timeSinceLastTick = Math.min(
        timeSinceLastTick,
        1000 / this._options.minFps,
      );
    }

    return {
      timeSinceLastTick,
    };
  }
}
