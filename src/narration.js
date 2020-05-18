import * as entity from "./entity.js";
import * as audio from "./audio.js";
import _ from "underscore";
const TIME_PER_WORD = 60000 / 200; // 200 words per minute
/**
 * @deprecated May not be up to date with other changes in Booyah
 */
export class Narrator extends entity.Entity {
    // filesToHowl is a Map
    constructor(filesToHowl, narrationTable) {
        super();
        this.filesToHowl = filesToHowl;
        this.narrationTable = narrationTable;
        this.lineIndex = 0;
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
        this.config.container.addChild(this.container);
        this.key = null;
        this.isPlaying = false;
        this.keyQueue = [];
        this.isPaused = false;
        this.currentHowl = null;
        this.currentSoundId = null;
        this._on(this.config.playOptions, "fxOn", () => this._updateMuted);
        this._on(this.config.playOptions, "showSubtitles", () => this._updateShowSubtitles);
        this._updateMuted();
        this._updateShowSubtitles();
    }
    update(options) {
        super.update(options);
        if (options.gameState == "paused") {
            if (!this.isPaused) {
                if (this.currentHowl)
                    this.currentHowl.pause(this.currentSoundId);
                this.isPaused = true;
            }
        }
        else if (this.isPaused && this.isPlaying) {
            if (this.currentHowl)
                this.currentHowl.play(this.currentSoundId);
            this.isPaused = false;
        }
        else if (!this.isPlaying) {
            if (this.keyQueue.length > 0) {
                this.key = this.keyQueue.shift();
                this._initNarration(options.playTime);
            }
        }
        else if (options.playTime - this.keyStartTime >= this.nextLineAt) {
            this.lineIndex++;
            if (this.lineIndex < this.lines.length) {
                this._updateNextLineAt();
                this._updateText(this.lines[this.lineIndex].text, this.lines[this.lineIndex].speaker);
            }
            else {
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
            if (this.currentHowl)
                this.currentHowl.pause(this.currentSoundId);
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
        if ("start" in narrationInfo) {
            return narrationInfo.end - narrationInfo.start;
        }
        else {
            const file = this.narrationTable[key].file || key;
            return this.filesToHowl.get(file).duration() * 1000;
        }
    }
    onSignal(signal, data) {
        super.onSignal(signal, data);
        if (signal === "reset")
            this.cancelAll();
    }
    _initNarration(playTime) {
        this.duration = this.narrationDuration(this.key);
        this.lines = this.narrationTable[this.key].dialog;
        this.lineIndex = 0;
        this.keyStartTime = playTime;
        this.isPlaying = true;
        this._updateNextLineAt();
        this._updateText(this.lines[0].text, this.lines[0].speaker);
        if (this.narrationTable[this.key].skipFile) {
            this.currentHowl = null;
        }
        else {
            const file = this.narrationTable[this.key].file || this.key;
            this.currentHowl = this.filesToHowl.get(file);
            // If the start time is provided, this is a sprite
            // Otherwise it's just a single file
            if ("start" in this.narrationTable[this.key]) {
                this.currentSoundId = this.currentHowl.play(this.key);
            }
            else {
                this.currentHowl.seek(0);
                this.currentSoundId = this.currentHowl.play();
            }
        }
    }
    _updateText(text = "", speaker = null) {
        if (text === "") {
            this.narratorSubtitle.text = "";
            this.characterSubtitle.text = "";
        }
        else if (speaker && !speaker.endsWith(".big")) {
            this.narratorSubtitle.text = "";
            this.characterSubtitle.text = text;
        }
        else {
            this.narratorSubtitle.text = text;
            this.characterSubtitle.text = "";
        }
        this.emit("changeSpeaker", speaker);
    }
    // Must be called after this.duration, this.lines, this.lineIndex, etc.. have been set
    _updateNextLineAt() {
        if (this.lineIndex === this.lines.length - 1) {
            this.nextLineAt = this.duration;
        }
        else if ("start" in this.lines[this.lineIndex + 1]) {
            this.nextLineAt = this.lines[this.lineIndex + 1].start;
        }
        else {
            this.nextLineAt =
                ((this.lineIndex + 1) * this.duration) / this.lines.length;
        }
    }
    _updateMuted() {
        const muted = !this.config.playOptions.options.fxOn;
        for (let howl of this.filesToHowl.values())
            howl.mute(muted);
    }
    _updateShowSubtitles() {
        this.container.visible = this.config.playOptions.options.showSubtitles;
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
        if (this.currentSpeakerName)
            this.namesToSprites[this.currentSpeakerName].visible = false;
        if (speaker)
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
    _setup() {
        this.config.narrator.changeKey(this.narrationKey, this.priority);
        this._on(this.config.narrator, "done", this._onNarrationDone);
    }
    _onNarrationDone(key) {
        if (key === this.narrationKey)
            this.requestedTransition = true;
    }
    _teardown() {
        /* TODO: make <Narrator>.stopNarration method
          this.config.narrator.stopNarration(this.narrationKey);
        */
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
        if (this.narrationPlaylist.length === 0) {
            this.narrationPlaylist = _.shuffle(this.narrationKeys);
        }
        // Pick the next key in the list
        this.currentKey = this.narrationPlaylist.shift();
        this.config.narrator.changeKey(this.currentKey, this.priority);
    }
    _update(options) {
        if (options.timeSinceStart >=
            this.config.narrator.narrationDuration(this.currentKey)) {
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
  Terminates when either the video completes, or the skip button is pressed.
 */
export class VideoScene extends entity.ParallelEntity {
    constructor(options = {}) {
        super();
        this.options = _.defaults(options, {
            video: null,
            loopVideo: false,
            narration: null,
            music: null
        });
    }
    _setup(config) {
        if (this.options.narration) {
            this.narration = new SingleNarration(this.options.narration);
            this.addEntity(this.narration);
        }
        if (this.options.video) {
            this.video = new entity.VideoEntity(this.options.video, {
                loop: this.options.loopVideo
            });
            this.addEntity(this.video);
        }
        if (this.options.music) {
            this.previousMusic = this.config.jukebox.musicName;
            this.config.jukebox.changeMusic(this.options.music);
        }
        this.skipButton = new entity.SkipButton();
        this.addEntity(this.skipButton);
    }
    _update(options) {
        if ((this.options.video && this.video.requestedTransition) ||
            this.skipButton.requestedTransition) {
            this.requestedTransition = true;
        }
    }
    _teardown() {
        if (this.options.music)
            this.config.jukebox.changeMusic(this.previousMusic);
        this.removeAllEntities();
    }
}
export function makeNarrationKeyList(prefix, count) {
    const list = [];
    for (let i = 0; i < count; i++)
        list.push(prefix + i);
    return list;
}
/** Returns Map of file names to Howl objects, with sprite definintions */
export function loadNarrationAudio(narrationTable, languageCode) {
    // Prepare map of file names to sprite names
    const fileToSprites = new Map();
    for (let key in narrationTable) {
        const value = narrationTable[key];
        if (value.skipFile)
            continue;
        const file = value.file || key; // File name defaults to the key name
        if (!fileToSprites.has(file))
            fileToSprites.set(file, {}); // Insert empty sprite def if not present
        if ("start" in value) {
            fileToSprites.get(file)[key] = [value.start, value.end - value.start];
        }
    }
    // Create map of file names to Howl objects
    const fileToHowl = new Map();
    for (let [file, sprites] of fileToSprites) {
        fileToHowl.set(file, new Howl({
            src: _.map(audio.AUDIO_FILE_FORMATS, audioFormat => `audio/voices/${languageCode}/${file}.${audioFormat}`),
            sprite: sprites
        }));
    }
    return fileToHowl;
}
export function loadScript(languageCode) {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("GET", `scripts/script_${languageCode}.json`);
        request.responseType = "json";
        request.onload = () => resolve(request.response);
        request.onerror = reject;
        request.send();
    });
}
export function makeNarrationLoader(narrationTable, languageCode) {
    // Load audio
    const narrationAudio = loadNarrationAudio(narrationTable, languageCode);
    const narrationLoadPromises = Array.from(narrationAudio.values(), audio.makeHowlerLoadPromise);
    // TODO: report progress
    // _.each(narrationLoadPromises, p =>
    //   p.then(() => {
    //     variableAudioLoaderProgress += 1 / narrationLoadPromises.length;
    //     updateLoadingProgress();
    //   })
    // );
    return Promise.all(narrationLoadPromises).catch(err => {
        console.error("Error loading narration", err);
    });
}
export function breakDialogIntoLines(text) {
    // Regular expression to match dialog lines like "[Malo:481] Ahoy there, matey!"
    const r = /^(?:\[([^:]+)?(?:\:(\d+))?\])?(.*)/;
    const rNewLines = /__/g;
    const dialogLines = [];
    for (const textLine of text.split("--")) {
        // speaker and start can both be undefined, and will be stripped from the output
        let [, speaker, start, dialog] = r.exec(textLine);
        //@ts-ignore
        if (start)
            start = parseInt(start);
        dialog = dialog.trim();
        if (dialog.length > 0) {
            const textWithNewLines = dialog.replace(rNewLines, "\n");
            dialogLines.push({
                speaker,
                text: textWithNewLines,
                start
            });
        }
    }
    return dialogLines;
}
export function estimateDuration(text, timePerWord = TIME_PER_WORD) {
    const wordCount = text.trim().split(/[\s\.\!\?]+/).length;
    return wordCount * timePerWord;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmFycmF0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vdHlwZXNjcmlwdC9uYXJyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxLQUFLLE1BQU0sTUFBTSxhQUFhLENBQUM7QUFDdEMsT0FBTyxLQUFLLEtBQUssTUFBTSxZQUFZLENBQUM7QUFDcEMsT0FBTyxDQUFDLE1BQU0sWUFBWSxDQUFDO0FBRTNCLE1BQU0sYUFBYSxHQUFHLEtBQUssR0FBRyxHQUFHLENBQUMsQ0FBQyx1QkFBdUI7QUFFMUQ7O0dBRUc7QUFDSCxNQUFNLE9BQU8sUUFBUyxTQUFRLE1BQU0sQ0FBQyxNQUFNO0lBaUJ6Qyx1QkFBdUI7SUFDdkIsWUFDUyxXQUE0QixFQUM1QixjQUFrQjtRQUV6QixLQUFLLEVBQUUsQ0FBQztRQUhELGdCQUFXLEdBQVgsV0FBVyxDQUFpQjtRQUM1QixtQkFBYyxHQUFkLGNBQWMsQ0FBSTtRQVBwQixjQUFTLEdBQUcsQ0FBQyxDQUFBO0lBVXBCLENBQUM7SUFFRCxLQUFLLENBQUMsTUFBb0I7UUFDeEIsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVwQixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBRXRDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFO1lBQ3hDLFVBQVUsRUFBRSxrQkFBa0I7WUFDOUIsUUFBUSxFQUFFLEVBQUU7WUFDWixJQUFJLEVBQUUsT0FBTztZQUNiLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLEtBQUssRUFBRSxRQUFRO1lBQ2YsUUFBUSxFQUFFLElBQUk7WUFDZCxhQUFhLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBRyxHQUFHO1NBQ2xELENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFN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