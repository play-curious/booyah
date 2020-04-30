import * as util from "../booyah/src/util.ts";
import * as booyah from "../booyah/src/booyah.js";
import * as geom from "../booyah/src/geom.ts";
import * as entity from "../booyah/src/entity.ts";
import * as narration from "../booyah/src/narration.ts";
import * as audio from "../booyah/src/audio.ts";

const gameStates = {
  // TODO: Fill in states here
};

let gameTransitions = {};

const entityInstallers = [
  audio.installJukebox,
  audio.installFxMachine,
  booyah.installMenu
];

const { app } = booyah.go({
  states: gameStates,
  transitions: gameTransitions,
  entityInstallers
});
