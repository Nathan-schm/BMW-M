import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('threeCanvas');
const container = document.getElementById('carPreview');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);
scene.fog = new THREE.Fog(0x1a1a1a, 8, 20);

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
let loadGen = 0;
let currentColor = null;
let baseModelY = 0;
let currentPack = 'none';
let originalMaterials = new Map();

const modelFiles = {
    m2: 'media/3d/bmw-m2.glb',
    m3: 'media/3d/bmw-m3.glb',
    m4: 'media/3d/bmw-m4.glb'
};

const packEffects = {
    none: {},
    carbon: {
        carbonParts: true,
        carbonColor: '#1a1a1a',
        carbonRoughness: 0.6
    },
    track: {
        carbonParts: true,
        carbonColor: '#0a0a0a',
        loweredSuspension: true
    },
    ultimate: {
        carbonParts: true,
        carbonColor: '#0a0a0a',
        loweredSuspension: true,
        redCalipers: true
    }
};

function loadModel(modelKey) {
    const myGen = ++loadGen;
    if (carModel) {
        scene.remove(carModel);
        carModel = null;
    }

    originalMaterials.clear();

    loader.load(
        modelFiles[modelKey],
        (gltf) => {
            if (myGen !== loadGen) return; // chargement obsolète : on ignore
            carModel = gltf.scene;

            const box = new THREE.Box3().setFromObject(carModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 6 / maxDim;

            carModel.scale.setScalar(scale);
            carModel.position.sub(center.multiplyScalar(scale));
            carModel.rotation.y = Math.PI * 0.05;

            scene.add(carModel);

            // Sauvegarde couleurs originales
            carModel.traverse((child) => {
                if (!child.isMesh || !child.material) return;
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(mat => {
                    if (!originalMaterials.has(mat.uuid)) {
                        originalMaterials.set(mat.uuid, {
                            color: mat.color.clone(),
                            metalness: mat.metalness,
                            roughness: mat.roughness
                        });
                    }
                });
            });

            baseModelY = carModel.position.y;

            if (currentColor) applyColor(currentColor);
            if (currentPack !== 'none') applyPack(currentPack);
        },
        undefined,
        (error) => console.error('Erreur chargement 3D:', error)
    );
}

function applyColor(hexColor) {
    currentColor = hexColor;
    if (!carModel) return;

    const targetColor = new THREE.Color(hexColor);

    carModel.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];

        mats.forEach(mat => {
            const matName = (mat.name || '').toLowerCase();

            const bodyKeywords = [
                'paint',        // M2/M3 : Paint_Material1 | M4 old : CarPaint | M4 comp : PaintTNR
                'chassis',      // M4 old : Chassis
                'carpaintnormal' // M4 old : CarPaintNormal
            ];

            const excludeKeywords = [
                'glass', 'window', 'tire', 'tyre', 'rubber', 'wheel', 'rim',
                'brake', 'caliper', 'calliper', 'light', 'lamp', 'chrome',
                'interior', 'seat', 'leather', 'plastic', 'grille', 'grillealpha',
                'grillenoalpha', 'logo', 'badge', 'mirror', 'license', 'plate',
                'carbon', 'trim', 'engine', 'nickel', 'disc', 'blur', 'emissive',
                'bucket', 'surround', 'opaque', 'coloured'
            ];

            const isExcluded = excludeKeywords.some(k => matName.includes(k));
            if (isExcluded) return;

            const isBody = bodyKeywords.some(k => matName.includes(k));
            if (isBody) {
                mat.color.copy(targetColor);
                mat.metalness = 0.6;
                mat.roughness = 0.3;
                mat.needsUpdate = true;
            }
        });
    });
}

