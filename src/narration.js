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
        this.config.narrator.stopNarration(this.narrationKey);
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
// Returns Map of file names to Howl objects, with sprite definintions
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmFycmF0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vdHlwZXNjcmlwdC9uYXJyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxLQUFLLE1BQU0sTUFBTSxhQUFhLENBQUM7QUFDdEMsT0FBTyxLQUFLLEtBQUssTUFBTSxZQUFZLENBQUM7QUFDcEMsT0FBTyxDQUFDLE1BQU0sWUFBWSxDQUFDO0FBRTNCLE1BQU0sYUFBYSxHQUFHLEtBQUssR0FBRyxHQUFHLENBQUMsQ0FBQyx1QkFBdUI7QUFFMUQ7O0dBRUc7QUFDSCxNQUFNLE9BQU8sUUFBUyxTQUFRLE1BQU0sQ0FBQyxNQUFNO0lBaUJ6Qyx1QkFBdUI7SUFDdkIsWUFDUyxXQUE0QixFQUM1QixjQUFrQjtRQUV6QixLQUFLLEVBQUUsQ0FBQztRQUhELGdCQUFXLEdBQVgsV0FBVyxDQUFpQjtRQUM1QixtQkFBYyxHQUFkLGNBQWMsQ0FBSTtRQVBwQixjQUFTLEdBQUcsQ0FBQyxDQUFBO0lBVXBCLENBQUM7SUFFRCxLQUFLLENBQUMsTUFBVTtRQUNkLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFcEIsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUV0QyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRTtZQUN4QyxVQUFVLEVBQUUsa0JBQWtCO1lBQzlCLFFBQVEsRUFBRSxFQUFFO1lBQ1osSUFBSSxFQUFFLE9BQU87WUFDYixlQUFlLEVBQUUsQ0FBQztZQUNsQixLQUFLLEVBQUUsUUFBUTtZQUNmLFFBQVEsRUFBRSxJQUFJO1lBQ2QsYUFBYSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUcsR0FBRztTQUNsRCxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxD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