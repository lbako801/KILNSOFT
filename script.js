const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// ─────────────────────────  Ember particle setup  ─────────────────────────
const particles = [];
const EMBER_COUNT = 90;                // slightly fewer embers

for (let i = 0; i < EMBER_COUNT; i++) {
    const baseSize = Math.random() * 3 + 2;      // 2–5 px
    particles.push({
        baseX: Math.random() * canvas.width,
        x: 0,    // will be set below
        y: Math.random() * canvas.height,
        baseSize,
        size: baseSize,
        speed: Math.random() * 1.2 + 0.8,        // faster upward speed
        drift: (Math.random() - 0.5) * 0.4,      // slight horizontal drift
        flickerPhase: Math.random() * Math.PI * 2,
        // Looping motion parameters
        loopRadius: Math.random() < 0.4 ? Math.random() * 20 + 8 : 0, // 40% do loops
        angle: Math.random() * Math.PI * 2,
        angularSpeed: Math.random() * 0.08 + 0.04
    });
    // initialise x with center + loop offset
    particles[i].x = particles[i].baseX + Math.sin(particles[i].angle) * particles[i].loopRadius;
}

function drawEmber(p, t) {
    // Flicker by modulating size subtly over time
    const flicker = 0.3 + 0.2 * Math.sin(t * 0.02 + p.flickerPhase);
    p.size = p.baseSize * flicker;

    // Radial gradient for a glowing ember
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
    grad.addColorStop(0.0, 'rgba(255, 230, 160, 1)');     // white-hot core
    grad.addColorStop(0.3, 'rgba(255, 150, 50, 0.9)');    // bright orange
    grad.addColorStop(1.0, 'rgba(209, 101, 23, 0)');      // fade to transparent

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
}

function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const t = performance.now();

    particles.forEach(p => {
        drawEmber(p, t);

        // Update position
        p.y -= p.speed;

        // Update loop / drift horizontally
        if (p.loopRadius > 0) {
            p.angle += p.angularSpeed;
            p.baseX += p.drift;            // center also drifts
            p.x = p.baseX + Math.sin(p.angle) * p.loopRadius;
        } else {
            p.x += p.drift;
        }

        // Respawn when off-screen
        if (p.y < -p.size) {
            p.y = canvas.height + p.size;
            p.baseX = Math.random() * canvas.width;
            p.angle = Math.random() * Math.PI * 2;
            p.loopRadius = Math.random() < 0.4 ? Math.random() * 20 + 8 : 0;
            p.x = p.baseX + Math.sin(p.angle) * p.loopRadius;
        }

        // Wrap horizontally so embers drift back into view
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
    });

    requestAnimationFrame(animateParticles);
}

animateParticles();

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}); 