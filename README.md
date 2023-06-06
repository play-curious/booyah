# BOOYAH

This is a HTML5 browser-based game framework, written entirely in TypeScript.

## What makes it different?

Popular game engines like Unity and Unreal empower game creators to make sophisticated games by bundling advanced tools for 3D rendering, physics, compilation and multiplayer. However, the programmer still has to structure their game code so that different parts of their program can work together seamlessly. This is an arduous task in any large program, and I argue that the abstractions provided by popular engines, such as the Entity-Component-System pattern, aren’t up to the job. Instead, they easily lead to the kind of “spaghetti” code that makes developers tear their hair out.

I have developed an open-source framework for game development which helps with structuring game code, using a few interlocking design patterns. As far as I know, the approach is fairly unique. Here are some key points:

1. The basic building block is a small state machine, which we call a _chip_. The chip goes through a lifecycle of activating (starting up), updating itself on regular intervals (ticks), and finally terminating (shutting down). It can repeat this cycle multiple times. A chip is free to do anything during these steps. For example, a chip that shows text on the screen might add the text to the scene tree in the activation step, move it around across multiple tick steps, and finally remove it during the termination step. The termination can either happen because the chip requests it, or because its parent forces it to.

2. These chips are structured into a hierarchy, with “parent” (composite) chips controlling “child” chips. Because child chips can terminate them, we use these structures for flow control. For example, a sequential chip will run one child chip at a time, moving to the next once the previous completes. A parallel chip runs multiple chips, until all are complete. A “race” chip runs multiple children until the first one finishes, at which point it terminates the others. This is similar to how promises/futures are used in many programming languages to handle asynchronous tasks. Finally, we offer a complete state machine implementation, in which each state corresponds to a child chip.

3. Parent chips provide a “context” for their children, which is a simple map of strings to data, which can be system services, configuration, or other chips. By default, the context is passed down directly to children, but each chip in the hierarchy has the possibility to extend the context by adding new key-value pairs, or overloading previous ones. This mechanism allows us to avoid global variables or singletons. For example, instead of a global variable for an "AudioManager” component, the root context can contain a key for “audioManager” that maps to the component that handles this task.

4. Interestingly, this same context mechanism also enables us to link into other hierarchies such as scene trees. For example, a parent chip might create a scene tree, passing the root transform to its children. The child will create a new transform, add it to the one provided to it, and overwrite the context for its own children to point to the new transform it created. Rather than tying our framework to a particular rendering technology, the same framework can be used with a variety of libraries, whether rendering to 2D, 3D, or even the DOM.

## Use

To use Booyah for your project, install it with `yarn add booyah` or `npm i booyah`.

Then follow the [Getting Started guide](https://github.com/play-curious/booyah/wiki), or read the [API Documentation](https://play-curious.github.io/booyah/).

We suggest using a packaging tool such as [Parcel](https://parceljs.org/) or [Webpack](https://webpack.js.org/) to bring together all your assets into bundles, as well as provide a auto-reloading web server.

## Libraries

In addition to TypeScript, we also rely heavily on the following libraries:

- [Underscore.js](https://underscorejs.org/) to do functional-style coding.
- [EventEmitter3](https://github.com/primus/eventemitter3) for a fast events framework.

Of course, you'll probably want to use libraries for rendering and audio, among other things. To keep Booyah independent of a particular game tools, those integrations are provided in separate libraries:

- [booyah-pixi](https://github.com/play-curious/booyah-pixi) integrates into [PixiJS](https://pixijs.com/) and [PixiJS Sound](https://github.com/pixijs/sound).
- More to come...

## Development

Install the Yarn package manager.

Run `yarn` to install the dependencies.

## Coding Standards

To save time dealing with coding standards, we use [Prettier](https://prettier.io/). It integrates nicely into most IDEs, so that Prettier will reformat the code upon save.

In the same vein, we use [ESLint](https://eslint.org/) to catch certain coding errors.

We use [Jest](https://jestjs.io/) for unit tests on certain parts of Booyah. You can run them using `yarn test`.

In addition to what Prettier enforces, there are a few standards that we enforce in Booyah:

- Indentation: 2-character indents, using spaces.
- Case: Camel-case variables and class names. Class names start with capital letters
- Private or protected methods & attributes should start with an underscore.
- Use a single blank line to separate functions and methods. Prettier will remove multiple blank lines.
- Documentation: Document classes and methods using multiline comments like `/** ... */`.
- For functions or methods that take more than 1 arguments, consider using an object to contain all the optional attributes. Naming the arguments avoids errors and having to decide the correct order or the arguments. The function `chip.fillInOptions()` can make this process easier by filling in default values.  

### Coding Chips

Specifically for chips, here are general rules for making them resusable:

- Attributes should generally be private. Otherwise the values could be modified by any other code at any time. If external code needs access to them, provide getters and (potentially) setters.
- Most attributes should be initialized in the `_onActivate()` method, not in the constructor. The exception are "options" provided in the constructor that describe how the chip should work.
- Parent chips should generally call methods directly on their child chips. Inversely, however, child chips should _not_ call parent methods. Instead, child chips can emit events that parents subscribe and react to. The exception is "services" chips that are available more or less globally, such as an audio player or a metrics service, which should be created so that any code can call them.  

## Tests

We use [Jest](https://jestjs.io/) for unit tests on certain parts of Booyah. You can run them using `yarn test`.

To only run some tests, use `yarn jest -t <name of test>`.

To debug the unit tests, check out the [Jest docs](https://jestjs.io/docs/en/troubleshooting). The general steps are:

1. Put a `debugger` statement in the test you want to inspect
2. Run the Node process that an external debugger can connect to. For example, on Mac, run: `node --inspect-brk node_modules/.bin/jest --runInBand`.
3. Connect either with Chrome DevTools by going to `chrome://inspect` and selecting the Node process, or with an IDE by configuring it [as described](https://jestjs.io/docs/troubleshooting).

## Copyright

Copyright Jesse Himmelstein, 2017-2023

## License

Released under an MIT License.
