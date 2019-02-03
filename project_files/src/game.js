import * as util from "../booyah/src/util.js";
import * as booyah from "../booyah/src/booyah.js";
import * as geom from "../booyah/src/geom.js";
import * as entity from "../booyah/src/entity.js";
import * as narration from "../booyah/src/narration.js";
import * as audio from "../booyah/src/audio.js";


const gameStates = {

};


let gameTransitions = {

};

const { app } = booyah.go({
  states: gameStates,
  transitions: gameTransitions,
  splashScreen: "images/splash-screen.jpg",
});
