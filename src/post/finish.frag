// Adapted from kailash-lab/src/shaders/finish.frag: adds a directional
// streak for time-warp and a warm, capped flash.
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uCA;
uniform float uGrain;
uniform float uVignette;
uniform float uFlash;
uniform float uStreak;
uniform vec2 uStreakDir;
uniform vec2 uStreakOrigin;
uniform float uAspect;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 sampleCA(vec2 uv) {
  vec2 dir = uv - 0.5;
  vec2 off = dir * uCA * length(dir);
  return vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
}

void main() {
  vec3 col = sampleCA(vUv);

  if (uStreak > 0.001) {
    // Smear backwards along the direction of travel; stronger away from the photon.
    float away = smoothstep(0.0, 0.6, length((vUv - uStreakOrigin) * vec2(1.6, 1.0)));
    float len = uStreak * 0.06 * (0.35 + away);
    vec3 acc = col;
    float w = 1.0;
    for (int i = 1; i <= 8; i++) {
      float f = float(i) / 8.0;
      float wi = 1.0 - f * 0.85;
      acc += texture2D(tDiffuse, vUv - uStreakDir * len * f).rgb * wi;
      w += wi;
    }
    col = acc / w;
  }

  float d = length(vUv - 0.5);
  col *= mix(1.0, smoothstep(0.98, 0.22, d), uVignette);
  float g = hash(vUv * vec2(1931.0, 1213.0) + fract(uTime * 7.13)) - 0.5;
  col += g * uGrain;
  // A burst centred on the photon rather than a full-screen wash.
  vec2 fd = (vUv - uStreakOrigin) * vec2(uAspect, 1.0);
  float burst = exp(-dot(fd, fd) * 9.0) + 0.12;
  col += uFlash * burst * vec3(1.0, 0.92, 0.78);
  gl_FragColor = vec4(col, 1.0);
}
