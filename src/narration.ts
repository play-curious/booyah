import * as PIXI from "pixi.js";

import * as entity from "./entity.js";
import * as audio from "./audio.js";
import _ from "underscore";

const TIME_PER_WORD = 60000 / 200; // 200 words per minute

/**
 * @deprecated May not be up to date with other changes in Booyah
 */
export class Narrator extends entity.Entity {
  public container: PIXI.Container;
  public narratorSubtitle: PIXI.Text;
  public characterSubtitle: PIXI.Text;
  public key: string;
  public isPlaying: boolean;
  public keyQueue: any[];
  public isPaused: boolean;
  public currentHowl: Howl;
  public currentSoundId: any;
  public keyStartTime: number;
  public nextLineAt: number;
  public lineIndex = 0;
  public lines: any[];
  public duration: number;

  // filesToHowl is a Map
  constructor(
    public filesToHowl: Map<string, Howl>,
    public narrationTable: any
  ) {
    super();
  }

  _setup() {
    this.container = new PIXI.Container();

    this.narratorSubtitle = new PIXI.Text("", {
      fontFamily: "Roboto Condensed",
      fontSize: 32,
      fill: "white",
      strokeThickness: 4,
      align: "center",
      wordWrap: true,
      wordWrapWidth: this.entityConfig.app.screen.width - 150,
    });
    this.narratorSubtitle.anchor.set(0.5, 0.5);
    this.narratorSubtitle.position.set(
      this.entityConfig.app.screen.width / 2,
      this.entityConfig.app.screen.height - 75
    );
    this.container.addChild(this.narratorSubtitle);

    this.characterSubtitle = new PIXI.Text("", {
      fontFamily: "Roboto Condensed",
      fontSize: 32,
      fill: "white",
      strokeThickness: 4,
      align: "left",
      wordWrap: true,
      wordWrapWidth: this.entityConfig.app.screen.width - 350,
    });
    this.characterSubtitle.anchor.set(0, 0.5);
    this.characterSubtitle.position.set(
      300,
      this.entityConfig.app.screen.height - 75
    );
    this.container.addChild(this.characterSubtitle);

    this.entityConfig.container.addChild(this.container);

    this.key = null;
    this.isPlaying = false;
    this.keyQueue = [];

    this.isPaused = false;
    this.currentHowl = null;
    this.currentSoundId = null;

    this._on(this.entityConfig.playOptions, "fxOn", () => this._updateMuted);
    this._on(
      this.entityConfig.playOptions,
      "showSubtitles",
      () => this._updateShowSubtitles
    );

    this._updateMuted();
    this._updateShowSubtitles();
  }

  update(frameInfo: entity.FrameInfo) {
    super.update(frameInfo);

    if (frameInfo.gameState == "paused") {
      if (!this.isPaused) {
        if (this.currentHowl) this.currentHowl.pause(this.currentSoundId);
        this.isPaused = true;
      }
    } else if (this.isPaused && this.isPlaying) {
      if (this.currentHowl) this.currentHowl.play(this.currentSoundId);
      this.isPaused = false;
    } else if (!this.isPlaying) {
      if (this.keyQueue.length > 0) {
        this.key = this.keyQueue.shift();
        this._initNarration(frameInfo.playTime);
      }
    } else if (frameInfo.playTime - this.keyStartTime >= this.nextLineAt) {
      this.lineIndex++;
      if (this.lineIndex < this.lines.length) {
        this._updateNextLineAt();
        this._updateText(
          this.lines[this.lineIndex].text,
          this.lines[this.lineIndex].speaker
        );
      } else {
        this.isPlaying = false;
        this.currentSoundId = null;
        this.currentHowl = null;

        this._updateText();
      }
    }
  }

  _teardown() {
    this.entityConfig.container.removeChild(this.container);
  }

  // @priority < 0 means to skip the narration if other narration is in progress
  changeKey(key: string, priority = 0) {
    if (!_.has(this.narrationTable, key)) {
      console.error("No key", key, "in narration table");
      return;
    }

    if (this.isPlaying && priority < 0) {
      console.log("Skipping narration", key, "of priority", priority);
      return;
    }

    // TODO sort keys by priority
    this.keyQueue.push(key);
  }

  // Stop currently playing and empty queue
  cancelAll() {
    this.keyQueue = [];

    if (this.isPlaying) {
      if (this.currentHowl) this.currentHowl.pause(this.currentSoundId);

      this.isPlaying = false;
      this.currentSoundId = null;
      this.currentHowl = null;

      this._updateText();
    }
  }

  narrationDuration(key: string) {
    const narrationInfo = this.narrationTable[key];
    // If start and end times are provided, use them
    // Else get the entire duration of the file
    if ("start" in narrationInfo) {
      return narrationInfo.end - narrationInfo.start;
    } else {
      const file = this.narrationTable[key].file || key;
      return this.filesToHowl.get(file).duration() * 1000;
    }
  }

