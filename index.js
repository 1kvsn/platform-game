var simpleLevelPlan = `
......................
..#................#..
..#..............=.#..
..#.........o.o....#..
..#.@......#####...#..
..#####............#..
......#++++++++++++#..
......##############..
......................`;

class Level {
	constructor(plan) {
		let rows = plan.trim().split("\n").map(l => [...l]);
		this.height = rows.length;
    this.width = rows[0].length;
		this.startActors = [];
		
		this.rows = rows.map((row, y) => {
      return row.map((ch, x) => {
        let type = levelChars[ch];
        if (typeof type == "string") return type;
        this.startActors.push(type.create(new Vec(x, y), ch));
        return "empty";
      });
    });
	}
}

// We’ll use a State class to track the state of a running game.
// This is a persistent data structure—updating the game state creates a new state and leaves the old one intact.
class State {
  constructor(level, actors, status) {
    this.level = level;
		this.actors = actors;

		// The status property will switch to "lost" or "won" when the game has ended.
    this.status = status;
  }

  static start(level) {
    return new State(level, level.startActors, "playing");
  }

  get player() {
    return this.actors.find(a => a.type == "player");
  }
}

// we use Vec class for our two-dimensional values, such as the position and size of actors.
class Vec {
  constructor(x, y) {
    this.x = x; this.y = y;
  }
  plus(other) {
    return new Vec(this.x + other.x, this.y + other.y);
	}
	// The times method scales a vector by a given number. It will be useful when we need to multiply a speed vector by a time interval to get the distance traveled during that time.
  times(factor) {
    return new Vec(this.x * factor, this.y * factor);
  }
}

// The player class has a property speed that stores its current speed to simulate momentum and gravity.
class Player {
  constructor(pos, speed) {
    this.pos = pos;
    this.speed = speed;
  }

  get type() { return "player"; }

  static create(pos) {
    return new Player(pos.plus(new Vec(0, -0.5)), new Vec(0, 0));
  }
}

Player.prototype.size = new Vec(0.8, 1.5);


class Lava {
  constructor(pos, speed, reset) {
    this.pos = pos;
    this.speed = speed;
    this.reset = reset;
  }

  get type() { return "lava"; }

	// The create method looks at the character that the Level constructor passes and creates the appropriate lava actor.
  static create(pos, ch) {
    if (ch == "=") {
      return new Lava(pos, new Vec(2, 0));
    } else if (ch == "|") {
      return new Lava(pos, new Vec(0, 2));
    } else if (ch == "v") {
      return new Lava(pos, new Vec(0, 3), pos);
    }
  }
}

Lava.prototype.size = new Vec(1, 1);


class Coin {
  constructor(pos, basePos, wobble) {
    this.pos = pos;
    this.basePos = basePos;
    this.wobble = wobble;
  }

  get type() { return "coin"; }

  static create(pos) {
    let basePos = pos.plus(new Vec(0.2, 0.1));
    return new Coin(basePos, basePos,
                    Math.random() * Math.PI * 2);
  }
}

Coin.prototype.size = new Vec(0.6, 0.6);

const levelChars = {
	".": "empty", 
	"#": "wall", 
	"+": "lava",
	"@": Player, 
	"o": Coin,
	"=": Lava, 
	"|": Lava, 
	"v": Lava
};

let simpleLevel = new Level(simpleLevelPlan);
console.log(`${simpleLevel.width} by ${simpleLevel.height}`);
// → 22 by 9

// The following helper function provides a succinct way to create an element and give it some attributes and child nodes:
function elt(name, attrs, ...children) {
  let dom = document.createElement(name);
  for (let attr of Object.keys(attrs)) {
    dom.setAttribute(attr, attrs[attr]);
  }
  for (let child of children) {
    dom.appendChild(child);
  }
  return dom;
}

// A display is created by giving it a parent element to which it should append itself and a level object.
class DOMDisplay {
  constructor(parent, level) {
		this.dom = elt("div", {class: "game"}, drawGrid(level));
		// The actorLayer property will be used to track the element that holds the actors so that they can be easily removed and replaced.
    this.actorLayer = null;
    parent.appendChild(this.dom);
  }

  clear() { this.dom.remove(); }
}

// Our coordinates and sizes are tracked in grid units, where a size or distance of 1 means one grid block. When setting pixel sizes, we will have to scale these coordinates up—everything in the game would be ridiculously small at a single pixel per square. The scale constant gives the number of pixels that a single unit takes up on the screen.
const scale = 20;

function drawGrid(level) {
  return elt("table", {
    class: "background",
    style: `width: ${level.width * scale}px`
  }, ...level.rows.map(row =>
    elt("tr", {style: `height: ${scale}px`},
        ...row.map(type => elt("td", {class: type})))
  ));
}

// We draw each actor by creating a DOM element for it and setting that element’s position and size based on the actor’s properties. The values have to be multiplied by scale to go from game units to pixels.
function drawActors(actors) {
  return elt("div", {}, ...actors.map(actor => {
    let rect = elt("div", {class: `actor ${actor.type}`});
    rect.style.width = `${actor.size.x * scale}px`;
    rect.style.height = `${actor.size.y * scale}px`;
    rect.style.left = `${actor.pos.x * scale}px`;
    rect.style.top = `${actor.pos.y * scale}px`;
    return rect;
  }));
}

// The syncState method is used to make the display show a given state. It first removes the old actor graphics, if any, and then redraws the actors in their new positions. 
DOMDisplay.prototype.syncState = function(state) {
  if (this.actorLayer) {
		this.actorLayer.remove();
	}
  this.actorLayer = drawActors(state.actors);
  this.dom.appendChild(this.actorLayer);
  this.dom.className = `game ${state.status}`;
  this.scrollPlayerIntoView(state);
};

// We can’t assume that the level always fits in the viewport—the element into which we draw the game. That is why the scrollPlayerIntoView call is needed. It ensures that if the level is protruding outside the viewport, we scroll that viewport to make sure the player is near its center. 

// In the scrollPlayerIntoView method, we find the player’s position and update the wrapping element’s scroll position. We change the scroll position by manipulating that element’s scrollLeft and scrollTop properties when the player is too close to the edge.

DOMDisplay.prototype.scrollPlayerIntoView = function(state) {
  let width = this.dom.clientWidth;
  let height = this.dom.clientHeight;
  let margin = width / 3;

  // The viewport
  let left = this.dom.scrollLeft, right = left + width;
  let top = this.dom.scrollTop, bottom = top + height;

  let player = state.player;
  let center = player.pos.plus(player.size.times(0.5))
                         .times(scale);

  if (center.x < left + margin) {
    this.dom.scrollLeft = center.x - margin;
  } else if (center.x > right - margin) {
    this.dom.scrollLeft = center.x + margin - width;
  }
  if (center.y < top + margin) {
    this.dom.scrollTop = center.y - margin;
  } else if (center.y > bottom - margin) {
    this.dom.scrollTop = center.y + margin - height;
  }
};