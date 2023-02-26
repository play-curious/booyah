import * as _ from "underscore";

import * as entity from "./entity";
import * as util from "./util";

export class CreditsEntityOptions {
  // @credits like { "Game Design": ["JC", "Jesse"], }
  credits: { [k: string]: string[] | string } = {};
  textSize = 32;
  fontFamily: string;
  closeButtonTexture: PIXI.Texture;
  closeButtonPosition = new PIXI.Point(50, 50);
}

export class CreditsEntity extends entity.CompositeEntity {
  public container: PIXI.Container;
  public mask: PIXI.Graphics;

  private _options: CreditsEntityOptions;

  constructor(options: Partial<CreditsEntityOptions>) {
    super();

    this._options = util.fillInOptions(options, new CreditsEntityOptions());
  }

  _setup() {
    this.container = new PIXI.Container();

    let rolesText = "";
    let peopleText = "";
    let didFirstLine = false;
    for (let role in this._options.credits) {
      if (didFirstLine) {
        rolesText += "\n";
        peopleText += "\n";
      } else {
        didFirstLine = true;
      }

      rolesText += role;

      // Their could be one person credited (string), or an array
      const people = _.isArray(this._options.credits[role])
        ? this._options.credits[role]
        : [this._options.credits[role]];
      for (let person of people) {
        rolesText += "\n";
        peopleText += person + "\n";
      }
    }

    const mask = new PIXI.Graphics();
    mask.beginFill(0x000000);
    mask.drawRect(
      0,
      0,
      this._entityConfig.app.screen.width,
      this._entityConfig.app.screen.height
    );
    mask.endFill();
    mask.alpha = 0.8;
    mask.interactive = true;
    this.container.addChild(mask);

    const closeButton = new PIXI.Sprite(this._options.closeButtonTexture);
    closeButton.anchor.set(0.5);
    closeButton.position.copyFrom(this._options.closeButtonPosition);
    closeButton.interactive = true;
    this._on(
      closeButton,
      "pointertap",
      () => (this._transition = entity.makeTransition())
    );
    this.container.addChild(closeButton);

    const roles = new PIXI.Text(rolesText, {
      fontFamily: this._options.fontFamily,
      fontSize: this._options.textSize,
      fill: "white",
      align: "right",
    });
    roles.anchor.set(1, 0.5);
    roles.position.set(
      this._entityConfig.app.renderer.width / 2 - 10,
      this._entityConfig.app.renderer.height / 2
    );
    this.container.addChild(roles);

    const people = new PIXI.Text(peopleText, {
      fontFamily: this._options.fontFamily,
      fontSize: this._options.textSize,
      fill: "white",
      align: "left",
    });
    people.anchor.set(0, 0.5);
    people.position.set(
      this._entityConfig.app.renderer.width / 2 + 10,
      this._entityConfig.app.renderer.height / 2
    );
    this.container.addChild(people);

    this._entityConfig.container.addChild(this.container);
  }

  _teardown() {
    this._entityConfig.container.removeChild(this.container);
  }
}
