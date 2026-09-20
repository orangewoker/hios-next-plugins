import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

export type ViewerOptions = { wireframe: boolean; grid: boolean; axes: boolean; whiteModel: boolean; metalness: number; roughness: number; background: string };

function disposeObject(object?: THREE.Object3D | null) {
  object?.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => value instanceof THREE.Texture && value.dispose());
      material.dispose();
    });
  });
}

async function loadObject(source: string, type: string, resources?: Record<string, string>, materialText?: string) {
  const extension = type.toUpperCase();
  const manager = new THREE.LoadingManager();
  if (resources) manager.setURLModifier((requested) => {
    const cleaned = decodeURIComponent(requested).replaceAll('\\', '/').replace(/^\.\//, '');
    return resources[cleaned] || Object.entries(resources).find(([name]) => name.endsWith(`/${cleaned}`) || name.split('/').at(-1) === cleaned)?.[1] || requested;
  });
  if (['GLB', 'GLTF'].includes(extension)) return (await new GLTFLoader(manager).loadAsync(source)).scene;
  if (extension === 'OBJ') {
    const loader = new OBJLoader(manager);
    if (materialText) {
      const materials = new MTLLoader(manager).parse(materialText, './');
      materials.preload(); loader.setMaterials(materials);
    }
    return loader.loadAsync(source);
  }
  if (extension === 'FBX') return new FBXLoader().loadAsync(source);
  if (extension === 'STL') {
    const geometry = await new STLLoader().loadAsync(source);
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: .55, metalness: .08 }));
  }
  throw new Error(`当前预览器不支持 ${extension || '该'} 格式`);
}

export function ModelViewer({ source, type, options, resources, materialText, onStats }: { source: string; type: string; options: ViewerOptions; resources?: Record<string, string>; materialText?: string; onStats?: (stats: { triangles: number; objects: number }) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  type ViewerRuntime = { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; object?: THREE.Object3D; grid: THREE.GridHelper; axes: THREE.AxesHelper; frame: number };
  const runtimeRef = useRef<ViewerRuntime | undefined>(undefined);
  const optionsRef = useRef(options); optionsRef.current = options;
  const [message, setMessage] = useState(source ? '正在读取模型…' : '生成完成后，模型将显示在这里');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, .01, 5000);
    camera.position.set(2.7, 2.1, 3.4);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.append(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = .07;
    const ambient = new THREE.HemisphereLight('#ffffff', '#172033', 2.1);
    const key = new THREE.DirectionalLight('#ffffff', 3.2); key.position.set(4, 7, 4);
    const rim = new THREE.DirectionalLight('#7dd3fc', 1.4); rim.position.set(-4, 3, -5);
    scene.add(ambient, key, rim);
    const grid = new THREE.GridHelper(20, 40, '#4d5f76', '#263346');
    const axes = new THREE.AxesHelper(1.4);
    scene.add(grid, axes);
    const resize = () => {
      const width = Math.max(1, container.clientWidth); const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const runtime: ViewerRuntime = { renderer, scene, camera, controls, grid, axes, frame: 0 };
    runtimeRef.current = runtime;
    const animate = () => { runtime.frame = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
    animate();
    return () => { observer.disconnect(); cancelAnimationFrame(runtime.frame); controls.dispose(); disposeObject(runtime.object); runtime.grid.geometry.dispose(); (runtime.grid.material as THREE.Material).dispose(); renderer.dispose(); renderer.domElement.remove(); runtimeRef.current = undefined; };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const color = new THREE.Color(options.background);
    const light = color.r * .2126 + color.g * .7152 + color.b * .0722 > .55;
    const grid = new THREE.GridHelper(20, 40, light ? '#a4b3c6' : '#4d5f76', light ? '#d3dce7' : '#263346');
    grid.visible = optionsRef.current.grid;
    runtime.scene.remove(runtime.grid);
    runtime.grid.geometry.dispose();
    (runtime.grid.material as THREE.Material).dispose();
    runtime.grid = grid;
    runtime.scene.add(grid);
  }, [options.background]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.scene.background = new THREE.Color(options.background);
    runtime.grid.visible = options.grid;
    runtime.axes.visible = options.axes;
    runtime.object?.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if ('wireframe' in material) (material as THREE.MeshStandardMaterial).wireframe = options.wireframe;
        if ('metalness' in material) (material as THREE.MeshStandardMaterial).metalness = options.metalness;
        if ('roughness' in material) (material as THREE.MeshStandardMaterial).roughness = options.roughness;
      });
    });
  }, [options]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    let canceled = false;
    if (runtime.object) { runtime.scene.remove(runtime.object); disposeObject(runtime.object); runtime.object = undefined; }
    if (!source) { setMessage('生成完成后，模型将显示在这里'); return; }
    setMessage('正在解析模型…');
    void loadObject(source, type, resources, materialText).then((object) => {
      if (canceled) { disposeObject(object); return; }
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      object.position.sub(center);
      const maxSize = Math.max(size.x, size.y, size.z, .001);
      const scale = 2.4 / maxSize; object.scale.setScalar(scale);
      const normalized = new THREE.Box3().setFromObject(object);
      object.position.y -= normalized.min.y;
      let triangles = 0; let objects = 0;
      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        objects += 1;
        const geometry = child.geometry;
        triangles += geometry.index ? geometry.index.count / 3 : (geometry.attributes.position?.count || 0) / 3;
        if (optionsRef.current.whiteModel) child.material = new THREE.MeshStandardMaterial({ color: '#d7dde7', metalness: optionsRef.current.metalness, roughness: optionsRef.current.roughness, wireframe: optionsRef.current.wireframe });
      });
      runtime.object = object; runtime.scene.add(object);
      runtime.controls.target.set(0, 1.1, 0); runtime.camera.position.set(3.1, 2.35, 3.7); runtime.controls.update();
      onStats?.({ triangles: Math.round(triangles), objects });
      setMessage('');
    }).catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
    return () => { canceled = true; };
  }, [materialText, onStats, options.whiteModel, resources, source, type]);

  return <div className="viewer-stage"><div className="viewer-canvas" ref={containerRef}/>{message && <div className="viewer-empty"><span className="viewer-cube" /> <p>{message}</p><small>支持 GLB、GLTF、OBJ、FBX 和 STL</small></div>}</div>;
}