function applyWheelColor(hexColor) {
    if (!carModel) return;
    carModel.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(mat => {
            const matName = (mat.name || '').toLowerCase();
            const isWheel = (
                matName.includes('wheel') ||   // M2/M3 : Wheel1A | M4 old : Wheel2A
                matName.includes('rim') ||     // M4 old : black_rim_1, rim_BA, rim_3 | M4 comp : TNR_Rim
                matName === 'phong8' ||         // M4 old
                matName === 'phong2'            // M4 comp
            );
            if (isWheel) {
                mat.color.set(hexColor);
                mat.metalness = 0.9;
                mat.roughness = 0.2;
                mat.needsUpdate = true;
            }
        });
    });
}

function applyPack(packKey) {
    currentPack = packKey;
    if (!carModel) return;

    const effect = packEffects[packKey] || {};

    carModel.position.y = baseModelY;

    if (packKey === 'none') {
    carModel.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(mat => {
            const original = originalMaterials.get(mat.uuid);
            if (original) {
                mat.color.copy(original.color);
                mat.metalness = original.metalness;
                mat.roughness = original.roughness;
                mat.needsUpdate = true;
            }
        });
    });

    // Réapplique la couleur choisie après le reset
    if (currentColor) applyColor(currentColor);
    return;
}

    if (effect.loweredSuspension) {
        carModel.position.y = baseModelY - 0.15;
    }

    carModel.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];

        mats.forEach(mat => {
            const matName = (mat.name || '').toLowerCase();

            // Étriers rouges
            if (effect.redCalipers) {
                const isCaliper = (
                    matName.includes('callipera') ||        // M2/M3
                    matName.includes('calliperanos') ||     // M4 old : CalliperAnodised
                    matName.includes('callipergloss')       // M4 comp : CalliperGloss
                );
                if (isCaliper) {
                    mat.color.set('#cc0000');
                    mat.metalness = 0.6;
                    mat.roughness = 0.3;
                    mat.needsUpdate = true;
                }
            }

            // Pièces carbone
            if (effect.carbonParts) {
                const isCarbonPart = (
                    // M2/M3
                    matName.includes('grille') ||
                    matName.includes('base') ||
                    matName.includes('carbon') ||
                    matName.includes('coloured') ||
                    // M4 old
                    matName.includes('vorsteiner') ||
                    matName.includes('trim') ||
                    // M4 comp
                    matName.includes('grillealpha') ||
                    matName.includes('grillenoalpha')
                );

                if (isCarbonPart) {
                    mat.color.set(effect.carbonColor);
                    mat.metalness = 0.3;
                    mat.roughness = effect.carbonRoughness || 0.6;
                    mat.needsUpdate = true;
                }
            }
        });
    });
}

const interiorColors = {
    black: '#1a1a1a',
    cognac: '#a0571f',
    silverstone: '#b8b8b8',
    kyalami: '#e85d04'
};

function applyInterior(interiorKey) {
    if (!carModel) return;
    const targetColor = new THREE.Color(interiorColors[interiorKey]);

    carModel.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];

        mats.forEach(mat => {
            const matName = (mat.name || '').toLowerCase();
            if (matName.includes('interior')) {
                mat.color.copy(targetColor);
                mat.needsUpdate = true;
            }
        });
    });
}

// Ajoute une lumière intérieure dédiée
const interiorLight = new THREE.PointLight(0xffffff, 0, 3);
interiorLight.position.set(0, 1, 0);
scene.add(interiorLight);

let interiorMode = false;

function focusInterior(active) {
    if (active === interiorMode) return;  // ← si déjà dans le bon mode, fait rien
    interiorMode = active;

    if (active) {
        controls.autoRotate = false;
        camera.position.set(1.5, 1.2, 2);
        controls.target.set(0, 0.5, 0);
        controls.minDistance = 1;
        controls.maxDistance = 4;
        interiorLight.intensity = 8;
        ambientLight.intensity = 4;
    } else {
        camera.position.set(5, 2, 6);
        controls.target.set(0, 0, 0);
        controls.minDistance = 3;
        controls.maxDistance = 12;
        controls.autoRotate = true;
        interiorLight.intensity = 0;
        ambientLight.intensity = 1.8;
    }
    controls.update();
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

export { loadModel, applyColor, applyWheelColor, applyPack, applyInterior, focusInterior };