// Import Booyah dependencies
import * as chip from "booyah/src/chip";
import * as running from "booyah/src/running";

function printHelloWorld() {
  console.log("Hello world from Booyah");
}

// A Lambda chip runs an function just once and then terminates itself
// A shorter version of this next line is `new chip.Lambda(() => console.log("Hello"))`;
const helloWorldChip = new chip.Lambda(printHelloWorld);

// Create a runner that runs the chip
const runner = new running.Runner(helloWorldChip);

// Start the chip. It will stop itself
runner.start();
