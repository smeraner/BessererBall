import Matter from 'matter-js';

const { Engine, Bodies, Body, Composite, Events } = Matter;
export const BASE_RADIUS = 17;
export const STEP_MS = 1000 / 120;
export const OVERFLOW_GRACE_MS = 1500;
const DROP_ENTRY_GRACE_MS = 2000;

const COLORS = [
  ['#f4777c', '#ffd1bf', '#d74f6a', 'Der Anfang'],
  ['#f5a456', '#ffe5ad', '#e67b3e', 'Sonnenschein'],
  ['#edc94c', '#fff7b7', '#d6a331', 'Goldstück'],
  ['#a2ce69', '#e5f5ac', '#71a848', 'Glücksbringer'],
  ['#61c7ab', '#baf4d6', '#359e91', 'Frische Brise'],
  ['#66bce2', '#c9f1ff', '#3c8fc8', 'Wolkenfänger'],
  ['#8b9be1', '#dce5ff', '#6563bd', 'Blaue Stunde'],
  ['#b693d9', '#efdaff', '#8960b8', 'Traumkugel'],
  ['#dc8bbb', '#ffdbed', '#b75e9b', 'Wunderball'],
];

export function appearance(tier) {
  if (tier < COLORS.length) {
    const [color, light, dark, name] = COLORS[tier];
    return { color, light, dark, name };
  }
  // Distinct, deterministic colours beyond the illustrated first stages.
  const hue = ((tier - COLORS.length) * 137.50776405 + 18) % 360;
  return {
    color: `hsl(${hue} 67% 67%)`,
    light: `hsl(${hue} 88% 89%)`,
    dark: `hsl(${hue} 51% 47%)`,
    name: 'Immer größer',
  };
}

export function radiusForTier(tier) {
  return BASE_RADIUS * Math.SQRT2 ** tier;
}

export class BallWorld {
  constructor({ onMerge = () => {}, onGameOver = () => {}, initialHeight = 510 } = {}) {
    this.onMerge = onMerge;
    this.onGameOver = onGameOver;
    this.initialHeight = initialHeight;
    this.engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    this.engine.gravity.y = 1.25;
    this.balls = new Map();
    this.pendingPairs = [];
    const queue = ({ pairs }) => {
      for (const { bodyA, bodyB } of pairs) {
        if (this.balls.has(bodyA.id) && this.balls.has(bodyB.id)) this.pendingPairs.push([bodyA.id, bodyB.id]);
      }
    };
    Events.on(this.engine, 'collisionStart', queue);
    Events.on(this.engine, 'collisionActive', queue);
    this.reset();
  }

  reset() {
    Composite.clear(this.engine.world, false);
    Engine.clear(this.engine);
    this.balls.clear();
    this.pendingPairs.length = 0;
    this.width = 460;
    this.height = this.initialHeight;
    this.time = 0;
    this.lastDrop = -Infinity;
    this.score = 0n;
    this.earnedPoints = 0n;
    this.dropTier = 0;
    this.expansions = 0;
    this.largestTier = 0;
    this.dropCount = 0;
    this.gameOver = false;
    this.walls = [];
    this.buildContainer();
  }

  buildContainer() {
    for (const wall of this.walls) Composite.remove(this.engine.world, wall);
    const thickness = Math.max(40, this.width * 0.08);
    const wallOptions = { isStatic: true, friction: 0.35, restitution: 0.18 };
    this.walls = [
      Bodies.rectangle(0, thickness / 2, this.width + thickness * 2, thickness, wallOptions),
      Bodies.rectangle(-(this.width + thickness) / 2, -this.height / 2, thickness, this.height + thickness, wallOptions),
      Bodies.rectangle((this.width + thickness) / 2, -this.height / 2, thickness, this.height + thickness, wallOptions),
    ];
    Composite.add(this.engine.world, this.walls);
  }

  addBall(tier, x, y, velocity = { x: 0, y: 0 }) {
    const radius = radiusForTier(tier);
    const body = Bodies.circle(x, y, radius, {
      restitution: 0.29,
      friction: 0.12,
      frictionStatic: 0.25,
      frictionAir: 0.0025,
      density: 0.0018,
      slop: 0.025,
      sleepThreshold: 100,
      label: `ball-${tier}`,
    }, 64);
    Body.setVelocity(body, velocity);
    const ball = { body, tier, radius, born: this.time, entered: false, overflowMs: 0 };
    this.balls.set(body.id, ball);
    Composite.add(this.engine.world, body);
    return ball;
  }

