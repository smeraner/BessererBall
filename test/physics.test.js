import test from 'node:test';
import assert from 'node:assert/strict';
import { BallWorld, BASE_RADIUS, STEP_MS, appearance, radiusForTier } from '../src/physics.js';

function advance(world, seconds) {
  for (let i = 0; i < seconds * 1000 / STEP_MS; i++) world.step();
}
function near(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be near ${expected}`);
}

test('every drop starts with the smallest ball; input is clamped and rapid drops are limited', () => {
  const world = new BallWorld();
  const ball = world.drop(-10);
  assert.equal(ball.tier, 0);
  assert.equal(ball.radius, BASE_RADIUS);
  assert.ok(ball.body.position.x > -world.width / 2 + BASE_RADIUS);
  assert.equal(world.drop(1), null);
  advance(world, 0.3);
  assert.equal(world.drop(10).tier, 0);
});

test('gravity settles a ball above a solid floor without expanding an empty tub', () => {
  const world = new BallWorld();
  const ball = world.drop();
  advance(world, 6);
  assert.ok(ball.body.position.y < 0);
  near(ball.body.position.y, -BASE_RADIUS, 0.8);
  assert.equal(world.expansions, 0);
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

test('growth continues beyond the initial colour palette without a maximum stage', () => {
  const world = new BallWorld();
  const a = world.addBall(12, -10, -1500);
  const b = world.addBall(12, 10, -1500);
  const ball = world.merge(a, b);
  assert.equal(ball.tier, 13);
  assert.equal(world.largestTier, 13);
  assert.equal(world.score, 8192n);
  near(ball.radius, radiusForTier(13));
  assert.ok(world.width > ball.radius * 5);
  assert.notEqual(appearance(12).color, appearance(13).color);
});

test('a crowded tub expands while keeping balls and score', () => {
  const world = new BallWorld();
  const ball = world.addBall(0, 0, -world.height + 30);
  ball.entered = true;
  const oldHeight = world.height;
  world.ensureSpace();
  assert.ok(world.height > oldHeight);
  assert.equal(world.balls.size, 1);
  assert.equal(world.score, 0n);
});

test('a shallow laptop tub still merges, grows when needed and resets to its original shape', () => {
  const world = new BallWorld({ initialHeight: 260 });
  for (let i = 0; i < 8; i++) { world.drop(); advance(world, 1.5); }
  advance(world, 3);
  assert.ok(world.largestTier >= 2);
  // Balls can roll apart: total material must survive even without a perfect chain.
  assert.equal([...world.balls.values()].reduce((sum, ball) => sum + 2n ** BigInt(ball.tier), 0n), 8n);
  assert.ok(world.score > 0n);
  world.grow();
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
  assert.equal(world.expansions, 0);
  assert.equal(world.width, 460);
  assert.ok(world.drop());
});
