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
  const samples = 84;
  const palette = ['#42a99e', '#4eafbe', '#698cca', '#9690d0'];
  let width = 0;
  let height = 0;
  let lines = [];
  let pixels = [];
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
    pixels = [];

    for (let index = 0; index < lineCount; index += 1) {
      const points = [];
      const color = palette[Math.min(palette.length - 1, Math.floor(index / lineCount * palette.length))];

      for (let sample = 0; sample <= samples; sample += 1) {
        const t = sample / samples;
        const target = pointOnLine(t, index);
        points.push(target);

        if (sample % 3 !== 0) continue;
        pixels.push({
          target,
          x: target.x + (random() - 0.5) * 350,
          y: target.y + (random() - 0.5) * 270,
          phase: random() * Math.PI * 2,
          size: 1.5 + random() * 3,
          opacity: 0.22 + random() * 0.38,
          delay: random() * 0.12,
          color
        });
      }

      lines.push({ points, color, opacity: 0.25 + random() * 0.17 });
    }
  }

  function draw(progress) {
    context.clearRect(0, 0, width, height);

    const lineOpacity = ease((progress - 0.32) / 0.62);
    if (lineOpacity > 0) {
      context.lineWidth = 0.85;
      lines.forEach(line => {
        context.strokeStyle = line.color;
        context.globalAlpha = line.opacity * lineOpacity;
        context.beginPath();
        line.points.forEach((point, index) => {
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
        context.stroke();
      });
    }

    if (progress < 1) {
      const fade = 1 - ease((progress - 0.68) / 0.32);
      pixels.forEach(pixel => {
        const gather = ease((progress - 0.1 - pixel.delay) / (0.7 - pixel.delay));
        const drift = (1 - gather) * 12;
        const x = mix(pixel.x, pixel.target.x, gather) + Math.sin(progress * 5 + pixel.phase) * drift;
        const y = mix(pixel.y, pixel.target.y, gather) + Math.cos(progress * 4 + pixel.phase) * drift;
        const size = pixel.size * (1 - gather * 0.45);
        context.fillStyle = pixel.color;
        context.globalAlpha = pixel.opacity * fade;
        context.fillRect(x - size / 2, y - size / 2, size, size);
      });
    }

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
