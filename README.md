# BOOYAH

This is a HTML5 browser-based game framework, written entirely in TypeScript.

## Installation

Install the Yarn package manager.

Run `yarn` to install the dependencies.

## Tests

We use [Jest](https://jestjs.io/) for unit tests on certain parts of Booyah. You can run them using `yarn test`.

To only run some tests, use `yarn jest -t <name of test>`.

To debug the unit tests, check out the [Jest docs](https://jestjs.io/docs/en/troubleshooting). The general steps are:

1. Put a `debugger` statement in the test you want to inspect
2. Run the Node process that an external debugger can connect to. For example, on Mac, run: `node --inspect-brk node_modules/.bin/jest --runInBand`.
3. Connect either with Chrome DevTools by going to `chrome://inspect` and selecting the Node process, or with an IDE by configuring it [as described](https://jestjs.io/docs/troubleshooting).

## Copyright

Copyright Jesse Himmelstein, 2017.

## License

Released under an MIT License.
