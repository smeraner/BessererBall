import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
import { BallWorld, BASE_RADIUS, STEP_MS, OVERFLOW_GRACE_MS, appearance, radiusForTier } from '../src/physics.js';

function advance(world, seconds) {
  for (let i = 0; i < seconds * 1000 / STEP_MS; i++) world.step();
}
function near(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be near ${expected}`);
}

test('before upgrades, drops start with the smallest ball; input is clamped and rapid drops are limited', () => {
  const world = new BallWorld();
  const ball = world.drop(-10);
  assert.equal(ball.tier, 0);
  assert.equal(ball.radius, BASE_RADIUS);
  assert.ok(ball.body.position.x > -world.width / 2 + BASE_RADIUS);
  assert.equal(world.drop(1), null);
  advance(world, 0.3);
  assert.equal(world.drop(10).tier, 0);
});

test('gravity settles a ball above a solid floor in a fixed tub', () => {
  const world = new BallWorld();
  const ball = world.drop();
  advance(world, 6);
  assert.equal(world.gameOver, false);
  assert.ok(ball.body.position.y < 0);
  near(ball.body.position.y, -BASE_RADIUS, 0.8);
  assert.equal(world.width, 460);
  assert.equal(world.height, 510);
  assert.ok(Number.isFinite(ball.body.position.y));
});

test('same colours merge on contact and award points exactly once', () => {
  const merges = [];
  const world = new BallWorld({ onMerge: (event) => merges.push(event) });
  world.addBall(0, -16, -100);
  world.addBall(0, 16, -100);
  advance(world, 1);
  assert.equal(world.balls.size, 1);
  assert.equal([...world.balls.values()][0].tier, 1);
  assert.equal(world.score, 2n);
  assert.equal(merges.length, 1);
  assert.equal(world.largestTier, 1);
});

test('different colours remain separate on contact', () => {
  const world = new BallWorld();
  world.addBall(0, -16, -100);
  world.addBall(1, 18, -100);
  advance(world, 2);
  assert.equal(world.balls.size, 2);
  assert.equal(world.score, 0n);
});

test('a ball cannot be consumed twice when three same-colour balls touch', () => {
  const world = new BallWorld();
  world.addBall(0, -30, -100);
  world.addBall(0, 0, -100);
  world.addBall(0, 30, -100);
  advance(world, 2);
  assert.equal(world.balls.size, 2);
  assert.deepEqual([...world.balls.values()].map((ball) => ball.tier).sort(), [0, 1]);
  assert.equal(world.score, 2n);
});

test('four successive real drops can cause a chain merge', () => {
  const world = new BallWorld();
  for (let i = 0; i < 4; i++) { world.drop(0.5); advance(world, 2); }
  advance(world, 3);
  assert.equal(world.balls.size, 1);
  assert.equal([...world.balls.values()][0].tier, 2);
  assert.equal(world.score, 8n);
});

test('merging preserves area, exact mass and linear momentum', () => {
  const world = new BallWorld();
  const a = world.addBall(3, -20, -200, { x: 2, y: 1 });
  const b = world.addBall(3, 20, -200, { x: -1, y: 3 });
  const mass = a.body.mass + b.body.mass;
  const momentum = { x: a.body.mass * 2 - b.body.mass, y: a.body.mass + b.body.mass * 3 };
  const merged = world.merge(a, b);
  near(merged.radius ** 2, a.radius ** 2 + b.radius ** 2);
  near(merged.body.mass, mass);
  near(merged.body.velocity.x * merged.body.mass, momentum.x);
  near(merged.body.velocity.y * merged.body.mass, momentum.y);
});

test('merges beyond the initial colour palette keep the field dimensions and walls unchanged', () => {
  const world = new BallWorld();
  const walls = [...world.walls];
  const a = world.addBall(12, -10, -1500);
  const b = world.addBall(12, 10, -1500);
  const ball = world.merge(a, b);
  assert.equal(ball.tier, 13);
  assert.equal(world.largestTier, 13);
  assert.equal(world.score, 8192n);
  near(ball.radius, radiusForTier(13));
  assert.equal(world.width, 460);
  assert.equal(world.height, 510);
  assert.deepEqual(world.walls, walls);
  assert.notEqual(appearance(12).color, appearance(13).color);
});

test('a crowded tub keeps its dimensions, balls and score during simulation and drops', () => {
  const world = new BallWorld();
  world.addBall(1, 0, -world.height + 30);
  world.step();
  assert.equal(world.width, 460);
  assert.equal(world.height, 510);
  assert.equal(world.balls.size, 1);
  assert.equal(world.score, 0n);
  assert.ok(world.drop());
  assert.equal(world.width, 460);
  assert.equal(world.height, 510);
});

test('a shallow laptop tub still merges and keeps its original shape through a restart', () => {
  const world = new BallWorld({ initialHeight: 260 });
  for (let i = 0; i < 8; i++) { world.drop(); advance(world, 1.5); }
  advance(world, 3);
  assert.ok(world.largestTier >= 2);
  // Balls can roll apart: total material must survive even without a perfect chain.
  assert.equal([...world.balls.values()].reduce((sum, ball) => sum + 2n ** BigInt(ball.tier), 0n), 8n);
  assert.ok(world.score > 0n);
  assert.equal(world.width, 460);
  assert.equal(world.height, 260);
  world.reset();
  assert.equal(world.height, 260);
});

test('repeated throws stay finite and contained; reset clears the previous physics state', () => {
  const world = new BallWorld();
  for (let i = 0; i < 80; i++) {
    world.drop(((i * 37) % 101) / 100);
    advance(world, 0.4);
  }
  advance(world, 8);
  assert.ok(world.score > 0n);
  for (const ball of world.balls.values()) {
    assert.ok(Number.isFinite(ball.body.position.x) && Number.isFinite(ball.body.position.y));
    assert.ok(ball.body.position.y + ball.radius < 2);
    assert.ok(Math.abs(ball.body.position.x) + ball.radius < world.width / 2 + 2);
  }
  world.reset();
  assert.equal(world.score, 0n);
  assert.equal(world.balls.size, 0);
  assert.equal(world.dropCount, 0);
  assert.equal(world.width, 460);
  assert.ok(world.drop());
});

test('an upgrade requires enough points and cannot overdraw the balance', () => {
  const world = new BallWorld();
  assert.equal(world.upgradeCost, 1000n);
  assert.equal(world.canUpgrade, false);
  world.score = 999n;
  assert.equal(world.buyUpgrade(), false);
  assert.equal(world.score, 999n);
  assert.equal(world.dropTier, 0);
  world.score = 1000n;
  world.earnedPoints = 1000n;
  assert.equal(world.buyUpgrade(), true);
  assert.equal(world.score, 0n);
  assert.equal(world.earnedPoints, 1000n);
  assert.equal(world.buyUpgrade(), false);
  assert.equal(world.dropTier, 1);
});

test('successive upgrades cost 1000, 2000, 4000 and double beyond safe integer limits', () => {
  const world = new BallWorld();
  world.score = 7000n;
  world.earnedPoints = 7000n;
  for (const cost of [1000n, 2000n, 4000n]) {
    assert.equal(world.upgradeCost, cost);
    assert.equal(world.buyUpgrade(), true);
  }
  assert.equal(world.dropTier, 3);
  assert.equal(world.score, 0n);
  assert.equal(world.earnedPoints, 7000n);
  assert.equal(world.upgradeCost, 8000n);
  world.dropTier = 60;
  assert.equal(world.upgradeCost, 1000n * 2n ** 60n);
});

test('upgraded balls use the new radius, stay inside the walls and merge normally', () => {
  const world = new BallWorld();
  world.score = 3000n;
  world.earnedPoints = 3000n;
  const original = world.drop(0);
  assert.equal(world.buyUpgrade(), true);
  assert.equal(world.buyUpgrade(), true);
  assert.equal(original.tier, 0);
  advance(world, 2);
  const upgraded = world.drop(1);
  assert.equal(upgraded.tier, 2);
  near(upgraded.radius, radiusForTier(2));
  assert.ok(upgraded.body.position.x + upgraded.radius < world.width / 2);
  advance(world, 3);
  const next = world.drop(1);
  advance(world, 4);
  assert.ok(!world.balls.has(next.body.id));
  assert.ok([...world.balls.values()].some((ball) => ball.tier === 3));
  assert.equal(world.score, 8n);
  assert.equal(world.earnedPoints, 3008n);
});

test('a restart clears upgrades and lifetime round points as well as the balance', () => {
  const world = new BallWorld();
  world.score = 1000n;
  world.earnedPoints = 1000n;
  world.buyUpgrade();
  world.reset();
  assert.equal(world.dropTier, 0);
  assert.equal(world.score, 0n);
  assert.equal(world.earnedPoints, 0n);
  assert.equal(world.upgradeCost, 1000n);
  assert.equal(world.drop().tier, 0);
});

test('large drop upgrades keep the field dimensions and walls unchanged', () => {
  const world = new BallWorld({ initialHeight: 260 });
  const walls = [...world.walls];
  world.score = 255000n;
  for (let i = 0; i < 8; i++) assert.equal(world.buyUpgrade(), true);
  assert.equal(world.dropTier, 8);
  assert.equal(world.score, 0n);
  assert.equal(world.drop(), null);
  assert.equal(world.gameOver, true);
  assert.equal(world.width, 460);
  assert.equal(world.height, 260);
  assert.deepEqual(world.walls, walls);
});

function holdAboveRim(world, ball, milliseconds) {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += STEP_MS) {
    Matter.Body.setPosition(ball.body, { x: 0, y: -world.height + ball.radius - 8 });
    Matter.Body.setVelocity(ball.body, { x: 0, y: 0 });
    world.step();
  }
}

test('sustained overflow ends the round once, freezes physics and blocks throws and purchases', () => {
  let endings = 0;
  const world = new BallWorld({ onGameOver: () => endings++ });
  const ball = world.addBall(0, 0, -100);
  world.step();
  holdAboveRim(world, ball, OVERFLOW_GRACE_MS - 100);
  assert.equal(world.gameOver, false);
  holdAboveRim(world, ball, 200);
  assert.equal(world.gameOver, true);
  assert.equal(endings, 1);
  const position = { ...ball.body.position };
  const time = world.time;
  world.score = 1000n;
  advance(world, 3);
  world.endGame();
  assert.equal(world.time, time);
  assert.deepEqual(ball.body.position, position);
  assert.equal(world.canDrop, false);
  assert.equal(world.drop(), null);
  assert.equal(world.buyUpgrade(), false);
  assert.equal(world.score, 1000n);
  assert.equal(endings, 1);
  assert.equal(world.width, 460);
  assert.equal(world.height, 510);
});

test('temporary overflow clears after a ball falls back inside', () => {
  const world = new BallWorld();
  const ball = world.addBall(0, 0, -100);
  world.step();
  holdAboveRim(world, ball, 1000);
  Matter.Body.setPosition(ball.body, { x: 0, y: -100 });
  world.step();
  assert.equal(ball.overflowMs, 0);
  holdAboveRim(world, ball, 1000);
  assert.equal(world.gameOver, false);
});

test('a fresh throw above a full tub eventually ends the round even if it cannot enter', () => {
  const world = new BallWorld();
  const ball = world.drop();
  holdAboveRim(world, ball, 2200);
  assert.equal(world.gameOver, false);
  assert.equal(ball.entered, false);
  holdAboveRim(world, ball, 1600);
  assert.equal(world.gameOver, true);
});

test('merges resolve before checking overflow and can clear space at the rim', () => {
  const world = new BallWorld();
  const a = world.addBall(0, 0, -world.height + 9);
  const b = world.addBall(0, 0, -world.height + 42);
  a.entered = true;
  a.overflowMs = OVERFLOW_GRACE_MS - STEP_MS;
  world.step();
  assert.equal(world.balls.size, 1);
  assert.equal(world.gameOver, false);
  assert.equal(world.score, 2n);
});

test('a merged ball too large for the tub ends the round without enlarging it', () => {
  const world = new BallWorld({ initialHeight: 260 });
  world.addBall(6, -10, -140);
  world.addBall(6, 10, -140);
  world.step();
  assert.equal(world.largestTier, 7);
  assert.equal(world.gameOver, true);
  assert.equal(world.width, 460);
  assert.equal(world.height, 260);
});

test('restart after game over clears overflow, upgrades and score and allows play again', () => {
  const world = new BallWorld();
  world.score = 1000n;
  world.buyUpgrade();
  world.endGame();
  world.reset();
  assert.equal(world.gameOver, false);
  assert.equal(world.dropTier, 0);
  assert.equal(world.score, 0n);
  assert.equal(world.balls.size, 0);
  assert.ok(world.drop());
  advance(world, 3);
  assert.equal(world.gameOver, false);
});

test('expansion requires enough coins, charges exactly once and doubles its own price', () => {
  const world = new BallWorld();
  const walls = [...world.walls];
  assert.equal(world.expansionCost, 500n);
  assert.equal(world.canExpand, false);
  world.score = 499n;
  assert.equal(world.buyExpansion(), false);
  assert.equal(world.score, 499n);
  assert.equal(world.expansions, 0);
  assert.deepEqual(world.walls, walls);
  world.score = 1500n;
  world.earnedPoints = 1500n;
  assert.equal(world.buyExpansion(), true);
  assert.equal(world.score, 1000n);
  assert.equal(world.expansionCost, 1000n);
  near(world.width, 552);
  near(world.height, 612);
  assert.equal(world.buyExpansion(), true);
  assert.equal(world.score, 0n);
  assert.equal(world.expansionCost, 2000n);
  assert.equal(world.buyExpansion(), false);
  assert.equal(world.expansions, 2);
  assert.equal(world.earnedPoints, 1500n);
  assert.equal(world.dropTier, 0);
});

test('purchased space preserves balls and mass, rebuilds walls and clears impending overflow', () => {
  const world = new BallWorld();
  const ball = world.addBall(0, 0, -100, { x: 1, y: 2 });
  world.step();
  holdAboveRim(world, ball, 1400);
  const before = { position: { ...ball.body.position }, velocity: { ...ball.body.velocity }, radius: ball.radius, mass: ball.body.mass };
  const oldWalls = [...world.walls];
  world.score = 500n;
  assert.equal(world.buyExpansion(), true);
  assert.equal(ball.overflowMs, 0);
  assert.equal(world.balls.get(ball.body.id), ball);
  assert.deepEqual(ball.body.position, before.position);
  assert.deepEqual(ball.body.velocity, before.velocity);
  assert.equal(ball.radius, before.radius);
  assert.equal(ball.body.mass, before.mass);
  const bodies = Matter.Composite.allBodies(world.engine.world);
  for (const wall of oldWalls) assert.ok(!bodies.includes(wall));
  for (const wall of world.walls) assert.ok(bodies.includes(wall));
  assert.equal(bodies.length, 4);
  advance(world, 2);
  assert.equal(world.gameOver, false);
  near(world.width, 552);
  near(world.height, 612);
});

test('merges earn spendable coins shared by throw upgrades and field purchases', () => {
  const world = new BallWorld();
  world.merge(world.addBall(8, -10, -100), world.addBall(8, 10, -100));
  assert.equal(world.score, 512n);
  assert.equal(world.buyExpansion(), true);
  assert.equal(world.score, 12n);
  assert.equal(world.earnedPoints, 512n);
  world.reset();
  world.score = 1500n;
  assert.equal(world.buyUpgrade(), true);
  assert.equal(world.buyExpansion(), true);
  assert.equal(world.score, 0n);
  assert.equal(world.dropTier, 1);
  assert.equal(world.expansions, 1);
  assert.equal(world.upgradeCost, 2000n);
  assert.equal(world.expansionCost, 1000n);
});

test('expansion is blocked after game over and restart restores the field and purchase price', () => {
  const world = new BallWorld({ initialHeight: 260 });
  world.score = 5000n;
  assert.equal(world.buyExpansion(), true);
  world.endGame();
  const balance = world.score;
  const width = world.width;
  assert.equal(world.canExpand, false);
  assert.equal(world.buyExpansion(), false);
  assert.equal(world.score, balance);
  assert.equal(world.width, width);
  world.reset();
  assert.equal(world.expansions, 0);
  assert.equal(world.expansionCost, 500n);
  assert.equal(world.width, 460);
  assert.equal(world.height, 260);
  assert.equal(world.score, 0n);
  assert.equal(world.canExpand, false);
});
