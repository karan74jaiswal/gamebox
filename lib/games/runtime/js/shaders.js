import * as THREE from 'three';

/**
 * Custom GLSL Shaders & Visual Wonders.
 * Includes Cyber Grid, Hologram with Scanlines, Energy Shield, Dissolve, Water Wave, and Lava ShaderMaterials.
 */
export class Shaders {
  /**
   * Infinite Cyber Grid Floor Shader with animated pulse lines and distance fading.
   */
  static createCyberGrid(options = {}) {
    const gridColor = new THREE.Color(options.gridColor || 0xea580c);
    const bgColor = new THREE.Color(options.bgColor || 0x09090b);

    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        gridColor: { value: gridColor },
        bgColor: { value: bgColor },
        gridSize: { value: options.gridSize || 30.0 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec2 vUv;

        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 gridColor;
        uniform vec3 bgColor;
        uniform float gridSize;

        varying vec3 vWorldPosition;
        varying vec2 vUv;

        void main() {
          vec2 coord = vWorldPosition.xz / 2.0;
          vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
          float line = min(grid.x, grid.y);
          float c = 1.0 - min(line, 1.0);

          float pulse = sin(length(vWorldPosition.xz) * 0.2 - time * 2.0) * 0.5 + 0.5;
          float dist = length(vWorldPosition.xz);
          float fade = clamp(1.0 - dist / gridSize, 0.0, 1.0);

          vec3 finalColor = mix(bgColor, gridColor * (1.0 + pulse * 0.5), c * fade);
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      extensions: {
        derivatives: true,
      },
    });
  }

  /**
   * Sci-Fi Hologram Shader with animated scanlines and Fresnel rim glow.
   */
  static createHologram(options = {}) {
    const color = new THREE.Color(options.color || 0x38bdf8);

    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: color },
        scanlineCount: { value: options.scanlines || 60.0 },
        opacity: { value: options.opacity || 0.8 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec2 vUv;

        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 color;
        uniform float scanlineCount;
        uniform float opacity;

        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec2 vUv;

        void main() {
          vec3 viewDir = normalize(vViewPosition);
          float fresnel = pow(1.0 - max(0.0, dot(viewDir, vNormal)), 2.5);
          float scanline = sin(vUv.y * scanlineCount + time * 6.0) * 0.5 + 0.5;
          float alpha = (fresnel * 0.7 + scanline * 0.3) * opacity;
          gl_FragColor = vec4(color * (1.2 + fresnel), alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  /**
   * Forcefield Energy Shield with glowing rim and pulse effect.
   */
  static createShield(options = {}) {
    const color = new THREE.Color(options.color || 0xea580c);

    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: color },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 color;

        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          float rim = 1.0 - max(0.0, dot(vec3(0.0, 0.0, 1.0), vNormal));
          rim = pow(rim, 2.0);

          float wave = sin(vPosition.y * 12.0 + time * 4.0) * 0.15;
          float alpha = clamp(rim + wave, 0.1, 0.85);

          gl_FragColor = vec4(color * 1.5, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  /**
   * Dissolve / Disintegration Shader with fiery glowing edge boundary.
   */
  static createDissolve(options = {}) {
    const color = new THREE.Color(options.color || 0xea580c);
    const edgeColor = new THREE.Color(options.edgeColor || 0xfef08a);

    return new THREE.ShaderMaterial({
      uniforms: {
        progress: { value: 0.0 },
        baseColor: { value: color },
        edgeColor: { value: edgeColor },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;

        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float progress;
        uniform vec3 baseColor;
        uniform vec3 edgeColor;

        varying vec2 vUv;
        varying vec3 vNormal;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          float n = hash(vUv * 20.0);
          if (n < progress) discard;

          float edge = smoothstep(progress, progress + 0.08, n);
          vec3 col = mix(edgeColor * 2.0, baseColor, edge);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Animated Water / Ocean Shader with vertex ripples and specular shine.
   */
  static createWater(options = {}) {
    const deepColor = new THREE.Color(options.deepColor || 0x0284c7);
    const surfaceColor = new THREE.Color(options.surfaceColor || 0x38bdf8);

    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        deepColor: { value: deepColor },
        surfaceColor: { value: surfaceColor },
      },
      vertexShader: `
        uniform float time;
        varying vec2 vUv;
        varying vec3 vNormal;

        void main() {
          vUv = uv;
          vec3 pos = position;
          pos.z += sin(pos.x * 3.0 + time * 2.0) * 0.15;
          pos.z += cos(pos.y * 3.0 + time * 1.5) * 0.15;

          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 deepColor;
        uniform vec3 surfaceColor;
        varying vec2 vUv;
        varying vec3 vNormal;

        void main() {
          float shimmer = dot(vNormal, vec3(0.0, 0.0, 1.0));
          vec3 col = mix(deepColor, surfaceColor, shimmer * 0.5 + 0.5);
          gl_FragColor = vec4(col, 0.85);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Volcanic Lava / Magma Shader with glowing veins.
   */
  static createLava(options = {}) {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        varying vec2 vUv;

        float noise(vec2 p) {
          return sin(p.x * 10.0 + time) * cos(p.y * 10.0 + time);
        }

        void main() {
          float n = noise(vUv * 4.0);
          vec3 darkRock = vec3(0.1, 0.05, 0.05);
          vec3 hotMagma = vec3(1.0, 0.35, 0.05);
          vec3 yellowHeat = vec3(1.2, 0.9, 0.2);

          vec3 color = mix(darkRock, hotMagma, smoothstep(-0.2, 0.5, n));
          if (n > 0.6) color = mix(color, yellowHeat, (n - 0.6) * 2.5);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
  }
}
