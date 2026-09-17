(() => {
  'use strict';
  const steps = {
    paste: ['01', 'Start where you work.', 'Paste your code, logs or question as usual. SecureIntent checks pasted content on your device before it reaches your AI tool.'],
    review: ['02', 'Review what matters.', 'SecureIntent flags the credential before it reaches your AI tool. Choose to anonymise it, then continue with the context you need.'],
    continue: ['03', 'Keep the context. Replace the credential.', 'Your AI workspace receives the useful context with a placeholder in place of the detected credential.']
  };
  const nodes = [...document.querySelectorAll('[data-step]')];
  const detail = document.getElementById('flow-detail');
  const stage = document.querySelector('.flow-stage');
  const select = node => {
    if (node.getAttribute('aria-pressed') === 'true') return;
    nodes.forEach(item => item.setAttribute('aria-pressed', String(item === node)));
    const [number, title, description] = steps[node.dataset.step];
    stage.dataset.active = node.dataset.step;
    detail.querySelector('.detail-index').textContent = number;
    const heading = document.createElement('strong');
    heading.textContent = title;
    detail.querySelector('p').replaceChildren(heading, document.createTextNode(' ' + description));
  };
  nodes.forEach(node => node.addEventListener('click', () => select(node)));

  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('.flow-step, .stage-item, .capability, .team-list li, .desktop-feature, .agent-note, .policy-layer, .window, .contact-form').forEach(surface => {
    surface.dataset.glow = '';
    let frame = 0;
    let x = 0;
    let y = 0;
    surface.addEventListener('pointermove', event => {
      if (!finePointer.matches || reducedMotion.matches) return;
      const rect = surface.getBoundingClientRect();
      x = event.clientX - rect.left;
      y = event.clientY - rect.top;
      if (!frame) frame = requestAnimationFrame(() => {
        surface.style.setProperty('--pointer-x', `${x}px`);
        surface.style.setProperty('--pointer-y', `${y}px`);
        frame = 0;
      });
    }, { passive: true });
    surface.addEventListener('pointerleave', () => {
      cancelAnimationFrame(frame);
      frame = 0;
    });
  });
})();
