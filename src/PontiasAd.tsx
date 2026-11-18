import React, {useEffect, useMemo, useState} from 'react';
import {
  AbsoluteFill,
  Easing,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  NOTIF,
  SCREEN_PT,
  TEX_H,
  TEX_W,
  ScreenAssets,
  drawScreen,
  notifHeight,
  prepareAssets,
} from './screen';

export const FPS = 30;
export const DURATION = 270; // 9 s

// ---- Phone dimensions (cm, iPhone 15 Pro-like) ----
const PW = 7.09;
const PH = 14.66;
const PD = 0.83;
const PR = 1.12; // corner radius
const BEVEL = 0.17;
const SCREEN_INSET = 0.2;
const SW = PW - SCREEN_INSET * 2;
const SH = SW * (SCREEN_PT.h / SCREEN_PT.w);
const SR = 0.95;
const PHONE_YAW = 0.32;

// Timeline (frames)
const T_BUZZ = 100;
const T_NOTIF = 106;
const T_PUSH_START = 128;
const T_PUSH_END = 228;

const roundedShape = (w: number, h: number, r: number) => {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
};

// Continuous-curvature-ish squircle for the screen/glass
const squircleShape = (w: number, h: number, r: number) => {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  const k = 0.62;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.bezierCurveTo(x + w - r * (1 - k), y, x + w, y + r * (1 - k), x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.bezierCurveTo(x + w, y + h - r * (1 - k), x + w - r * (1 - k), y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.bezierCurveTo(x + r * (1 - k), y + h, x, y + h - r * (1 - k), x, y + h - r);
  s.lineTo(x, y + r);
  s.bezierCurveTo(x, y + r * (1 - k), x + r * (1 - k), y, x + r, y);
  return s;
};

const shapeGeoWithUV = (shape: THREE.Shape, w: number, h: number) => {
  const g = new THREE.ShapeGeometry(shape, 48);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  }
  uv.needsUpdate = true;
  return g;
};

const makeShadowTexture = (blurPx: number, alpha: number) => {
  const c = document.createElement('canvas');
  const W = 512;
  const H = 1024;
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.filter = `blur(${blurPx}px)`;
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  // footprint occupies the central 60% of the texture
  const fw = W * 0.6;
  const fh = H * 0.6 * (PH / PW) / (H / W);
  const r = (PR / PW) * fw;
  const x = (W - fw) / 2;
  const y = (H - fh) / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + fw, y, x + fw, y + fh, r);
  ctx.arcTo(x + fw, y + fh, x, y + fh, r);
  ctx.arcTo(x, y + fh, x, y, r);
  ctx.arcTo(x, y, x + fw, y, r);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const makeSheenTexture = () => {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 1024;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 256, 1024);
  g.addColorStop(0.0, 'rgba(255,255,255,0)');
  g.addColorStop(0.38, 'rgba(255,255,255,0)');
  g.addColorStop(0.47, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.16)');
  g.addColorStop(0.56, 'rgba(255,255,255,0.05)');
  g.addColorStop(0.7, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 1024);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
};

