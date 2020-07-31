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

// This method tells us whether a rectangle (specified by a position and a size) touches a grid element of the given type.

Level.prototype.touches = function(pos, size, type) {
  var xStart = Math.floor(pos.x);
  var xEnd = Math.ceil(pos.x + size.x);
  var yStart = Math.floor(pos.y);
  var yEnd = Math.ceil(pos.y + size.y);

  // We loop over the block of grid squares found by rounding the coordinates and return true when a matching square is found. Squares outside of the level are always treated as "wall" to ensure that the player can’t leave the world and that we won’t accidentally try to read outside of the bounds of our rows array.

  for (var y = yStart; y < yEnd; y++) {
    for (var x = xStart; x < xEnd; x++) {
      let isOutside = x < 0 || x >= this.width ||
                      y < 0 || y >= this.height;
      let here = isOutside ? "wall" : this.rows[y][x];
      if (here == type) return true;
    }
  }
  return false;
};

//The state update method uses touches to figure out whether the player is touching lava.
// The method is passed a time step and a data structure that tells it which keys are being held down. 
State.prototype.update = function(time, keys) {
  // The first thing it does is call the update method on all actors, producing an array of updated actors. The actors also get the time step, the keys, and the state, so that they can base their update on those. Only the player will actually read keys, since that’s the only actor that’s controlled by the keyboard.

  let actors = this.actors
    .map(actor => actor.update(time, this, keys));
  let newState = new State(this.level, actors, this.status);

  // If the game is already over, no further processing has to be done (the game can’t be won after being lost, or vice versa). Otherwise, the method tests whether the player is touching background lava. If so, the game is lost, and we’re done. Finally, if the game really is still going on, it sees whether any other actors overlap the player.

  if (newState.status != "playing") return newState;

  let player = newState.player;
  if (this.level.touches(player.pos, player.size, "lava")) {
    return new State(this.level, actors, "lost");
  }

  for (let actor of actors) {
    if (actor != player && overlap(actor, player)) {
      newState = actor.collide(newState);
    }
  }
  return newState;
};

// Overlap between actors is detected with the overlap function. It takes two actor objects and returns true when they touch—which is the case when they overlap both along the x-axis and along the y-axis.

function overlap(actor1, actor2) {
  return actor1.pos.x + actor1.size.x > actor2.pos.x &&
         actor1.pos.x < actor2.pos.x + actor2.size.x &&
         actor1.pos.y + actor1.size.y > actor2.pos.y &&
         actor1.pos.y < actor2.pos.y + actor2.size.y;
}

// If any actor does overlap, its collide method gets a chance to update the state. Touching a lava actor sets the game status to "lost". Coins vanish when you touch them and set the status to "won" when they are the last coin of the level.
Lava.prototype.collide = function(state) {
  return new State(state.level, state.actors, "lost");
};

Coin.prototype.collide = function(state) {
  let filtered = state.actors.filter(a => a != this);
  let status = state.status;
  if (!filtered.some(a => a.type == "coin")) status = "won";
  return new State(state.level, filtered, status);
};

// Actor objects’ update methods take as arguments the time step, the state object, and a keys object. The one for the Lava actor type ignores the keys object.

// This update method computes a new position by adding the product of the time step and the current speed to its old position. If no obstacle blocks that new position, it moves there. If there is an obstacle, the behavior depends on the type of the lava block—dripping lava has a reset position, to which it jumps back when it hits something. Bouncing lava inverts its speed by multiplying it by -1 so that it starts moving in the opposite direction.
Lava.prototype.update = function(time, state) {
  let newPos = this.pos.plus(this.speed.times(time));
  if (!state.level.touches(newPos, this.size, "wall")) {
    return new Lava(newPos, this.speed, this.reset);
  } else if (this.reset) {
    return new Lava(this.reset, this.speed, this.reset);
  } else {
    return new Lava(this.pos, this.speed.times(-1));
  }
};

// Coins use their update method to wobble. They ignore collisions with the grid since they are simply wobbling around inside of their own square.
const wobbleSpeed = 8, wobbleDist = 0.07;

Coin.prototype.update = function(time) {
  // The wobble property is incremented to track time and then used as an argument to Math.sin to find the new position on the wave. The coin’s current position is then computed from its base position and an offset based on this wave.
  let wobble = this.wobble + time * wobbleSpeed;
  let wobblePos = Math.sin(wobble) * wobbleDist;
  return new Coin(this.basePos.plus(new Vec(0, wobblePos)),
                  this.basePos, wobble);
};

// Player motion is handled separately per axis because hitting the floor should not prevent horizontal motion, and hitting a wall should not stop falling or jumping motion.
const playerXSpeed = 7;
const gravity = 30;
const jumpSpeed = 17;

