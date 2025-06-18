(() => {
    const fragmentShaderSource = `#version 300 es                          // GLSL version
precision highp float;                                                   // default precision

// ─────────────────────────────   Uniforms   ─────────────────────────────
uniform float time;     // Seconds since page-load, passed in from JS
uniform vec2  vp;       // View-port (width, height) in pixels

// ─────────────────────────────  Varyings  ───────────────────────────────
in vec2 uv;             // Interpolated texture coord (0–1 in both axes)

out vec4 fragColor;     // Final colour for this pixel

// ───────────────────  Pseudo-random helpers  ────────────────────────────
// 2-D hash that returns a repeatable random number in [0,1]
float rand(vec2 p) {
    // dot → sine → fract gives a cheap hash
    return fract(sin(dot(p, vec2(1.0, 300.0))) * 43758.5453123);
}

// Classic 2-D value noise (returns smooth random field in [0,1])
float noise(vec2 p) {
    vec2 i = floor(p);          // integer grid cell ID
    vec2 f = fract(p);          // local position within cell (0-1)

    // Corner values
    float a = rand(i);
    float b = rand(i + vec2(1.0, 0.0));
    float c = rand(i + vec2(0.0, 1.0));
    float d = rand(i + vec2(1.0, 1.0));

    // Smooth interpolation curve (Hermite)
    vec2 u = f * f * (3.0 - 2.0 * f);

    // Bi-linear interpolation of the 4 corners
    return mix(a, b, u.x) +
           (c - a) * u.y * (1.0 - u.x) +
           (d - b) * u.x * u.y;
}

// ───────────────────  Fractional Brownian Motion  ───────────────────────
#define OCTAVES 5               // number of noise layers
float fbm(vec2 p) {
    float value = 0.0;          // final output
    float amplitude = 0.4;      // starting amplitude

    for (int i = 0; i < OCTAVES; i++) {
        value     += amplitude * noise(p); // add scaled noise
        p         *= 2.0;                  // increase frequency
        amplitude *= 0.4;                  // decrease amplitude
    }
    return value;                          // range still roughly [0,1]
}

// ───────────────────────────────  Main  ────────────────────────────────
void main() {
    vec2 p = uv;                     // copy so we can mutate safely

    // Correct for aspect ratio so the noise looks square on screen
    p.x *= vp.x / vp.y;

    // Gradient used to vary brightness with height (gives vertical fade)
    float gradient = mix(p.y * 0.5 + 0.1, p.y * 0.1 + 0.9, fbm(p));

    // Tunable constants – try tweaking these at runtime!
    float speed   = 0.26;   // vertical scroll speed
    float details = 10.0;   // frequency multiplier for high-freq details
    float force   = 0.1;   // how much the 2nd noise field bends the first
    float shift   = 0.2;   // offset to avoid symmetry

    // Move the noise field upward over time & add detail frequency
    vec2 fast = vec2(p.x, p.y - time * speed) * details;

    // Two inter-dependent FBM calls create organic billows
    float ns_a = fbm(fast);
    float ns_b = force * fbm(fast + ns_a + time) - shift;
    float ins  = fbm(vec2(ns_b, ns_a));

    // Map noise -> greys (0.25 dark → 0.9 light)
    vec3 c1 = mix(vec3(0.3), vec3(0.9), ins + shift);

    // Add extra contrast using another noise term (ins-gradient)
    vec3 baseSmoke = c1 + vec3(ins - gradient);

    // heightMask: 1.0 at bottom, fades to 0.0 by 50% screen height
    float heightMask = smoothstep(0.5, 0.0, p.y);

    // Final colour & alpha (alpha follows mask so smoke fades out)
    fragColor = vec4(baseSmoke * heightMask, heightMask);
}`;

    const vertexShaderSource = `#version 300 es                 // Minimal full-screen triangle
precision mediump float;
const vec2 positions[6] = vec2[6](
  vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0),
  vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0));

out vec2 uv; // will hold the 0-1 coord per vertex

void main() {
    uv          = positions[gl_VertexID] * 0.5 + 0.5; // map [-1,1] to [0,1]
    gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}`;

    // ─────────────────────────  WebGL 2 helper  ──────────────────────────
    class WebGLHandler {
        constructor(canvas) {
            // Canvas & GL context setup
            this.cn = canvas;
            this.gl = canvas.getContext('webgl2');
            if (!this.gl) return;

            // Compile & link the GLSL program
            this.program = this.gl.createProgram();
            this._compile(vertexShaderSource, this.gl.VERTEX_SHADER);
            this._compile(fragmentShaderSource, this.gl.FRAGMENT_SHADER);
            this.gl.linkProgram(this.program);
            if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
                console.error('WebGL program failed to link:', this.gl.getProgramInfoLog(this.program));
                return;
            }
            this.gl.useProgram(this.program);

            // Cache uniform locations
            this.timeLoc = this.gl.getUniformLocation(this.program, 'time');
            this.vpLoc = this.gl.getUniformLocation(this.program, 'vp');

            // Resize + start render loop
            this._resize();
            window.addEventListener('resize', () => this._resize());
            this.startTime = Date.now();
            this.render();
        }

        // Compile individual shader & attach to program
        _compile(src, type) {
            const sh = this.gl.createShader(type);
            this.gl.shaderSource(sh, src);
            this.gl.compileShader(sh);
            if (!this.gl.getShaderParameter(sh, this.gl.COMPILE_STATUS)) {
                console.error(this.gl.getShaderInfoLog(sh));
                this.gl.deleteShader(sh);
                return;
            }
            this.gl.attachShader(this.program, sh);
        }

        // Keep canvas & viewport in sync with window size
        _resize() {
            this.cn.width = window.innerWidth;
            this.cn.height = window.innerHeight;
            this.gl.viewport(0, 0, this.cn.width, this.cn.height);
        }

        // Per-frame draw call
        render = () => {
            const t = (Date.now() - this.startTime) / 1000;
            this.gl.uniform1f(this.timeLoc, t);
            this.gl.uniform2f(this.vpLoc, this.cn.width, this.cn.height);
            this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
            requestAnimationFrame(this.render);
        };
    }

    // ───────────────────────  Bootstrapping  ─────────────────────────────
    const canvas = document.createElement('canvas');
    canvas.className = 'shader-canvas';
    document.body.prepend(canvas);  // background layer
    new WebGLHandler(canvas);       // kick things off
})(); 