const Environment: React.FC = () => {
  const {gl, scene} = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environment = env;
    return () => {
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
};

type CamState = {pos: THREE.Vector3; target: THREE.Vector3};

const CameraRig: React.FC<CamState> = ({pos, target}) => {
  const {camera} = useThree();
  camera.position.copy(pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  return null;
};

const Phone: React.FC<{
  screenTex: THREE.Texture;
  frame: number;
  lift: number;
  tilt: number;
  buzz: THREE.Vector3;
  buzzRot: number;
}> = ({screenTex, frame, lift, tilt, buzz, buzzRot}) => {
  const geo = useMemo(() => {
    const depth = PD - BEVEL * 2;
    const body = new THREE.ExtrudeGeometry(
      roundedShape(PW - BEVEL * 2, PH - BEVEL * 2, PR - BEVEL),
      {
        depth,
        bevelEnabled: true,
        bevelThickness: BEVEL,
        bevelSize: BEVEL,
        bevelSegments: 12,
        curveSegments: 48,
      },
    );
    body.translate(0, 0, -depth / 2);
    body.computeVertexNormals();
    const glass = new THREE.ShapeGeometry(
      squircleShape(PW - BEVEL * 2 + 0.06, PH - BEVEL * 2 + 0.06, PR - BEVEL + 0.03),
      48,
    );
    const screen = shapeGeoWithUV(squircleShape(SW, SH, SR), SW, SH);
    const sheen = shapeGeoWithUV(squircleShape(SW, SH, SR), SW, SH);
    return {body, glass, screen, sheen};
  }, []);

  const mats = useMemo(() => {
    const frameMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#cfcac2'),
      metalness: 1,
      roughness: 0.32,
      clearcoat: 0.4,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1.25,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#050506',
      metalness: 0,
      roughness: 0.04,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 1.4,
    });
    const screenMat = new THREE.MeshBasicMaterial({
      map: screenTex,
      toneMapped: false,
    });
    const sheenTex = makeSheenTexture();
    const sheenMat = new THREE.MeshBasicMaterial({
      map: sheenTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const buttonMat = frameMat;
    return {frameMat, glassMat, screenMat, sheenMat, sheenTex, buttonMat};
  }, [screenTex]);

  // Slowly sliding reflection across the glass
  mats.sheenTex.offset.set(0, interpolate(frame, [0, DURATION], [0.18, -0.12]));

  const top = PD / 2;
  const btn = (
    side: number,
    y: number,
    len: number,
    key: string,
  ) => (
    <mesh
      key={key}
      material={mats.buttonMat}
      position={[side * (PW / 2 + 0.02), y, 0]}
    >
      <boxGeometry args={[0.1, len, 0.3]} />
    </mesh>
  );

  return (
    <group
      position={[buzz.x, PD / 2 + lift + buzz.y, buzz.z]}
      rotation={[-Math.PI / 2 + tilt, 0, 0]}
    >
      <group rotation={[0, 0, buzzRot]}>
        <mesh geometry={geo.body} material={mats.frameMat} />
        <mesh geometry={geo.glass} material={mats.glassMat} position={[0, 0, top + 0.001]} />
        <mesh geometry={geo.screen} material={mats.screenMat} position={[0, 0, top + 0.003]} />
        <mesh geometry={geo.sheen} material={mats.sheenMat} position={[0, 0, top + 0.005]} />
        {btn(-1, 4.3, 0.55, 'action')}
        {btn(-1, 3.0, 0.95, 'volup')}
        {btn(-1, 1.75, 0.95, 'voldown')}
        {btn(1, 2.6, 1.55, 'power')}
      </group>
    </group>
  );
};

const ShadowPlanes: React.FC<{lift: number}> = ({lift}) => {
  const tex = useMemo(
    () => ({
      contact: makeShadowTexture(6, 0.9),
      soft: makeShadowTexture(46, 0.55),
    }),
    [],
  );
  const sizeW = PW / 0.6;
  const sizeH = sizeW * 2;
  const k = Math.max(0, 1 - lift / 3.2);
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh position={[0.05, -0.15, 0.002]} scale={[1 + (1 - k) * 0.15, 1 + (1 - k) * 0.1, 1]}>
        <planeGeometry args={[sizeW * 0.97, sizeH * 0.985]} />
        <meshBasicMaterial map={tex.contact} transparent opacity={0.42 * k * k} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0.65 + lift * 0.3, -0.75 - lift * 0.3, 0.001]} scale={[1.06 + lift * 0.05, 1.04 + lift * 0.04, 1]}>
        <planeGeometry args={[sizeW, sizeH]} />
        <meshBasicMaterial map={tex.soft} transparent opacity={0.38 * (0.4 + 0.6 * k)} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
};

const useScreenAssets = () => {
  const [handle] = useState(() => delayRender('Loading wallpaper & fonts'));
  const [assets, setAssets] = useState<ScreenAssets | null>(null);
  useEffect(() => {
    const img = new Image();
    img.src = staticFile('wallpaper.png');
    const icon = new Image();
    icon.src = staticFile('logo-icon.png');
    const fonts = Promise.all([
      new FontFace('Inter', `url(${staticFile('Inter-Regular.otf')})`, {weight: '400'}).load(),
      new FontFace('Inter', `url(${staticFile('Inter-SemiBold.otf')})`, {weight: '600'}).load(),
      new FontFace('Inter Display', `url(${staticFile('InterDisplay-SemiBold.otf')})`, {weight: '600'}).load(),
    ]).then((faces) => faces.forEach((f) => (document.fonts as any).add(f)));
    Promise.all([img.decode(), icon.decode(), fonts])
      .then(() => document.fonts.load('16px "Noto Color Emoji"', '❤️'))
      .then(() => {
        setAssets(prepareAssets(img, icon));
        continueRender(handle);
      });
  }, [handle]);
  return assets;
};

