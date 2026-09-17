(() => {
  const logos = document.querySelector('.workflow-platforms');
  if (!logos) return;
  const viewport = document.createElement('div');
  viewport.className = 'workflow-marquee';
  const track = document.createElement('div');
  track.className = 'workflow-marquee-track';
  const repeat = logos.cloneNode(true);
  repeat.setAttribute('aria-hidden', 'true');
  repeat.removeAttribute('aria-label');
  logos.before(viewport);
  track.append(logos, repeat);
  viewport.append(track);
})();
