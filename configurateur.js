import { loadModel, applyColor, applyWheelColor, applyPack, applyInterior, focusInterior } from './three-viewer.js';


const config = {
    model: 'm2',
    modelPrice: 89900,
    color: { name: 'Alpine White', hex: '#f5f5f5', price: 0 },
    wheels: { name: 'Style 826 M — 19"', price: 0 },
    interior: { name: 'Noir', price: 0 },
    pack: { name: 'Aucun', price: 0 }
};

const modelPrices = { m2: 89900, m3: 112500, m4: 118900 };

const totalPrice = document.getElementById('totalPrice');
const colorCurrent = document.getElementById('colorCurrent');
const wheelsCurrent = document.getElementById('wheelsCurrent');
const interiorCurrent = document.getElementById('interiorCurrent');
const packCurrent = document.getElementById('packCurrent');

// Couleur des jantes par style
const wheelColors = {
    '826': '#cccccc',   // argent
    '827': '#aaaaaa',   // argent foncé
    '828': '#222222',   // noir
    '829': '#0a0a0a'    // carbone noir
};

function formatPrice(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

function updateTotal() {
    const total = config.modelPrice + config.color.price + config.wheels.price + config.interior.price + config.pack.price;
    totalPrice.textContent = formatPrice(total);
}

// Modèle
document.querySelectorAll('.model-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.model-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const model = tab.dataset.model;
        config.model = model;
        config.modelPrice = modelPrices[model];

        document.getElementById('carModelName').textContent = model.toUpperCase();
        loadModel(model);
        updateTotal();
    });
});

// Couleur carrosserie
document.querySelectorAll('.swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
        document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');

        const hex = swatch.dataset.color;
        const name = swatch.dataset.name;
        const price = parseInt(swatch.dataset.price);

        config.color = { name, hex, price };
        colorCurrent.textContent = name + (price > 0 ? ` (+ CHF ${formatPrice(price)})` : '');

        applyColor(hex);
        focusInterior(false);
        updateTotal();
    });
});

// Jantes
document.querySelectorAll('.wheel-opt').forEach(opt => {
    opt.addEventListener('click', () => {
        document.querySelectorAll('.wheel-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');

        const wheel = opt.dataset.wheel;
        const name = opt.dataset.name;
        const price = parseInt(opt.dataset.price);

        config.wheels = { name, price };
        wheelsCurrent.textContent = name + (price > 0 ? ` (+ CHF ${formatPrice(price)})` : '');

        // Change la couleur des jantes sur le modèle 3D
        const color = wheelColors[wheel] || '#cccccc';
        applyWheelColor(color);
        focusInterior(false);
        updateTotal();
    });
});

// Intérieur
document.querySelectorAll('.interior-opt').forEach(opt => {
    opt.addEventListener('click', () => {
        document.querySelectorAll('.interior-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');

        const interior = opt.dataset.interior;
        const name = opt.dataset.name;
        const price = parseInt(opt.dataset.price);

        config.interior = { name, price };
        interiorCurrent.textContent = name + (price > 0 ? ` (+ CHF ${formatPrice(price)})` : '');

        applyInterior(interior);
        focusInterior(true);   // ← zoom + éclaire
        updateTotal();
    });
});

// Pack
document.querySelectorAll('.pack-opt').forEach(opt => {
    opt.addEventListener('click', () => {
        document.querySelectorAll('.pack-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');

        const pack = opt.dataset.pack;
        const name = opt.dataset.name;
        const price = parseInt(opt.dataset.price);

        config.pack = { name, price };
        packCurrent.textContent = name + (price > 0 ? ` (+ CHF ${formatPrice(price)})` : '');

        applyPack(pack);  // ← ajoute ça
        focusInterior(false);
        updateTotal();
    });
});

// Reset
document.getElementById('resetBtn').addEventListener('click', () => {
    document.querySelector('.model-tab[data-model="m2"]').click();
    document.querySelector('.swatch[data-name="Alpine White"]').click();
    document.querySelector('.wheel-opt[data-wheel="826"]').click();
    document.querySelector('.interior-opt[data-interior="black"]').click();
    document.querySelector('.pack-opt[data-pack="none"]').click();
});

// Modal
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
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

updateTotal();

// Modèle initial : lu depuis l'URL (?model=m2|m3|m4), sinon M2.
// Placé ici, APRÈS l'enregistrement des gestionnaires de clic, pour que le clic déclenche bien loadModel().
const urlParams = new URLSearchParams(window.location.search);
const requestedModel = urlParams.get('model');
const initialModel = ['m2', 'm3', 'm4'].includes(requestedModel) ? requestedModel : 'm2';
document.querySelector(`.model-tab[data-model="${initialModel}"]`).click();
