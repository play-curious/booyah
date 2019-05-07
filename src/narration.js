import * as util from "./util.js";
import * as entity from "./entity.js";
import * as audio from "./audio.js";



export class Narrator extends entity.Entity {
  // filesToHowl is a Map
  // @options is { muted = false, showSubtitles = true }
  constructor(filesToHowl, narrationTable, options = {}) {
    super();

    this.filesToHowl = filesToHowl;
    this.narrationTable = narrationTable;

    _.defaults(options, {
      muted: false,
      showSubtitles: false,
    });

    this.muted = options.muted;
    this.showSubtitles = options.showSubtitles;

    this._updateMuted();
  }

  setup(config) {
    super.setup(config);

    this.container = new PIXI.Container();

    this.narratorSubtitle = new PIXI.Text("", {
      fontFamily: "Roboto Condensed", 
      fontSize: 32, 
      fill: "white",
      strokeThickness: 4,
      align: "center",
      wordWrap: true,
      wordWrapWidth: this.config.app.screen.width - 150
    });
    this.narratorSubtitle.anchor.set(0.5, 0.5);
    this.narratorSubtitle.position.set(this.config.app.screen.width / 2, this.config.app.screen.height - 75);
    this.container.addChild(this.narratorSubtitle);

    this.characterSubtitle = new PIXI.Text("", {
      fontFamily: "Roboto Condensed", 
      fontSize: 32, 
      fill: "white",
      strokeThickness: 4,
      align: "left",
      wordWrap: true,
      wordWrapWidth: this.config.app.screen.width - 350
    });
    this.characterSubtitle.anchor.set(0, 0.5);
    this.characterSubtitle.position.set(300, this.config.app.screen.height - 75);
    this.container.addChild(this.characterSubtitle);

    this._updateShowSubtitles();

    this.key = null;
    this.isPlaying = false;
    this.keyQueue = [];

    this.isPaused = false;
    this.currentHowl = null;
    this.currentSoundId = null;

    this.config.container.addChild(this.container);
  }

  update({playTime, timeScale, gameState}) {
    super.update({playTime, timeScale, gameState});
    
    if(gameState == "paused") {
      if(!this.isPaused) {
        if(this.currentHowl) this.currentHowl.pause(this.currentSoundId);
        this.isPaused = true;
      }
    } else if(this.isPaused && this.isPlaying) {
      if(this.currentHowl) this.currentHowl.play(this.currentSoundId);
      this.isPaused = false;
    } else if(!this.isPlaying) {
      if(this.keyQueue.length > 0) {
        this.key = this.keyQueue.shift();
        this._initNarration(playTime);
      }
    } else if(playTime - this.keyStartTime >= this.nextLineAt) {
      this.lineIndex++;
      if(this.lineIndex < this.lines.length) {
        this._updateNextLineAt();
        this._updateText(this.lines[this.lineIndex].text, this.lines[this.lineIndex].speaker);
      } else {
        this.isPlaying = false;
        this.currentSoundId = null;
        this.currentHowl = null;

        this._updateText();
      }
    }
  }

  teardown() {
    this.config.container.removeChild(this.container);

    super.teardown();
  }

  // @priority < 0 means to skip the narration if other narration is in progress
  changeKey(key, priority = 0) {
    if(!_.has(this.narrationTable, key)) {
      console.error("No key", key, "in narration table");
      return;
    }

    if(this.isPlaying && priority < 0) {
      console.log("Skipping narration", key, "of priority", priority);
      return;
    }

    // TODO sort keys by priority
    this.keyQueue.push(key);
  }

  // Stop currently playing and empty queue  
  cancelAll() {
    this.keyQueue = [];

    if(this.isPlaying) {
      if(this.currentHowl) this.currentHowl.pause(this.currentSoundId);

      this.isPlaying = false;
      this.currentSoundId = null;
      this.currentHowl = null;

      this._updateText();
    }
  }