Player.prototype.update = function(time, state, keys) {
  let xSpeed = 0;
  if (keys.ArrowLeft) xSpeed -= playerXSpeed;
  if (keys.ArrowRight) xSpeed += playerXSpeed;
  let pos = this.pos;
  // The horizontal motion is computed based on the state of the left and right arrow keys. When there’s no wall blocking the new position created by this motion, it is used. Otherwise, the old position is kept.
  let movedX = pos.plus(new Vec(xSpeed * time, 0));
  if (!state.level.touches(movedX, this.size, "wall")) {
    pos = movedX;
  }

  //Vertical motion works in a similar way but has to simulate jumping and gravity. The player’s vertical speed (ySpeed) is first accelerated to account for gravity.
  let ySpeed = this.speed.y + time * gravity;
  let movedY = pos.plus(new Vec(0, ySpeed * time));
  // We check for walls again. If we don’t hit any, the new position is used. If there is a wall, there are two possible outcomes. When the up arrow is pressed and we are moving down (meaning the thing we hit is below us), the speed is set to a relatively large, negative value. This causes the player to jump. If that is not the case, the player simply bumped into something, and the speed is set to zero.
  if (!state.level.touches(movedY, this.size, "wall")) {
    pos = movedY;
  } else if (keys.ArrowUp && ySpeed > 0) {
    ySpeed = -jumpSpeed;
  } else {
    ySpeed = 0;
  }
  return new Player(pos, new Vec(xSpeed, ySpeed));
};

// For a game like this, we do not want keys to take effect once per keypress. Rather, we want their effect (moving the player figure) to stay active as long as they are held.
// We need to set up a key handler that stores the current state of the left, right, and up arrow keys. We will also want to call preventDefault for those keys so that they don’t end up scrolling the page.
// The following function, when given an array of key names, will return an object that tracks the current position of those keys. It registers event handlers for "keydown" and "keyup" events and, when the key code in the event is present in the set of codes that it is tracking, updates the object.
function trackKeys(keys) {
  let down = Object.create(null);
  function track(event) {
    if (keys.includes(event.key)) {
      down[event.key] = event.type == "keydown";
      event.preventDefault();
    }
  }
  window.addEventListener("keydown", track);
  window.addEventListener("keyup", track);
  return down;
}

const arrowKeys =
  trackKeys(["ArrowLeft", "ArrowRight", "ArrowUp"]);

  //The same handler function is used for both event types. It looks at the event object’s type property to determine whether the key state should be updated to true ("keydown") or false ("keyup").

  // Running the game 
  
  // The requestAnimationFrame function, which we saw in Chapter 14, provides a good way to animate a game. But its interface is quite primitive—using it requires us to track the time at which our function was called the last time around and call requestAnimationFrame again after every frame.

// Let’s define a helper function that wraps those boring parts in a convenient interface and allows us to simply call runAnimation, giving it a function that expects a time difference as an argument and draws a single frame. When the frame function returns the value false, the animation stops.

function runAnimation(frameFunc) {
  let lastTime = null;
  function frame(time) {
    if (lastTime != null) {
      let timeStep = Math.min(time - lastTime, 100) / 1000;
      if (frameFunc(timeStep) === false) return;
    }
    lastTime = time;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// I have set a maximum frame step of 100 milliseconds (one-tenth of a second). When the browser tab or window with our page is hidden, requestAnimationFrame calls will be suspended until the tab or window is shown again. In this case, the difference between lastTime and time will be the entire time in which the page was hidden. Advancing the game by that much in a single step would look silly and might cause weird side effects, such as the player falling through the floor.

// The function also converts the time steps to seconds, which are an easier quantity to think about than milliseconds.

// The runLevel function takes a Level object and a display constructor and returns a promise. It displays the level (in document.body) and lets the user play through it. When the level is finished (lost or won), runLevel waits one more second (to let the user see what happens) and then clears the display, stops the animation, and resolves the promise to the game’s end status.

function runLevel(level, Display) {
  let display = new Display(document.body, level);
  let state = State.start(level);
  let ending = 1;

  return new Promise(resolve => {
    runAnimation(time => {
      state = state.update(time, arrowKeys);
      display.syncState(state);
      if (state.status == "playing") {
        return true;
      } else if (ending > 0) {
        ending -= time;
        return true;
      } else {
        display.clear();
        resolve(state.status);
        return false;
      }
    });
  });
}

// A game is a sequence of levels. Whenever the player dies, the current level is restarted. When a level is completed, we move on to the next level. This can be expressed by the following function, which takes an array of level plans (strings) and a display constructor:

async function runGame(plans, Display) {
  let lives = 3;
  for (let level = 0; level < plans.length && lives > 0;) {
    console.log(`Level ${level + 1}, lives: ${lives}`);
    let status = await runLevel(new Level(plans[level]), Display, lives);

    if (status == "won") {
      level++;
    } else {
        lives--;
    }
  }

  if (lives > 0) {
    console.log("You've won!");
  } else {
    console.log("Game over");
  }
}

// Because we made runLevel return a promise, runGame can be written using an async function, as shown in Chapter 11. It returns another promise, which resolves when the player finishes the game.