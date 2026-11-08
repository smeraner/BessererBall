import { Application, Container, Graphics, Sprite, Texture, Text } from 'pixi.js';
import { appearance, radiusForTier } from './physics.js';
import { ballCanvas } from './ball-art.js';

export class BallView {
  constructor(surface, world) {
    this.surface = surface;
    this.world = world;
    this.sprites = new Map();
    this.textures = new Map();
    this.effects = [];
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.camera = null;
    this.app = new Application();
  }

  async init() {
    await this.app.init({
      resizeTo: this.surface,
      antialias: true,
      backgroundAlpha: 0,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
    });
    this.surface.appendChild(this.app.canvas);
    this.app.canvas.setAttribute('aria-hidden', 'true');
    this.scenery = new Graphics();
    this.guide = new Graphics();
    this.ballLayer = new Container();
    this.effectLayer = new Container();
    this.app.stage.addChild(this.scenery, this.guide, this.ballLayer, this.effectLayer);
    this.emptyLabel = new Text({ text: 'LEERER RAUM.\nVOLLER MÖGLICHKEITEN.', style: { fontFamily: 'DM Sans Variable, sans-serif', fontSize: 9, fontWeight: '500', letterSpacing: 2, lineHeight: 19, align: 'center', fill: '#c4b9cc' } });
    this.emptyLabel.anchor.set(0.5);
    this.app.stage.addChild(this.emptyLabel);
    this.preview = new Sprite(this.textureFor(0));
    this.preview.anchor.set(0.5);
    this.app.stage.addChild(this.preview);
    this.app.ticker.stop();
    this.observer = new ResizeObserver(() => this.app.resize());
    this.observer.observe(this.surface);
  }

  textureFor(tier) {
    if (this.textures.has(tier)) return this.textures.get(tier);
    const texture = Texture.from(ballCanvas(tier));
    this.textures.set(tier, texture);
    return texture;
  }

  point(x, y) {
    return { x: this.camera.cx + x * this.camera.scale, y: this.camera.bottom + y * this.camera.scale };
  }

  aimFromClient(clientX) {
    if (!this.camera) return 0.5;
    const rect = this.surface.getBoundingClientRect();
    const worldX = (clientX - rect.left - this.camera.cx) / this.camera.scale;
    return Math.min(1, Math.max(0, worldX / (this.world.width - radiusForTier(this.world.dropTier) * 2 - 8) + 0.5));
  }

  mergeEffect(event, label) {
    const color = appearance(event.tier).color;
    const graphic = new Graphics();
    const text = new Text({ text: `+${label}`, style: { fontFamily: 'Manrope Variable, sans-serif', fontSize: 17, fontWeight: '700', fill: appearance(event.tier).dark } });
    text.anchor.set(0.5);
    this.effectLayer.addChild(graphic, text);
    this.effects.push({ graphic, text, ...event, color, age: 0, life: this.reducedMotion ? 0.35 : 0.85 });
  }

  reset() {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    for (const effect of this.effects) { effect.graphic.destroy(); effect.text.destroy(); }
    this.effects.length = 0;
    this.camera = null;
  }