  narrationDuration(key) {
    const narrationInfo = this.narrationTable[key];
    // If start and end times are provided, use them
    // Else get the entire duration of the file
    if("start" in narrationInfo) {
      return narrationInfo.end - narrationInfo.start; 
    } else {
      const file = this.narrationTable[key].file || key;
      return this.filesToHowl.get(file).duration() * 1000;
    }
  }

  onSignal(signal, data = null) {
    super.onSignal(signal, data);
  }

  setMuted(isMuted) {
    this.muted = isMuted;
    this._updateMuted();
  }

  setShowSubtitles(showSubtitles) {
    this.showSubtitles = showSubtitles;
    this._updateShowSubtitles();
  }

  _initNarration(playTime) {
    this.duration = this.narrationDuration(this.key); 
    this.lines = this.narrationTable[this.key].dialog;
    this.lineIndex = 0;
    this.keyStartTime = playTime;
    this.isPlaying = true;

    this._updateNextLineAt();
    this._updateText(this.lines[0].text, this.lines[0].speaker);

    if(this.narrationTable[this.key].skipFile) {
      this.currentHowl = null;
    } else {
      const file = this.narrationTable[this.key].file || this.key;
      this.currentHowl = this.filesToHowl.get(file);

      // If the start time is provided, this is a sprite
      // Otherwise it's just a single file
      if("start" in this.narrationTable[this.key]) {
        this.currentSoundId = this.currentHowl.play(this.key);
      } else {
        this.currentHowl.seek(0);
        this.currentSoundId = this.currentHowl.play();
      }
    }
  }

  _updateText(text = "", speaker = null) {
    if(text === "") {
      this.narratorSubtitle.text = ""; 
      this.characterSubtitle.text = ""; 
    } else if(speaker && !speaker.endsWith(".big")) {
      this.narratorSubtitle.text = ""; 
      this.characterSubtitle.text = text;
    } else {
      this.narratorSubtitle.text = text; 
      this.characterSubtitle.text = ""; 
    }

    this.emit("changeSpeaker", speaker);
  }

  // Must be called after this.duration, this.lines, this.lineIndex, etc.. have been set
  _updateNextLineAt() {
    if(this.lineIndex === this.lines.length - 1) {
      this.nextLineAt = this.duration;
    } else if("start" in this.lines[this.lineIndex + 1]) {
      this.nextLineAt = this.lines[this.lineIndex + 1].start;
    } else {
      this.nextLineAt = (this.lineIndex + 1) * this.duration / this.lines.length;
    }
  }

  _updateMuted() {
    for(let howl of this.filesToHowl.values()) howl.mute(this.muted);
  }

  _updateShowSubtitles() {
    this.container.visible = this.showSubtitles;
  }
}

export class SpeakerDisplay extends entity.Entity {
  constructor(namesToImages, position = new PIXI.Point(50, 540)) {
    super();

    this.namesToImages = namesToImages;
    this.position = position;
  }

  setup(config) {
    super.setup(config);

    this.container = new PIXI.Container();
    this.container.position = this.position;

    // Make a hidden sprite for each texture, add it to the container
    this.namesToSprites = _.mapObject(this.namesToImages, image => {
      const sprite = new PIXI.Sprite(this.config.app.loader.resources[image].texture);
      sprite.anchor.set(0, 1); // lower-left
      sprite.visible = false;
      this.container.addChild(sprite);
      return sprite;
    });

    this.currentSpeakerName = null;

    this._on(this.config.narrator, "changeSpeaker", this._onChangeSpeaker);

    this.config.container.addChild(this.container);
  }

  teardown() {
    this.config.container.removeChild(this.container);

    super.teardown();
  }

  _onChangeSpeaker(speaker) {
    if(this.currentSpeakerName)
      this.namesToSprites[this.currentSpeakerName].visible = false;
    if(speaker)
      this.namesToSprites[speaker].visible = true;
    this.currentSpeakerName = speaker;
  }
}


export class SingleNarration extends entity.Entity {
  constructor(narrationKey, priority = 0) {
    super();
    
    this.narrationKey = narrationKey;
    this.priority = priority;
  }

