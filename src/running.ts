import * as _ from "underscore";

import * as chip from "./chip";

// declare global {
//   interface NodeModule {
//     hot: {
//       dispose: (data: unknown) => void;
//       accept: (dependencies: string[]) => void;
//     };
//   }
// }

export class RunnerOptions {
  rootChip: chip.ChipResolvable;
  rootContext: chip.ChipContext = {};
  inputSignal: chip.Signal = chip.makeSignal();

  // If minFps <= 0, it is ignored
  minFps = 10;
  enableHotReloading = true;
}

export class Runner {
  private _options: RunnerOptions;
  private _isRunning = false;
  private _lastTimeStamp: number;
  private _rootContext: chip.ChipContext;
  private _rootChip: chip.Chip;

  constructor(options?: Partial<RunnerOptions>) {
    this._options = chip.fillInOptions(options, new RunnerOptions());
  }

  start() {
    if (this._isRunning) throw new Error("Aleady started");

    this._isRunning = true;
    this._lastTimeStamp = 0;

    this._rootContext = chip.processChipContext(this._options.rootContext, {});
    this._rootChip = _.isFunction(this._options.rootChip)
      ? this._options.rootChip(chip.makeSignal())
      : this._options.rootChip;

    const tickInfo: chip.TickInfo = {
      timeSinceLastTick: 0,
    };
    this._rootChip.activate(
      tickInfo,
      this._rootContext,
      this._options.inputSignal
    );

    requestAnimationFrame((timeStamp) => this._onTick(timeStamp));

    if (this._options.enableHotReloading) this._enableHotReloading();
  }

  stop() {
    if (!this._isRunning) throw new Error("Aleady stopped");

    this._isRunning = true;
  }

  private _onTick(timeStamp: number) {
    if (!this._isRunning) return;

    let timeSinceLastTick = timeStamp - this._lastTimeStamp;

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

    requestAnimationFrame((timeStamp) => this._onTick(timeStamp));
  }

  private _enableHotReloading() {
    if (!module.hot) return;

    console.log("enabling hot reloading");

    module.hot.dispose((data) => {
      // module is about to be replaced.
      // You can save data that should be accessible to the new asset in `data`
      console.log("module.hot.dispose() called");

      data.reloadMemento = this._rootChip.makeReloadMemento();
    });

    module.hot.accept((getParents) => {
      // module or one of its dependencies was just updated.
      // data stored in `dispose` is available in `module.hot.data`
      console.log("module.hot.accept() called");

      const reloadMemento = module.hot.data.reloadMemento;
      console.log("reloading from", reloadMemento);

      const tickInfo: chip.TickInfo = {
        timeSinceLastTick: 0,
      };
      this._rootChip.terminate(tickInfo);
      this._rootChip.activate(
        tickInfo,
        this._rootContext,
        chip.makeSignal("reload"),
        reloadMemento
      );
    });
  }
}
