// Import Booyah dependencies
import * as chip from "booyah/src/chip";
import * as running from "booyah/src/running";

// Generates random numbers and shows them on the web page
class RandomNumberGenerator extends chip.ChipBase {
  // The generator will create numbers between 0 and `_max`
  constructor(
    private readonly _elementId: string,
    private readonly _max: number = 100
  ) {
    super();
  }

  // Called once on each activation
  protected _onActivate(): void {
    // Pick the number
    const number = Math.floor(Math.random() * this._max);

    // Update the HTML document to show the number
    const element = document.getElementById(this._elementId) as HTMLDivElement;
    element.innerText = number.toString();

    // Terminate yourself
    this.terminate();
  }
}

// Our random number generator
const rng1 = new RandomNumberGenerator("random-number-1");
// Our random number generator
const rng2 = new RandomNumberGenerator("random-number-2");

// A chip that waits for 1 second
const wait = new chip.Wait(1000);

// Put the two random number generators in parallel
const parallel = new chip.Parallel([rng1, rng2]);

// A chip that runs an infinite loop of random number generators followed by the wait
const sequence = new chip.Sequence([parallel, wait], { loop: true });

// Create a runner that runs the chip
const runner = new running.Runner(sequence);

// Start the chip. It will stop itself
runner.start();