  setup(config) {
    super.setup(config);

    this.config.narrator.changeKey(this.narrationKey, this.priority);
  }

  _update(options) { 
    // TODO: This timing only works assuming that the narration was launched immediately
    if(options.timeSinceStart >= this.config.narrator.narrationDuration(this.narrationKey)) {
      this.requestedTransition = true;
    }
  }

  teardown() {
    this.config.narrator.cancelAll();

    super.teardown();
  }
}

export class RandomNarration extends entity.Entity {
  constructor(narrationKeys, priority) {
    super();
    
    this.narrationKeys = narrationKeys;
    this.priority = priority;

    this.narrationPlaylist = [];
    this.currentKey = null;
  }

  setup(config) {
    super.setup(config);

    // If this is the first time or we have played everything, make a new playlist
    if(this.narrationPlaylist.length === 0) {
      this.narrationPlaylist = _.shuffle(this.narrationKeys);
    }

    // Pick the next key in the list
    this.currentKey = this.narrationPlaylist.shift(); 
    this.config.narrator.changeKey(this.currentKey, this.priority);
  }

  _update(options) { 
    if(options.timeSinceStart >= this.config.narrator.narrationDuration(this.currentKey)) {
      this.requestedTransition = true;
    } 
  }

  teardown() {
    this.currentKey = null;

    super.teardown();
  }
}

/** 
  Launches a complete video scene, complete with a video, narration, music, and skip button.
  Terminates when either the naration completes, the video completes, or the skip button is pressed. 
 */
export class VideoScene extends entity.ParallelEntity {
  constructor(options = {}) {
    super();

    this.options = _.defaults(options, {
      video: null,
      loopVideo: false,
      narration: null,
      music: null,
    });
  }
  
  setup(config) {
    super.setup(config);

    if(this.options.narration) {
      this.narration = new SingleNarration(this.options.narration);
      this.addEntity(this.narration);
    }

    if(this.options.video) {
      this.video = new entity.VideoEntity(this.options.video, { loop: this.options.loopVideo });
      this.addEntity(this.video);
    }

    if(this.options.music) {
      this.config.jukebox.changeMusic(this.options.music);
    }

    this.skipButton = new entity.SkipButton(); 
    this.addEntity(this.skipButton);
  }

  _update(options) { 
    if(this.options.narration && this.narration.requestedTransition ||
      this.options.video && this.video.requestedTransition ||
      this.skipButton.requestedTransition) {
      this.requestedTransition = true;
    }
  }

  teardown() {
    this.config.narrator.cancelAll();
    this.config.jukebox.changeMusic();


    super.teardown();
  }
}



export function makeNarrationKeyList(prefix, count) {
  const list = [];
  for(let i = 0; i < count; i++) list.push(prefix + i);
  return list;
}


// Returns Map of file names to Howl objects, with sprite definintions
export function loadNarrationAudio(narrationTable, languageCode) {
  // Prepare map of file names to sprite names
  const fileToSprites = new Map(); 
  for(let key in narrationTable) {
    const value = narrationTable[key];
    if(value.skipFile) continue; 

    const file = value.file || key; // File name defaults to the key name
    if(!fileToSprites.has(file)) fileToSprites.set(file, {}); // Insert empty sprite def if not present
    if("start" in value) {
      fileToSprites.get(file)[key] = [value.start, value.end - value.start]; 
    }
  }

  // Create map of file names to Howl objects
  const fileToHowl = new Map();
  for(let [file, sprites] of fileToSprites) {
    fileToHowl.set(file, new Howl({
      src: _.map(audio.AUDIO_FILE_FORMATS, (audioFormat) => `audio/voices/${languageCode}/${file}.${audioFormat}`),
      sprite: sprites
    }));
  }
  return fileToHowl;
}

export function loadScript(languageCode) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', `scripts/script_${languageCode}.json`);
    request.responseType = 'json';
    request.onload = () => resolve(request.response);
    request.onerror = reject;
    request.send();
  });
};

