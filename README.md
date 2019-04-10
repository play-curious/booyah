# BOOYAH

Game framework for Play Curious.


## Architecture

This is a HTML5 browser-based game framework, written entirely in JavaScript. The source code is directly readable in modern browsers supporting ECMAScript modules. We use Rollup to make a version for browsers without module support, Babel to support older browsers without recent JavaScript features, and UglifyJS to compress the JavaScript. 

A Gulp script automates the building process.


## Development

1. Install dependencies:
  * npm and gulp-cli if you don't have them.
  * Install ffmpeg for audio and video work. On Mac: `brew install ffmpeg --with-libvorbis --with-theora --with-libvpx`
2. Copy or clone this directory into your project directoy as `booyah`.
3. Copy a bunch of files from `booyah` into your project directory: `cp booyah/project_files/* .`
4. Install the dependencies with `npm install`. 
5. At this point, you can already test by running a local webserver and visiting `index.html`.

## Production

1. Use `gulp build` to compile to a version for older browsers in the `build` directory. Use `gulp watch` to automatically re-compile when you change a file. 
2. To generate minified version in the `dist` directory, use `gulp dist`.


### File structure

The `src` directory is for your game code. By default, the module `src/game.js` is executed by `index.html`. 

The game code can start by importing Booyah:

```javascript
import * as util from "../booyah/src/util.js";
import * as booyah from "../booyah/src/booyah.js";
import * as geom from "../booyah/src/geom.js";
import * as entity from "../booyah/src/entity.js";
import * as narration from "../booyah/src/narration.js";
import * as audio from "../booyah/src/audio.js";
```

You can then call the Booyah framework like this:

```javascript
const { app } = booyah.go({
  states: gameStates,
  transitions: gameTransitions,
  splashScreen: "images/splash-screen.jpg",
});
```


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
