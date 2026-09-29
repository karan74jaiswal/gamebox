import * as THREE from "three"

export interface SurfacePainterOptions {
  resolution?: number
  clearColor?: THREE.ColorRepresentation
  stampRadius?: number
}

/**
 * Dynamic GPU surface stamping system (extracted from lawn-mowing-game & paint-roll).
 * Paints real-time tracks, grass mowing, paint rolling, or footprint masks onto a render target.
 */
export function createSurfacePainter(
  renderer: THREE.WebGLRenderer,
  options: SurfacePainterOptions = {}
) {
  const { resolution = 512, clearColor = 0x000000, stampRadius = 0.05 } = options

  const target = new THREE.WebGLRenderTarget(resolution, resolution, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  })

  // Off-screen orthographic quad scene for stamping
  const stampScene = new THREE.Scene()
  const stampCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  const stampGeom = new THREE.PlaneGeometry(2, 2)
  const stampMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uFrom: { value: new THREE.Vector2(0.5, 0.5) },
      uTo: { value: new THREE.Vector2(0.5, 0.5) },
      uRadius: { value: stampRadius },
      uColor: { value: new THREE.Color(0xffffff) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      uniform vec2 uFrom;
      uniform vec2 uTo;
      uniform float uRadius;
      uniform vec3 uColor;

      void main() {
        vec2 ab = uTo - uFrom;
        float lenSq = dot(ab, ab);
        float t = lenSq > 1e-6 ? clamp(dot(vUv - uFrom, ab) / lenSq, 0.0, 1.0) : 0.0;
        vec2 closest = uFrom + ab * t;
        float dist = distance(vUv, closest);
        if (dist > uRadius) discard;
        float alpha = smoothstep(uRadius, uRadius * 0.4, dist);
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })

  const stampMesh = new THREE.Mesh(stampGeom, stampMaterial)
  stampScene.add(stampMesh)

  // Clear render target initially
  const prevTarget = renderer.getRenderTarget()
  renderer.setRenderTarget(target)
  renderer.setClearColor(clearColor, 1)
  renderer.clear()
  renderer.setRenderTarget(prevTarget)

  return {
    texture: target.texture,

    /**
     * Stamps a line or dot stroke onto the surface texture in UV coordinates [0..1].
     */
    stamp(
      fromUv: { x: number; y: number },
      toUv: { x: number; y: number },
      radius?: number,
      color: THREE.ColorRepresentation = 0xffffff
    ) {
      stampMaterial.uniforms.uFrom.value.set(fromUv.x, fromUv.y)
      stampMaterial.uniforms.uTo.value.set(toUv.x, toUv.y)
      if (radius !== undefined) stampMaterial.uniforms.uRadius.value = radius
      stampMaterial.uniforms.uColor.value.set(color)

      const prev = renderer.getRenderTarget()
      const prevAutoClear = renderer.autoClear
      renderer.autoClear = false
      renderer.setRenderTarget(target)
      renderer.render(stampScene, stampCamera)
      renderer.setRenderTarget(prev)
      renderer.autoClear = prevAutoClear
    },

    dispose() {
      target.dispose()
      stampGeom.dispose()
      stampMaterial.dispose()
    },
  }
}