  render(deltaSeconds, aim, ready) {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const targetScale = Math.min((W - 66) / this.world.width, (H - 142) / this.world.height);
    if (!this.camera) this.camera = { scale: targetScale, cx: W / 2, bottom: H - 28 };
    const smooth = this.reducedMotion ? 1 : 1 - Math.exp(-deltaSeconds * 8);
    this.camera.scale += (targetScale - this.camera.scale) * smooth;
    this.camera.cx = W / 2;
    this.camera.bottom = H - 28;
    const s = this.camera.scale;
    const left = this.point(-this.world.width / 2, 0).x;
    const right = this.point(this.world.width / 2, 0).x;
    const top = this.point(0, -this.world.height).y;
    const bottom = this.camera.bottom;
    const g = this.scenery.clear();
    // A restrained dot grid keeps an empty board feeling like a place to play.
    for (let x = left + 20; x < right - 10; x += 24) {
      for (let y = top + 20; y < bottom - 10; y += 24) g.circle(x, y, 0.65).fill({ color: 0xcac1d2, alpha: 0.28 });
    }
    const tub = (offset) => {
      g.moveTo(left - offset, top).lineTo(left - offset, bottom - 15)
        .quadraticCurveTo(left - offset, bottom + offset, left + 15, bottom + offset)
        .lineTo(right - 15, bottom + offset)
        .quadraticCurveTo(right + offset, bottom + offset, right + offset, bottom - 15).lineTo(right + offset, top);
    };
    tub(3); g.stroke({ color: 0xe5dfea, width: 10, alpha: 0.32, cap: 'round' });
    tub(0); g.stroke({ color: 0xcfc4dd, width: 3, cap: 'round' });
    g.roundRect(left - 8, top - 3, 15, 6, 3).fill(0xd3c8e0);
    g.roundRect(right - 7, top - 3, 15, 6, 3).fill(0xd3c8e0);

    for (const [id, sprite] of this.sprites) {
      if (!this.world.balls.has(id)) { sprite.destroy(); this.sprites.delete(id); }
    }
    for (const [id, ball] of this.world.balls) {
      let sprite = this.sprites.get(id);
      if (!sprite) {
        sprite = new Sprite(this.textureFor(ball.tier));
        sprite.anchor.set(0.5);
        this.ballLayer.addChild(sprite);
        this.sprites.set(id, sprite);
      }
      const pos = this.point(ball.body.position.x, ball.body.position.y);
      sprite.position.set(pos.x, pos.y);
      const age = (this.world.time - ball.born) / 1000;
      const pop = this.reducedMotion || ball.tier === 0 ? 1 : 1 + 0.1 * Math.sin(Math.min(age / 0.25, 1) * Math.PI);
      sprite.width = sprite.height = ball.radius * 2 * s * (256 / 246) * pop;
      // Lighting stays top-left; rotations are deliberately not applied to the gloss.
    }

    const dropRadius = radiusForTier(this.world.dropTier);
    const x = (aim - 0.5) * (this.world.width - dropRadius * 2 - 8);
    const previewWorldY = -this.world.height - dropRadius - 18;
    const preview = this.point(x, previewWorldY);
    const previewSize = Math.max(8, dropRadius * 2 * s);
    this.preview.texture = this.textureFor(this.world.dropTier);
    this.preview.position.set(preview.x, preview.y);
    this.preview.width = this.preview.height = previewSize;
    this.preview.alpha = ready ? 1 : 0.35;
    let hitY = -dropRadius;
    for (const ball of this.world.balls.values()) {
      const dx = x - ball.body.position.x;
      const sumR = ball.radius + dropRadius;
      if (Math.abs(dx) < sumR) {
        const contact = ball.body.position.y - Math.sqrt(sumR * sumR - dx * dx);
        if (contact > previewWorldY + dropRadius * 2) hitY = Math.min(hitY, contact);
      }
    }
    const hit = this.point(x, hitY);
    const guide = this.guide.clear();
    if (ready) {
      for (let y = preview.y + previewSize / 2 + 13; y < hit.y - previewSize / 2 - 6; y += 10) {
        guide.moveTo(preview.x, y).lineTo(preview.x, y + 3).stroke({ color: 0xd4c4dd, alpha: 0.65, width: 1.3, cap: 'round' });
      }
      const previewColor = appearance(this.world.dropTier).color;
      guide.circle(hit.x, hit.y, dropRadius * s).fill({ color: previewColor, alpha: 0.08 }).stroke({ color: previewColor, alpha: 0.18, width: 1 });
      guide.moveTo(preview.x - 3, preview.y - previewSize / 2 - 13).lineTo(preview.x, preview.y - previewSize / 2 - 10).lineTo(preview.x + 3, preview.y - previewSize / 2 - 13).stroke({ color: 0xb0a0bd, width: 1, cap: 'round', join: 'round' });
    }
    this.emptyLabel.visible = this.world.dropCount === 0;
    this.emptyLabel.position.set(W / 2, top + (bottom - top) * 0.55);

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.age += deltaSeconds;
      if (effect.age >= effect.life) {
        effect.graphic.destroy(); effect.text.destroy(); this.effects.splice(i, 1); continue;
      }
      const p = effect.age / effect.life;
      const pos = this.point(effect.x, effect.y);
      effect.graphic.clear();
      if (!this.reducedMotion) {
        const ringRadius = effect.ball.radius * s + p * 22;
        effect.graphic.circle(pos.x, pos.y, ringRadius).stroke({ color: effect.color, width: 2 * (1 - p), alpha: (1 - p) * 0.5 });
        for (let j = 0; j < 7; j++) {
          const angle = j / 7 * Math.PI * 2;
          const distance = ringRadius + p * 13;
          effect.graphic.circle(pos.x + Math.cos(angle) * distance, pos.y + Math.sin(angle) * distance, 2 * (1 - p)).fill({ color: effect.color, alpha: 1 - p });
        }
      }
      effect.text.position.set(pos.x, pos.y - effect.ball.radius * s - 10 - p * (this.reducedMotion ? 0 : 28));
      effect.text.alpha = Math.sin(Math.PI * p);
    }
    this.app.render();
  }
}
