import React, { useRef, useState, useEffect, useMemo } from 'react'
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber'
import { Plane, shaderMaterial } from '@react-three/drei'
import * as THREE from 'three'

const createEmojiTexture = (emoji: string, size = 256) => {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, size, size)
    ctx.font = `${size * 0.8}px Arial`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emoji, size / 2, size / 2)
  }
  return new THREE.CanvasTexture(canvas)
}

const HolographicMaterial = shaderMaterial(
  {
    baseTexture: { value: null },
    time: 0,
  },
  `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
    }
  `,
  `
    uniform sampler2D baseTexture;
    uniform float time;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewPosition;

    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

    float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                            -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy));
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m ;
        m = m*m ;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
    }

    void main() {
        vec4 texColor = texture2D(baseTexture, vUv);
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        float fresnelTerm = dot(normal, viewDir);
        fresnelTerm = clamp(1.0 - fresnelTerm, 0.0, 1.0);
        fresnelTerm = pow(fresnelTerm, 3.0);

        float noiseValue = snoise(vUv * .3  + 2.0 * vec2(normal.x, normal.z));
        vec3 rainbow = 0.5 + 0.5 * cos(2.0 * 3.14159 * (vec3(0.0, 0.33, 0.67) + fresnelTerm + noiseValue));

        vec3 reflection = normalize(reflect(-viewDir, normal));
        float specular = max(0.0, dot(normal, reflection));
        specular = pow(specular, 20.0) * 0.8;

        vec3 finalColor = mix(texColor.rgb, rainbow, 0.75 - 1. * length(normal.xz)) + specular;
        gl_FragColor = vec4(finalColor, texColor.a);
    }
  `
)

extend({ HolographicMaterial })

const Sticker = ({ id, position, emoji, updatePosition, scale, rotation }) => {
  const meshRef = useRef()
  const materialRef = useRef()
  const [isDragging, setIsDragging] = useState(false)
  const { camera, scene } = useThree()
  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  const lastMousePosition = useRef(new THREE.Vector2())
  const mouseVelocity = useRef(new THREE.Vector2())
  const springVelocity = useRef(new THREE.Vector3())
  const targetPosition = useRef(new THREE.Vector3())

  const emojiTexture = useMemo(() => createEmojiTexture(emoji), [emoji])

  useFrame((state, delta) => {
    if (materialRef.current) {
      materialRef.current.time = state.clock.getElapsedTime()
    }

    if (isDragging) {
      const currentPosition = meshRef.current.position
      const force = new THREE.Vector3().subVectors(targetPosition.current, currentPosition)
      const acceleration = force.multiplyScalar(0.05)
      springVelocity.current.add(acceleration)
      springVelocity.current.multiplyScalar(0.75)

      currentPosition.add(springVelocity.current)

      const tiltStrength = 5
      meshRef.current.rotation.x = -Math.PI / 2 + rotation[0] + springVelocity.current.z * tiltStrength
      meshRef.current.rotation.y = rotation[1]
      meshRef.current.rotation.z = rotation[2] - springVelocity.current.x * tiltStrength

      updatePosition(id, currentPosition.toArray())
    } else {
      const restPosition = new THREE.Vector3(position[0], 0.01, position[2])
      const currentPosition = meshRef.current.position
      currentPosition.lerp(restPosition, 0.05)

      meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, -Math.PI / 2 + rotation[0], 0.05)
      meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, rotation[1], 0.05)
      meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, rotation[2], 0.05)
    }
  })

  useEffect(() => {
    const handleMouseMove = (event) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1

      mouseVelocity.current.x = mouse.x - lastMousePosition.current.x
      mouseVelocity.current.y = mouse.y - lastMousePosition.current.y

      lastMousePosition.current.copy(mouse)

      if (isDragging) {
        raycaster.setFromCamera(mouse, camera)
        const intersects = raycaster.intersectObject(scene.getObjectByName('floor'))
        if (intersects.length > 0) {
          targetPosition.current.copy(intersects[0].point)
          targetPosition.current.y = 1
        }
      }
    }

    const handleMouseDown = (event) => {
      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObject(meshRef.current)
      if (intersects.length > 0) {
        setIsDragging(true)
        springVelocity.current.set(0, 0, 0)
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, camera, scene])

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.baseTexture = emojiTexture
    }
  }, [emojiTexture])

  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      position={position}
      rotation={[-Math.PI / 2 + rotation[0], rotation[1], rotation[2]]}
      scale={[scale, scale, scale]}
      castShadow
      receiveShadow
      renderOrder={id}  // Higher renderOrder means it's drawn later
    >
      <holographicMaterial
        ref={materialRef}
        baseTexture={emojiTexture}
        transparent
        depthWrite={false}  // Don't write to depth buffer
      />
    </mesh>
  )
}

const Floor = () => (
  <Plane args={[20, 20]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow name="floor">
    <meshPhongMaterial color="#222222" />
  </Plane>
)

function biasedRandomPosition(radius: number, centerBias: number) {
  const angle = Math.random() * 2 * Math.PI;
  const r = radius * Math.sqrt(Math.random()) * (1 - centerBias) + radius * centerBias * Math.sqrt(Math.random());
  const x = r * Math.cos(angle);
  const z = r * Math.sin(angle);
  return [x, 0.01, z];
}

export default function Component() {
  const [stickers, setStickers] = useState(() => {
    const circleRadius = 8;
    const centerBias = 0.9; // Adjust this value to control the center bias (0 to 1)

    const emojiCategories = [
      0x1F600, // Smileys & Emotion
      0x1F300, // Nature & Weather
      0x1F330, // Food & Drink
      0x1F380, // Celebrations & Objects
      0x1F3A0, // Activities
      0x1F400, // Animals & Nature
      0x1F680, // Travel & Places
      0x1F900, // Symbols & Flags
    ];

    const generateRandomEmoji = () => {
      const category = emojiCategories[Math.floor(Math.random() * emojiCategories.length)];
      const offset = Math.floor(Math.random() * 128); // Approximate range within each category
      return String.fromCodePoint(category + offset);
    };

    const NUM_STICKERS = 50;
    return Array.from({ length: NUM_STICKERS }, (_, index) => ({
      id: index + 1,
      position: biasedRandomPosition(circleRadius, centerBias),
      emoji: generateRandomEmoji(),
      scale: 1 + Math.random() * 1.5, // Random scale between 0.7 and 1.6
      rotation: [0, 0, (Math.random() - 0.5) * Math.PI / 2], // Random rotation between -PI/4 and PI/4
    }));
  })


  const updatePosition = (id, newPosition) => {
    setStickers(prevStickers =>
      prevStickers.map(sticker =>
        sticker.id === id ? { ...sticker, position: newPosition } : sticker
      )
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas shadows camera={{ position: [0, 15, 5], fov: 35 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 10, 5]} intensity={0.5} castShadow color="#ffcccc" />
        <directionalLight position={[-5, 10, -5]} intensity={0.5} castShadow color="#ccccff" />
        <Floor />
        {stickers.map(sticker => (
          <Sticker
            key={sticker.id}
            id={sticker.id}
            position={sticker.position}
            emoji={sticker.emoji}
            scale={sticker.scale}
            rotation={sticker.rotation}
            updatePosition={updatePosition}
          />
        ))}
      </Canvas>
    </div>
  )
}
