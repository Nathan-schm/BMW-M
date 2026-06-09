import { loadModel, applyColor } from './three-viewer.js';

const urlParams = new URLSearchParams(window.location.search);
const initialModel = urlParams.get('model');
if (initialModel && ['m2','m3','m4'].includes(initialModel)) {
    document.querySelector(`.model-tab[data-model="${initialModel}"]`).click();
}


// État de la configuration
const config = {
    model: 'm2',
    modelPrice: 89900,
    color: { name: 'Alpine White', hex: '#f5f5f5', price: 0 },
    wheels: { name: 'Style 826 M — 19"', price: 0 },
    interior: { name: 'Noir', price: 0 },
    pack: { name: 'Aucun', price: 0 }
};

const modelPrices = { m2: 89900, m3: 112500, m4: 118900 };
const modelImages = { m2: 'media/img/m2.jpg', m3: 'media/img/m3.jpg', m4: 'media/img/m4.jpg' };

// Refs DOM
const carImg = document.getElementById('carImg');
const carWrap = document.getElementById('carWrap');
const carTint = document.getElementById('carTint');
const carModelName = document.getElementById('carModelName');
const totalPrice = document.getElementById('totalPrice');
const colorCurrent = document.getElementById('colorCurrent');
const wheelsCurrent = document.getElementById('wheelsCurrent');
const interiorCurrent = document.getElementById('interiorCurrent');
const packCurrent = document.getElementById('packCurrent');

// ===== Format prix CHF =====
function formatPrice(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

// ===== Mise à jour totale =====
function updateTotal() {
    const total = config.modelPrice + config.color.price + config.wheels.price + config.interior.price + config.pack.price;
    totalPrice.textContent = formatPrice(total);
}

// ===== Changement de modèle =====
document.querySelectorAll('.model-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.model-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const model = tab.dataset.model;
        config.model = model;
        config.modelPrice = modelPrices[model];

        loadModel(model);  // ← ajoute juste cette ligne

        updateTotal();
    });
});

// ===== Couleur =====
document.querySelectorAll('.swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
        document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');

        const hex = swatch.dataset.color;
        const name = swatch.dataset.name;
        const price = parseInt(swatch.dataset.price);

        config.color = { name, hex, price };
        colorCurrent.textContent = name + (price > 0 ? ` (+ CHF ${formatPrice(price)})` : '');

        applyColor(hex);  // ← remplace tout le bloc carTint par ça

        updateTotal();
    });
});

// ===== Jantes =====
document.querySelectorAll('.wheel-opt').forEach(opt => {
    opt.addEventListener('click', () => {
        document.querySelectorAll('.wheel-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');

        const name = opt.dataset.name;
        const price = parseInt(opt.dataset.price);

        config.wheels = { name, price };
        wheelsCurrent.textContent = name + (price > 0 ? ` (+ CHF ${formatPrice(price)})` : '');

        updateTotal();
    });
});

// ===== Intérieur =====
document.querySelectorAll('.interior-opt').forEach(opt => {
    opt.addEventListener('click', () => {
        document.querySelectorAll('.interior-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');

        const name = opt.dataset.name;
        const price = parseInt(opt.dataset.price);

        config.interior = { name, price };
        interiorCurrent.textContent = name + (price > 0 ? ` (+ CHF ${formatPrice(price)})` : '');

        updateTotal();
    });
});

// ===== Pack =====
document.querySelectorAll('.pack-opt').forEach(opt => {
    opt.addEventListener('click', () => {
        document.querySelectorAll('.pack-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');

        const name = opt.dataset.name;
        const price = parseInt(opt.dataset.price);

        config.pack = { name, price };
        packCurrent.textContent = name + (price > 0 ? ` (+ CHF ${formatPrice(price)})` : '');

        updateTotal();
    });
});

// ===== Reset =====
document.getElementById('resetBtn').addEventListener('click', () => {
    document.querySelector('.model-tab[data-model="m2"]').click();
    document.querySelector('.swatch[data-name="Alpine White"]').click();
    document.querySelector('.wheel-opt[data-wheel="826"]').click();
    document.querySelector('.interior-opt[data-interior="black"]').click();
    document.querySelector('.pack-opt[data-pack="none"]').click();
});

// ===== Modal de validation =====
const modal = document.getElementById('modal');
const modalRecap = document.getElementById('modalRecap');
const modalModel = document.getElementById('modalModel');
const modalPrice = document.getElementById('modalPrice');

document.getElementById('validateBtn').addEventListener('click', () => {
    const total = config.modelPrice + config.color.price + config.wheels.price + config.interior.price + config.pack.price;

    modalModel.textContent = config.model.toUpperCase();
    modalPrice.textContent = formatPrice(total);

    modalRecap.innerHTML = `
        <div class="recap-line"><span>Modèle</span><span>BMW ${config.model.toUpperCase()} — CHF ${formatPrice(config.modelPrice)}</span></div>
        <div class="recap-line"><span>Couleur</span><span>${config.color.name}${config.color.price > 0 ? ' (+ CHF ' + formatPrice(config.color.price) + ')' : ''}</span></div>
        <div class="recap-line"><span>Jantes</span><span>${config.wheels.name}${config.wheels.price > 0 ? ' (+ CHF ' + formatPrice(config.wheels.price) + ')' : ''}</span></div>
        <div class="recap-line"><span>Intérieur</span><span>${config.interior.name}${config.interior.price > 0 ? ' (+ CHF ' + formatPrice(config.interior.price) + ')' : ''}</span></div>
        <div class="recap-line"><span>Pack</span><span>${config.pack.name}${config.pack.price > 0 ? ' (+ CHF ' + formatPrice(config.pack.price) + ')' : ''}</span></div>
    `;

    modal.classList.add('open');
});

document.getElementById('modalClose').addEventListener('click', () => modal.classList.remove('open'));
modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
});

// Init
updateTotal();