  get canDrop() { return !this.gameOver && this.time - this.lastDrop >= 280; }

  get upgradeCost() { return 1000n * 2n ** BigInt(this.dropTier); }

  get canUpgrade() { return !this.gameOver && this.score >= this.upgradeCost; }

  buyUpgrade() {
    if (!this.canUpgrade) return false;
    this.score -= this.upgradeCost;
    this.dropTier++;
    return true;
  }

  get expansionCost() { return 500n * 2n ** BigInt(this.expansions); }

  get canExpand() { return !this.gameOver && this.score >= this.expansionCost; }

  buyExpansion() {
    if (!this.canExpand) return false;
    this.score -= this.expansionCost;
    this.expansions++;
    this.width *= 1.2;
    this.height *= 1.2;
    this.buildContainer();
    for (const ball of this.balls.values()) {
      ball.overflowMs = 0;
      // Moving the side walls can remove a sleeping ball's support.
      Matter.Sleeping.set(ball.body, false);
    }
    return true;
  }

  drop(fraction = 0.5) {
    if (!this.canDrop) return null;
    const radius = radiusForTier(this.dropTier);
    if (radius * 2 > Math.min(this.width - 8, this.height)) {
      this.endGame();
      return null;
    }
    const x = (Math.min(1, Math.max(0, fraction)) - 0.5) * (this.width - radius * 2 - 8);
    const y = -this.height - radius - 18;
    const ball = this.addBall(this.dropTier, x, y);
    this.largestTier = Math.max(this.largestTier, this.dropTier);
    this.lastDrop = this.time;
    this.dropCount++;
    return ball;
  }

  step(delta = STEP_MS) {
    if (this.gameOver) return;
    this.time += delta;
    Engine.update(this.engine, delta);
    // Consume after Engine.update: never mutate the physics world mid collision callback.
    const pairs = this.pendingPairs;
    this.pendingPairs = [];
    for (const [aId, bId] of pairs) {
      const a = this.balls.get(aId);
      const b = this.balls.get(bId);
      if (!a || !b || a.tier !== b.tier) continue;
      this.merge(a, b);
    }
    for (const ball of this.balls.values()) {
      if (ball.radius * 2 > Math.min(this.width, this.height)) {
        this.endGame();
        break;
      }
      const top = ball.body.position.y - ball.radius;
      if (top >= -this.height) ball.entered = true;
      // Fresh throws start above the rim; give them time to enter the tub.
      const eligible = ball.entered || this.time - ball.born >= DROP_ENTRY_GRACE_MS;
      ball.overflowMs = eligible && top < -this.height - 2 ? ball.overflowMs + delta : 0;
      if (ball.overflowMs >= OVERFLOW_GRACE_MS) {
        this.endGame();
        break;
      }
    }
  }

  endGame() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.onGameOver();
  }

  merge(a, b) {
    const tier = a.tier + 1;
    const radius = radiusForTier(tier);
    const mass = a.body.mass + b.body.mass;
    const position = {
      x: (a.body.position.x * a.body.mass + b.body.position.x * b.body.mass) / mass,
      y: (a.body.position.y * a.body.mass + b.body.position.y * b.body.mass) / mass,
    };
    const velocity = {
      x: (a.body.velocity.x * a.body.mass + b.body.velocity.x * b.body.mass) / mass,
      y: (a.body.velocity.y * a.body.mass + b.body.velocity.y * b.body.mass) / mass,
    };
    for (const ball of [a, b]) {
      this.balls.delete(ball.body.id);
      Composite.remove(this.engine.world, ball.body);
    }
    // Keep the new circle above the solid floor as its radius increases.
    const ball = this.addBall(tier, position.x, Math.min(-radius - 0.5, position.y), velocity);
    // The circle approximation can have a slightly different area: preserve exact input mass.
    Body.setMass(ball.body, mass);
    Body.setAngularVelocity(ball.body, (a.body.angularVelocity + b.body.angularVelocity) / 2);
    ball.entered = a.entered || b.entered;
    const points = 2n ** BigInt(tier);
    this.score += points;
    this.earnedPoints += points;
    this.largestTier = Math.max(this.largestTier, tier);
    this.onMerge({ ball, tier, points, x: ball.body.position.x, y: ball.body.position.y });
    return ball;
  }
}