  _onSignal(frameInfo: entity.FrameInfo, signal: string, data?: any) {
    if (signal === "reset") this.cancelAll();
  }

  _initNarration(playTime: number) {
    this.duration = this.narrationDuration(this.key);
    this.lines = this.narrationTable[this.key].dialog;
    this.lineIndex = 0;
    this.keyStartTime = playTime;
    this.isPlaying = true;

    this._updateNextLineAt();
    this._updateText(this.lines[0].text, this.lines[0].speaker);

    if (this.narrationTable[this.key].skipFile) {
      this.currentHowl = null;
    } else {
      const file = this.narrationTable[this.key].file || this.key;
      this.currentHowl = this.filesToHowl.get(file);

      // If the start time is provided, this is a sprite
      // Otherwise it's just a single file
      if ("start" in this.narrationTable[this.key]) {
        this.currentSoundId = this.currentHowl.play(this.key);
      } else {
        this.currentHowl.seek(0);
        this.currentSoundId = this.currentHowl.play();
      }
    }
  }

  _updateText(text = "", speaker: string = null) {
    if (text === "") {
      this.narratorSubtitle.text = "";
      this.characterSubtitle.text = "";
    } else if (speaker && !speaker.endsWith(".big")) {
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
    if (this.lineIndex === this.lines.length - 1) {
      this.nextLineAt = this.duration;
    } else if ("start" in this.lines[this.lineIndex + 1]) {
      this.nextLineAt = this.lines[this.lineIndex + 1].start;
    } else {
      this.nextLineAt =
        ((this.lineIndex + 1) * this.duration) / this.lines.length;
    }
  }

  _updateMuted() {
    const muted = !this.entityConfig.playOptions.options.fxOn;
    for (let howl of this.filesToHowl.values()) howl.mute(muted);
  }

  _updateShowSubtitles() {
    this.container.visible = this.entityConfig.playOptions.options.showSubtitles;
  }
}

export class SpeakerDisplay extends entity.Entity {
  public container: PIXI.Container;
  public namesToSprites: { [name: string]: PIXI.Sprite };
  public currentSpeakerName: string;

  constructor(
    public namesToImages: { [name: string]: string },
    public position = new PIXI.Point(50, 540)
  ) {
    super();
  }

  _setup(frameInfo: entity.FrameInfo, entityConfig: entity.EntityConfig) {
    this.container = new PIXI.Container();
    this.container.position = this.position;

    // Make a hidden sprite for each texture, add it to the container
    this.namesToSprites = _.mapObject(this.namesToImages, (image) => {
      const sprite = new PIXI.Sprite(
        this.entityConfig.app.loader.resources[image].texture
      );
      sprite.anchor.set(0, 1); // lower-left
      sprite.visible = false;
      this.container.addChild(sprite);
      return sprite;
    });

    this.currentSpeakerName = null;

    this._on(
      this.entityConfig.narrator,
      "changeSpeaker",
      this._onChangeSpeaker
    );

    this.entityConfig.container.addChild(this.container);
  }

  _teardown() {
    this.entityConfig.container.removeChild(this.container);
  }

  _onChangeSpeaker(speaker?: any) {
    if (this.currentSpeakerName)
      this.namesToSprites[this.currentSpeakerName].visible = false;
    if (speaker) this.namesToSprites[speaker].visible = true;
    this.currentSpeakerName = speaker;
  }
}

export class SingleNarration extends entity.Entity {
  constructor(public narrationKey: string, public priority = 0) {
    super();
  }

  _setup() {
    this.entityConfig.narrator.changeKey(this.narrationKey, this.priority);
    this._on(this.entityConfig.narrator, "done", this._onNarrationDone);
  }

  _onNarrationDone(key?: string) {
    if (key === this.narrationKey) this.transition = entity.makeTransition();
  }

  _teardown() {
    /* TODO: make <Narrator>.stopNarration method
      this.entityConfig.narrator.stopNarration(this.narrationKey);
    */
  }
}

export class RandomNarration extends entity.Entity {
  public narrationPlaylist: any[] = [];
  public currentKey: string = null;

  constructor(public narrationKeys: string[], public priority: number) {
    super();
  }

  _setup() {
    // If this is the first time or we have played everything, make a new playlist
    if (this.narrationPlaylist.length === 0) {
      this.narrationPlaylist = _.shuffle(this.narrationKeys);
    }

    // Pick the next key in the list
    this.currentKey = this.narrationPlaylist.shift();
    this.entityConfig.narrator.changeKey(this.currentKey, this.priority);
  }

  _update(frameInfo: entity.FrameInfo) {
    if (
      frameInfo.timeSinceStart >=
      this.entityConfig.narrator.narrationDuration(this.currentKey)
    ) {
      this.transition = entity.makeTransition();
    }
  }