const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const PontiasAd: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const assets = useScreenAssets();

  const {canvas, texture} = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = TEX_W;
    c.height = TEX_H;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 16;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    return {canvas: c, texture: t};
  }, []);

  // ---- Notification animation ----
  const notifSpring = spring({
    frame: frame - T_NOTIF,
    fps: FPS,
    config: {damping: 15, stiffness: 140, mass: 0.9},
  });
  const notifOpacity = interpolate(frame, [T_NOTIF, T_NOTIF + 7], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  if (assets) {
    drawScreen(canvas, assets, {progress: notifSpring, opacity: notifOpacity});
    texture.needsUpdate = true;
  }

  // ---- Entrance: phone settles onto the table ----
  const enter = interpolate(frame, [0, 42], [0, 1], {
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
  const lift = (1 - enter) * 4.2;
  const tilt = (1 - enter) * 0.22;
  const whiteFade = interpolate(frame, [0, 22], [1, 0], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad),
  });

  // ---- Haptic buzz: two short pulses ----
  const buzzEnvelope = (f: number) => {
    const pulse = (start: number, len: number) => {
      const t = (f - start) / len;
      return t > 0 && t < 1 ? Math.sin(Math.PI * t) : 0;
    };
    return pulse(T_BUZZ, 9) + pulse(T_BUZZ + 13, 9);
  };
  const env = buzzEnvelope(frame);
  // deterministic high-frequency jitter (sub-frame phases)
  const jx = Math.sin(frame * 2.7) * 0.045 * env;
  const jz = Math.cos(frame * 3.3) * 0.03 * env;
  const buzz = new THREE.Vector3(jx, 0, jz);
  const buzzRot = Math.sin(frame * 3.9) * 0.012 * env;

  // ---- Camera ----
  const travel = interpolate(frame, [0, DURATION], [0, 1], {easing: Easing.bezier(0.33, 0.0, 0.4, 1)});
  const push = interpolate(frame, [T_PUSH_START, T_PUSH_END], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeInOut,
  });
  const hold = interpolate(frame, [T_PUSH_END, DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Notification centre in world space
  const notifWorld = useMemo(() => {
    const hPt = 104; // approx height of platter in points
    const cyPt = NOTIF.y + hPt / 2;
    const ly = (0.5 - cyPt / SCREEN_PT.h) * SH;
    const v = new THREE.Vector3(0, ly, PD / 2);
    v.applyEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    v.applyEuler(new THREE.Euler(0, PHONE_YAW, 0));
    return v;
  }, []);

  const az = lerp(lerp(PHONE_YAW - 0.62, PHONE_YAW - 0.26, travel), PHONE_YAW - 0.04, push);
  const el = lerp(lerp(0.66, 0.9, travel), 1.2, push);
  const dist = lerp(lerp(50, 42, travel), 25.5, push) * (1 - 0.025 * hold);
  const target = new THREE.Vector3(0, 0.2, 0.6).lerp(notifWorld, push);
  const camPos = new THREE.Vector3(
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    Math.cos(el) * Math.cos(az),
  )
    .multiplyScalar(dist)
    .add(target);

  return (
    <AbsoluteFill style={{backgroundColor: '#ffffff'}}>
      {/* barely-there studio falloff on the white sweep */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(120% 80% at 50% 45%, rgba(255,255,255,0) 60%, rgba(0,0,0,0.035) 100%)',
        }}
      />
      <ThreeCanvas
        width={width}
        height={height}
        camera={{fov: 30, near: 0.5, far: 400, position: [0, 30, 40]}}
        gl={{antialias: true, alpha: true, preserveDrawingBuffer: true}}
        onCreated={({gl}) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.setClearColor(0xffffff, 0);
        }}
      >
        <Environment />
        <CameraRig pos={camPos} target={target} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[-8, 20, -6]} intensity={1.6} />
        <directionalLight position={[10, 8, 12]} intensity={0.6} />
        <group rotation={[0, PHONE_YAW, 0]}>
          <ShadowPlanes lift={lift} />
          <Phone
            screenTex={texture}
            frame={frame}
            lift={lift}
            tilt={tilt}
            buzz={buzz}
            buzzRot={buzzRot}
          />
        </group>
      </ThreeCanvas>
      <AbsoluteFill style={{backgroundColor: '#fff', opacity: whiteFade}} />
    </AbsoluteFill>
  );
};
