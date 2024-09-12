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

  /** Time in ms where the backup timer is called to restart the update loop */
  backupTimerInterval = 500;

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
  private _backupTimerId: number;

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
  }

  start() {
    if (this._runningStatus !== "stopped") throw new Error("Already started");

    console.debug("Booyah Runner: starting");

    this._visibilityChangeHandler = () => {
      if (document.visibilityState === "hidden") {
        if (this._runningStatus !== "running") return;

        if (this._rootChip.chipState === "requestedTermination") {
          console.debug("Booyah Runner: stopping");

          // If the chip is done, stop the runner too
          this._rootChip.terminate(tickInfo);
          this._runningStatus = "stopped";
        } else {
          console.debug("Booyah Runner: pausing");

          // Pause
          this._runningStatus = "paused";
          this._rootChip.pause(this._makeTickInfo());
        }
      } else {
        if (this._runningStatus !== "paused") return;

        if (this._rootChip.chipState === "requestedTermination") {
          console.debug("Booyah Runner: stopping");

          // If the chip is done, stop the runner too
          this._rootChip.terminate(tickInfo);
          this._runningStatus = "stopped";
        } else {
          console.debug("Booyah Runner: resuming");

          // Resume the update loop
          this._runningStatus = "running";
          this._rootChip.resume(this._makeTickInfo());
          this._requestUpdate();
        }
      }
    };
    document.addEventListener(
      "visibilitychange",
      this._visibilityChangeHandler
    );

    this._runningStatus = "running";
    this._lastTimeStamp = 0;

    this._rootContext = chip.processChipContext(this._options.rootContext, {});
    this._rootChip = _.isFunction(this._rootChipResolvable)
      ? this._rootChipResolvable(this._rootContext, chip.makeSignal())
      : this._rootChipResolvable;

    const tickInfo: chip.TickInfo = {
      timeSinceLastTick: 0,
    };
    this._rootChip.activate(
      tickInfo,
      this._rootContext,
      this._options.inputSignal
    );

    this._requestUpdate();

    this._backupTimerId = window.setInterval(
      this._onBackupTimer.bind(this),
      this._options.backupTimerInterval
    );

    if (this._options.hmr) this._enableHotReloading();
  }

  stop() {
    if (this._runningStatus === "stopped") throw new Error("Already stopped");

    const timeStamp = performance.now();
    const timeSinceLastTick = this._clampTimeSinceLastTick(
      timeStamp - this._lastTimeStamp
    );

    const tickInfo: chip.TickInfo = {
      timeSinceLastTick,
    };

    this._rootChip.terminate(tickInfo, chip.makeSignal("stop"));
    this._runningStatus = "stopped";

    document.removeEventListener(
      "visibilitychange",
      this._visibilityChangeHandler
    );
    delete this._visibilityChangeHandler;

    window.clearInterval(this._backupTimerId);
  }

  private _onTick() {
    if (this._runningStatus !== "running") return;

    // If no time elapsed, stop early
    const tickInfo = this._makeTickInfo();
    if (tickInfo.timeSinceLastTick === 0) return;

    if (this._rootChip.chipState === "requestedTermination") {
      // If the chip is done, stop the runner too
      this._rootChip.terminate(tickInfo);
      this._runningStatus = "stopped";
    } else {
      // Call `tick()` and start the update loop again
      this._rootChip.tick(tickInfo);
      this._requestUpdate();
    }
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
      this._rootChip.terminate(tickInfo, chip.makeSignal("beforeReload"));
      this._rootChip.activate(
        tickInfo,
        this._rootContext,
        chip.makeSignal("afterReload"),
        reloadMemento
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
        1000 / this._options.minFps
      );
    }

    return {
      timeSinceLastTick,
    };
  }

  private _clampTimeSinceLastTick(timeSinceLastTick: number) {
    if (this._options.minFps <= 0) return;

    // Optionally clamp time since last frame
    return Math.min(timeSinceLastTick, 1000 / this._options.minFps);
  }

  private _requestUpdate() {
    requestAnimationFrame(this._onTick.bind(this));
  }

  private _onBackupTimer() {
    // If the game has been updated recently, don't do anything yet
    if (
      performance.now() - this._lastTimeStamp <
      this._options.backupTimerInterval
    )
      return;

    // Restart the animation loop
    console.debug("Booyah Runner: backup timer restarting animation loop");
    this._onTick();
  }
}
