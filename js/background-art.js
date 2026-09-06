(() => {
  'use strict';

  const canvas = document.getElementById('background-canvas');
  if (!canvas) return;

  const context = canvas.getContext('2d');
  if (!context) return;

  const artwork = canvas.parentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const duration = 4800;
  const lineCount = 22;
  const samples = 180;
  const strokeWidth = 0.85;
  const palette = ['#42a99e', '#4eafbe', '#698cca', '#9690d0'];
  let width = 0;
  let height = 0;
  let lines = [];
  let frame = null;
  let startedAt = null;
  let elapsed = 0;
  let inView = true;
  let settled = reducedMotion.matches;

  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => {
    const t = clamp(value);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  const mix = (from, to, amount) => from + (to - from) * amount;

  // A seeded field keeps the composition consistent through resizes.
  function randomSource() {
    let seed = 73;
    return () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  function bezier(t, a, b, c, d) {
    const s = 1 - t;
    return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d;
  }

  function pointOnLine(t, index) {
    const offset = (index - (lineCount - 1) / 2) * 14;
    const segment = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    let x;
    let y;

    if (t < 0.5) {
      x = bezier(segment, 1060 + offset, 1450 + offset * 0.5, 640 + offset * 0.8, 870 + offset);
      y = bezier(segment, -80, 130 + offset * 0.3, 200 - offset * 0.3, 390);
    } else {
      x = bezier(segment, 870 + offset, 1100 + offset * 1.2, 1410 + offset * 0.4, 1560 + offset);
      y = bezier(segment, 390, 580 + offset * 0.3, 310 + offset * 0.5, 680);
    }

    // Keep the folds spacious on small screens instead of squeezing them flat.
    const scaleX = Math.max(width, 1000) / 1440;
    return { x: width - (1440 - x) * scaleX, y: y * height / 690 };
  }

  function compose() {
    const random = randomSource();
    lines = [];

    for (let index = 0; index < lineCount; index += 1) {
      const points = [];
      const path = new Path2D();
      const color = palette[Math.min(palette.length - 1, Math.floor(index / lineCount * palette.length))];
      const size = 3 + random() * 1.5;
      let length = 0;
      let entryDistance = 0;

      for (let sample = 0; sample <= samples; sample += 1) {
        const point = pointOnLine(sample / samples, index);
        if (sample === 0) path.moveTo(point.x, point.y);
        else {
          const previous = points[sample - 1];
          length += Math.hypot(point.x - previous.x, point.y - previous.y);
          path.lineTo(point.x, point.y);
        }
        points.push({ ...point, distance: length });
        if (point.y < -size) entryDistance = length;
      }

      lines.push({
        points, path, length, entryDistance, color, size,
        opacity: 0.25 + random() * 0.17,
        delay: 40 + index * 11 + random() * 300
      });
    }
  }

  // Position the drawing tip by distance, so the bends do not cause speed jumps.
  function pointAtDistance(points, distance) {
    let low = 1;
    let high = points.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (points[middle].distance < distance) low = middle + 1;
      else high = middle;
    }
    const before = points[low - 1];
    const after = points[low];
    const amount = clamp((distance - before.distance) / (after.distance - before.distance));
    return {
      x: mix(before.x, after.x, amount),
      y: mix(before.y, after.y, amount),
      angle: Math.atan2(after.y - before.y, after.x - before.x)
    };
  }

  function draw(progress) {
    context.clearRect(0, 0, width, height);
    context.lineWidth = strokeWidth;

    lines.forEach(line => {
      const travel = clamp((progress * duration - line.delay) / (duration - 700));
      if (travel === 0) return;

      // Each square enters from above and draws its own line as it descends.
      // The stroke and its tip share one distance; there is no separate fade-in.
      const distance = mix(line.entryDistance, line.length, ease(travel));
      context.strokeStyle = line.color;
      context.globalAlpha = line.opacity;
      context.setLineDash(travel === 1 ? [] : [distance, line.length + 1]);
      context.stroke(line.path);

      if (travel < 1) {
        const tip = pointAtDistance(line.points, distance);
        const morph = ease((travel - 0.4) / 0.45);
        const tipLength = mix(line.size, 14, morph);
        const tipWidth = mix(line.size, strokeWidth, morph);
        context.save();
        context.translate(tip.x, tip.y);
        context.rotate(tip.angle);
        context.fillStyle = line.color;
        context.globalAlpha = mix(0.6, line.opacity, morph);
        context.fillRect(-tipLength / 2, -tipWidth / 2, tipLength, tipWidth);
        context.restore();
      }
    });

    context.setLineDash([]);
    context.globalAlpha = 1;
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }

  function tick(now) {
    frame = null;
    if (settled || document.hidden || !inView) return;
    if (startedAt === null) startedAt = now - elapsed;
    elapsed = Math.min(now - startedAt, duration);
    draw(elapsed / duration);

    if (elapsed < duration) frame = requestAnimationFrame(tick);
    else settled = true; // Leave the final drawing on the canvas; no idle render loop.
  }

  function resume() {
    if (settled || document.hidden || !inView || frame !== null) return;
    startedAt = null;
    frame = requestAnimationFrame(tick);
  }

  function resize() {
    const bounds = artwork.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = bounds.width;
    height = bounds.height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    compose();
    draw(settled ? 1 : elapsed / duration);
    artwork.classList.add('is-ready');
  }

  resize();
  resume();

  // The static SVG remains available when scripting or canvas is unavailable.
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(artwork);
  else window.addEventListener('resize', resize, { passive: true });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      if (inView) resume();
      else stop();
    }).observe(artwork);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else resume();
  });

  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', resume);

  reducedMotion.addEventListener('change', event => {
    if (!event.matches) return;
    settled = true;
    stop();
    draw(1);
  });
})();
