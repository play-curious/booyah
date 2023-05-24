// Import Booyah dependencies
import * as chip from "booyah/src/chip";
import * as running from "booyah/src/running";

// Generates random numbers and shows them on the web page
class RandomNumberGenerator extends chip.ChipBase {
  // The generator will create numbers between 0 and `_max`
  constructor(private readonly _max: number = 100) {
    super();
  }

  // Called once on each activation
  protected _onActivate(): void {
    // Pick the number
    const number = Math.floor(Math.random() * this._max);

    // Update the HTML document to show the number
    const element = document.getElementById("random-number") as HTMLDivElement;
    element.innerText = number.toString();

    // Terminate yourself
    this.terminate();
  }
}

// Our random number generator
const rng = new RandomNumberGenerator();

// A chip that waits for 1 second
const wait = new chip.Wait(1000);

// A chip that runs an infinite loop of random number generator followed by the wait
const sequence = new chip.Sequence([rng, wait], { loop: true });

// Create a runner that runs the chip
const runner = new running.Runner(sequence);

// Start the chip. It will stop itself
runner.start();