  _teardown() {
    this.currentKey = null;
  }
}

export interface VideoSceneOptions {
  video: null;
  loopVideo: false;
  narration: null;
  music: null;
}

/** 
  Launches a complete video scene, complete with a video, narration, music, and skip button.
  Terminates when either the video completes, or the skip button is pressed. 
 */
export class VideoScene extends entity.CompositeEntity {
  public options: VideoSceneOptions;
  public narration: SingleNarration;
  public video: entity.VideoEntity;
  public skipButton: entity.SkipButton;
  public previousMusic: string;

  constructor(options: Partial<VideoSceneOptions> = {}) {
    super();

    this.options = _.defaults(options, {
      video: null,
      loopVideo: false,
      narration: null,
      music: null,
    });
  }

  _setup(frameInfo: entity.FrameInfo, entityConfig: entity.EntityConfig) {
    if (this.options.narration) {
      this.narration = new SingleNarration(this.options.narration);
      this._activateChildEntity(this.narration);
    }

    if (this.options.video) {
      this.video = new entity.VideoEntity(this.options.video, {
        loop: this.options.loopVideo,
      });
      this._activateChildEntity(this.video);
    }

    if (this.options.music) {
      this.previousMusic = this.entityConfig.jukebox.musicName;
      this.entityConfig.jukebox.changeMusic(this.options.music);
    }

    this.skipButton = new entity.SkipButton();
    this._activateChildEntity(this.skipButton);
  }

  _update(frameInfo: entity.FrameInfo) {
    if (
      (this.options.video && this.video.transition) ||
      this.skipButton.transition
    ) {
      this.transition = entity.makeTransition();
    }
  }

  _teardown() {
    if (this.options.music)
      this.entityConfig.jukebox.changeMusic(this.previousMusic);
  }
}

export function makeNarrationKeyList(prefix: number, count: number): number[] {
  const list = [];
  for (let i = 0; i < count; i++) list.push(prefix + i);
  return list;
}

/** Returns Map of file names to Howl objects, with sprite definintions */
export function loadNarrationAudio(
  narrationTable: { [k: string]: any },
  languageCode: string
) {
  // Prepare map of file names to sprite names
  const fileToSprites = new Map<string, any>();
  for (let key in narrationTable) {
    const value = narrationTable[key];
    if (value.skipFile) continue;

    const file = value.file || key; // File name defaults to the key name
    if (!fileToSprites.has(file)) fileToSprites.set(file, {}); // Insert empty sprite def if not present
    if ("start" in value) {
      fileToSprites.get(file)[key] = [value.start, value.end - value.start];
    }
  }

  // Create map of file names to Howl objects
  const fileToHowl = new Map<string, Howl>();
  for (let [file, sprites] of fileToSprites) {
    fileToHowl.set(
      file,
      new Howl({
        src: _.map(
          audio.AUDIO_FILE_FORMATS,
          (audioFormat) => `audio/voices/${languageCode}/${file}.${audioFormat}`
        ),
        sprite: sprites,
      })
    );
  }
  return fileToHowl;
}

export function loadScript(
  languageCode: string
): Promise<XMLHttpRequestResponseType> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", `scripts/script_${languageCode}.json`);
    request.responseType = "json";
    request.onload = () => resolve(request.response);
    request.onerror = reject;
    request.send();
  });
}

export function makeNarrationLoader(
  narrationTable: { [k: string]: any },
  languageCode: string
) {
  // Load audio
  const narrationAudio = loadNarrationAudio(narrationTable, languageCode);

  const narrationLoadPromises = Array.from(
    narrationAudio.values(),
    audio.makeHowlerLoadPromise
  );

  // TODO: report progress
  // _.each(narrationLoadPromises, p =>
  //   p.then(() => {
  //     variableAudioLoaderProgress += 1 / narrationLoadPromises.length;
  //     updateLoadingProgress();
  //   })
  // );

  return Promise.all(narrationLoadPromises).catch((err) => {
    console.error("Error loading narration", err);
  });
}

export function breakDialogIntoLines(text: string) {
  // Regular expression to match dialog lines like "[Malo:481] Ahoy there, matey!"
  const r = /^(?:\[([^:]+)?(?:\:(\d+))?\])?(.*)/;
  const rNewLines = /__/g;

  const dialogLines = [];
  for (const textLine of text.split("--")) {
    // speaker and start can both be undefined, and will be stripped from the transition
    let [, speaker, start, dialog] = r.exec(textLine);
    //@ts-ignore
    if (start) start = parseInt(start);
    dialog = dialog.trim();

    if (dialog.length > 0) {
      const textWithNewLines = dialog.replace(rNewLines, "\n");
      dialogLines.push({
        speaker,
        text: textWithNewLines,
        start,
      });
    }
  }

  return dialogLines;
}

export function estimateDuration(
  text: string,
  timePerWord: number = TIME_PER_WORD
) {
  const wordCount = text.trim().split(/[\s\.\!\?]+/).length;
  return wordCount * timePerWord;
}
