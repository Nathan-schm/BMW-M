import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('threeCanvas');
const container = document.getElementById('carPreview');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);
scene.fog = new THREE.Fog(0x1a1a1a, 8, 20); // Ajout de fog pour profondeur premium

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(5, 2, 6);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 4.5);
keyLight.position.set(8, 10, 5);
keyLight.castShadow = true;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x1C69D4, 2.5);
fillLight.position.set(-8, 4, -6);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 3);
rimLight.position.set(0, 6, -10);
scene.add(rimLight);

const hemiLight = new THREE.HemisphereLight(0xaaaaaa, 0x444444, 0.6);
scene.add(hemiLight);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 3;
controls.maxDistance = 12;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;

// Arrête l'auto-rotate pendant l'interaction
let autoRotateTimeout;
controls.addEventListener('start', () => {
    controls.autoRotate = false;
    clearTimeout(autoRotateTimeout);
});
controls.addEventListener('end', () => {
    clearTimeout(autoRotateTimeout);
    autoRotateTimeout = setTimeout(() => {
        controls.autoRotate = true;
    }, 2800);
});

const loader = new GLTFLoader();
let carModel = null;
let currentColor = null;

const modelFiles = {
    m2: 'media/3d/bmw-m2.glb',
    m3: 'media/3d/bmw-m3.glb',
    m4: 'media/3d/bmw-m4.glb'
};

function loadModel(modelKey) {
    if (carModel) {
        scene.remove(carModel);
        carModel = null;
    }

    loader.load(
        modelFiles[modelKey],
        (gltf) => {
            carModel = gltf.scene;

            const box = new THREE.Box3().setFromObject(carModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 6 / maxDim;

            carModel.scale.setScalar(scale);
            carModel.position.sub(center.multiplyScalar(scale));
            carModel.rotation.y = Math.PI * 0.05; // Légère rotation initiale

            scene.add(carModel);

            if (currentColor) applyColor(currentColor);
        },
        undefined,
        (error) => console.error('Erreur chargement 3D:', error)
    );
}

function applyColor(hexColor) {
    currentColor = hexColor;
    if (!carModel) return;

    carModel.traverse((child) => {
        if (child.isMesh && child.material) {
            const matName = child.material.name || '';
            if (matName.includes('Paint') || matName.includes('Body') || matName.includes('Coloured')) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.color.set(hexColor));
                } else {
                    child.material.color.set(hexColor);
                }
            }
        }
    });
}

window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

loadModel('m2');

export { loadModel, applyColor };