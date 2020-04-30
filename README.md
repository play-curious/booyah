# BOOYAH

Game framework for Play Curious.

## Architecture

This is a HTML5 browser-based game framework, written entirely in JavaScript. The source code is directly readable in modern browsers supporting ECMAScript modules. We use Rollup to make a version for browsers without module support, Babel to support older browsers without recent JavaScript features, and UglifyJS to compress the JavaScript.

A Gulp script automates the building process.

## Development

1. Install dependencies:

- npm and gulp-cli if you don't have them.
- Install ffmpeg for audio and video work. On Mac: `brew install ffmpeg --with-libvorbis --with-theora --with-libvpx`

2. Copy or clone this directory into your project directoy as `booyah`.
3. Bootstrapping:

- Run `node booyah/boot` on your project folder **or bootstrap manually with the following instructions**
- Copy starter files from `booyah` into your project directory: `cp -r booyah/project_files/. .`
- Install the dependencies with `npm install`.
    
> At this point, you can already test by running a local webserver and visiting `index.html`.

## Production

1. Use `gulp build` to compile to a version for older browsers in the `build` directory. Use `gulp watch` to automatically re-compile when you change a file.
2. To generate minified version in the `dist` directory, use `gulp dist`.
3. Update `package.json` to set the `name` of the game. Update the `index.html` file to include sharing links and metadata description.
4. Use `gulp deploy` to include the game in the Play Curious website (see gulpfile for more details)

### File structure

The `src` directory is for your game code. By default, the module `src/game.js` is executed by `index.html`.

The game code can start by importing Booyah:

```javascript
import * as util from "../booyah/src/util.ts";
import * as booyah from "../booyah/src/booyah.js";
import * as geom from "../booyah/src/geom.ts";
import * as entity from "../booyah/src/entity.ts";
import * as narration from "../booyah/src/narration.js";
import * as audio from "../booyah/src/audio.js";
```

You can then call the Booyah framework like this:

```javascript
const { app } = booyah.go({
  states: gameStates,
  transitions: gameTransitions,
  splashScreen: "images/splash-screen.jpg"
});
```

## Code Hygiene

Code is formatted using [Prettier](https://prettier.io/) using the standard settings. [ESLint](https://eslint.org/) is used to check for errors. A configuration file for ESLint can be found under `project_files`.

### Audio

To convert voices, use a command like:

```
for wav in voices_src/fr/*.wav
do
  output_filename=$(basename $wav .wav)
  ffmpeg -y -i $wav audio/voices/fr/$output_filename.mp3
done
```

## Copyright

Copyright Jesse Himmelstein, 2017.

## License

Released under an MIT License.
