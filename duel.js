// ===== BMW M — Duel 400 m =====
(function () {
    const MODELS = {
        m2: { name: 'M2', zero100: 4.1, vmax: 285, body: '#7a7a7a' },
        m3: { name: 'M3', zero100: 3.9, vmax: 290, body: '#E52222' },
        m4: { name: 'M4', zero100: 3.9, vmax: 290, body: '#1C69D4' }
    };
    const DIST = 400;                 // mètres
    const X0 = 84, X1 = 932;          // ligne de départ / d'arrivée (svg)
    const REV_TOP = 7600, REV_BOTTOM = 2900;

    // ---------- Physique (même modèle que Launch Control) ----------
    function paramsFor(m) {
        const u = 1 - Math.sqrt(1 - 100 / m.vmax);
        return { T: m.zero100 / u, vmaxKmh: m.vmax, vmaxMs: m.vmax / 3.6 };
    }
    function vAt(t, p) {
        return t >= p.T ? p.vmaxKmh : p.vmaxKmh * (1 - Math.pow(1 - t / p.T, 2));
    }
    function sAt(t, p) {
        const T = p.T, tt = Math.min(Math.max(t, 0), T);
        const base = p.vmaxMs * (tt + (T / 3) * Math.pow(1 - tt / T, 3) - T / 3);
        return t <= T ? base : base + p.vmaxMs * (t - T);
    }
    function drivetrain(v, vmax) {
        const sc = vmax / 290;
        const tops = [62 * sc, 112 * sc, 162 * sc, 210 * sc, 252 * sc, vmax];
        let g = 0;
        while (g < tops.length - 1 && v > tops[g]) g++;
        const prev = g === 0 ? 0 : tops[g - 1];
        const frac = Math.max(0, Math.min(1, (v - prev) / ((tops[g] - prev) || 1)));
        return { gear: g + 1, rpm: REV_BOTTOM + frac * (REV_TOP - REV_BOTTOM) };
    }

    // ---------- DOM ----------
    const stage = document.getElementById('duelStage');
    const lamps = Array.from(document.querySelectorAll('#treeH .lamp'));
    const treeH = document.getElementById('treeH');
    const armBtn = document.getElementById('armBtn');
    const armLabel = document.getElementById('armLabel');
    const resetBtn = document.getElementById('resetDuel');
    const nameA = document.getElementById('nameA'), nameB = document.getElementById('nameB');
    const speedA = document.getElementById('speedA'), speedB = document.getElementById('speedB');
    const carA = document.getElementById('carA'), carB = document.getElementById('carB');
    const bodyA = document.getElementById('bodyA'), bodyB = document.getElementById('bodyB');
    const trailA = document.getElementById('trailA'), trailB = document.getElementById('trailB');
    const gapText = document.getElementById('gapText');
    const banner = document.getElementById('duelBanner');
    const verdict = document.getElementById('bannerVerdict');
    const detail = document.getElementById('bannerDetail');
    const falseStartEl = document.getElementById('falseStart');
    const reactionChip = document.getElementById('reactionChip');
    const reactionVal = document.getElementById('reactionVal');
    const finishLine = document.getElementById('finishLine');
    const photoFlash = document.getElementById('photoFlash');
    const stageHint = document.getElementById('stageHint');

    // ---------- État ----------
    let modelA = 'm3', modelB = 'm4';
    let state = 'idle';     // idle | staging | green | running | done
    let session = 0;
    let greenAt = 0;
    let raf = null;
    let flashed = false;

    const runner = (which) => ({
        which, started: false, t0: 0,
        finished: false, finishTime: null,
        v: 0, s: 0, gear: 1, params: null, engine: null
    });
    let A = runner('A'), B = runner('B');

    // ---------- Son ----------
    let soundOn = true;
    const engines = {};  // clé: modèle + rôle
    function loadEngine(model, role, volume, into) {
        const key = role + ':' + model;
        if (engines[key]) { into.engine = engines[key]; into.engine.setMuted(!soundOn); return; }
        window.MEngineAudio.forModel(model, { volume }).then(e => {
            engines[key] = e;
            e.setMuted(!soundOn);
            if (into.modelKey === model) into.engine = e;
        });
        into.modelKey = model;
    }

    document.getElementById('soundToggle').addEventListener('click', (e) => {
        soundOn = !soundOn;
        e.currentTarget.classList.toggle('is-on', soundOn);
        e.currentTarget.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
        Object.values(engines).forEach(en => en.setMuted(!soundOn));
    });

    // ---------- Affichage ----------
    function xFor(s) { return X0 + Math.min(s, DIST) / DIST * (X1 - X0); }

    function placeCar(carEl, x, laneY) {
        carEl.setAttribute('transform', `translate(${x.toFixed(1)},${laneY})`);
    }

    function drawTrail(g, x, laneY, vKmh) {
        if (vKmh < 30) { g.innerHTML = ''; return; }
        const len = Math.min(90, vKmh * 0.45);
        const op = Math.min(0.5, vKmh / 400);
        g.innerHTML =
            `<line x1="${x - 70}" y1="${laneY - 12}" x2="${x - 70 - len}" y2="${laneY - 12}" stroke="rgba(255,255,255,${op})" stroke-width="2"/>` +
            `<line x1="${x - 66}" y1="${laneY}" x2="${x - 66 - len * 1.2}" y2="${laneY}" stroke="rgba(255,255,255,${op * 0.8})" stroke-width="2"/>` +
            `<line x1="${x - 70}" y1="${laneY + 12}" x2="${x - 70 - len}" y2="${laneY + 12}" stroke="rgba(255,255,255,${op})" stroke-width="2"/>`;
    }

    function distanceMarks() {
        const g = document.getElementById('distMarks');
        let html = '';
        [100, 200, 300].forEach(d => {
            const x = xFor(d);
            html += `<line x1="${x}" y1="42" x2="${x}" y2="56" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>`;
            html += `<line x1="${x}" y1="244" x2="${x}" y2="258" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>`;
            if (d !== 200) html += `<text x="${x}" y="36" text-anchor="middle">${d} m</text>`;
        });
        g.innerHTML = html;
    }

    function clearLamps() {
        treeH.classList.remove('fault');
        lamps.forEach(l => l.classList.remove('on'));
    }

    function refreshNames() {
        nameA.textContent = MODELS[modelA].name;
        nameB.textContent = MODELS[modelB].name;
        bodyA.setAttribute('fill', MODELS[modelA].body);
        bodyB.setAttribute('fill', MODELS[modelB].body);
    }

    function resetVisual() {
        placeCar(carA, X0, 95);
        placeCar(carB, X0, 205);
        trailA.innerHTML = ''; trailB.innerHTML = '';
        speedA.textContent = '0'; speedB.textContent = '0';
        gapText.textContent = '';
        finishLine.textContent = '';
        banner.hidden = true;
        falseStartEl.hidden = true;
        reactionChip.hidden = true;
        reactionChip.classList.remove('good', 'mid', 'slow');
        stage.classList.remove('running');
        stageHint.hidden = false;
        clearLamps();
    }

    function fullReset() {
        session++;
        if (raf) cancelAnimationFrame(raf);
        state = 'idle';
        flashed = false;
        A = runner('A'); B = runner('B');
        Object.values(engines).forEach(en => en.stop());
        resetVisual();
        armBtn.disabled = false;
        armLabel.textContent = 'Armer le duel';
    }

    // ---------- Séquence ----------
    function arm() {
        if (state !== 'idle' && state !== 'done') return;
        fullReset();
        session++;
        const my = session;
        state = 'staging';
        armBtn.disabled = true;
        armLabel.textContent = 'Staging…';
        stageHint.hidden = true;

        A.params = paramsFor(MODELS[modelA]);
        B.params = paramsFor(MODELS[modelB]);
        loadEngine(modelA, 'player', 0.14, A);
        loadEngine(modelB, 'rival', 0.05, B);

        const ambers = lamps.slice(0, 3);
        ambers.forEach((l, i) => setTimeout(() => { if (my === session && state === 'staging') l.classList.add('on'); }, 600 * (i + 1)));

        // léger aléa sur le vert : impossible à anticiper
        const greenDelay = 600 * 3 + 350 + Math.random() * 500;
        setTimeout(() => {
            if (my !== session || state !== 'staging') return;
            state = 'green';
            greenAt = performance.now();
            lamps[3].classList.add('on');
            armLabel.textContent = 'GO !';
            // le rival réagit comme un (bon) humain
            const rivalReaction = 180 + Math.random() * 140;
            setTimeout(() => { if (my === session) startRunner(B, my); }, rivalReaction);
        }, greenDelay);
    }

    function startRunner(r, my) {
        if (my !== session || r.started) return;
        r.started = true;
        r.t0 = performance.now();
        if (r.engine) r.engine.start();
        state = 'running';
        stage.classList.add('running');
        if (!raf) raf = requestAnimationFrame(frame);
    }

    function playerInput() {
        const my = session;
        if (state === 'staging') {            // FAUX DÉPART
            session++;
            state = 'done';
            treeH.classList.add('fault');
            falseStartEl.hidden = false;
            window.MEngineAudio.beep({ freq: 95, dur: 0.45, vol: 0.2 });
            armBtn.disabled = false;
            armLabel.textContent = 'Réessayer';
            return;
        }
        if ((state === 'green' || state === 'running') && !A.started) {
            const reaction = (performance.now() - greenAt) / 1000;
            startRunner(A, my);
            reactionVal.textContent = reaction.toFixed(3) + ' s';
            reactionChip.hidden = false;
            reactionChip.classList.add(reaction < 0.22 ? 'good' : reaction < 0.35 ? 'mid' : 'slow');
        }
    }

    // ---------- Boucle ----------
    function stepRunner(r, now) {
        if (!r.started || r.finished) return;
        const t = Math.max(0, (now - r.t0) / 1000);
        r.v = vAt(t, r.params);
        r.s = sAt(t, r.params);
        const d = drivetrain(r.v, r.params.vmaxKmh);
        if (d.gear !== r.gear) {
            r.gear = d.gear;
            if (r.engine) r.engine.shiftCrackle();
        }
        if (r.engine) r.engine.setRpm(d.rpm);
        if (r.s >= DIST) {
            r.finished = true;
            const over = (r.s - DIST) / (r.v / 3.6);
            r.finishTime = t - over;
            if (r.engine) r.engine.stop();
            if (!flashed) {
                flashed = true;
                photoFlash.classList.remove('go');
                void photoFlash.offsetWidth;
                photoFlash.classList.add('go');
            }
        }
    }

    function frame() {
        const my = session;
        const now = performance.now();
        stepRunner(A, now);
        stepRunner(B, now);

        placeCar(carA, xFor(A.s), 95);
        placeCar(carB, xFor(B.s), 205);
        drawTrail(trailA, xFor(A.s), 95, A.finished ? 0 : A.v);
        drawTrail(trailB, xFor(B.s), 205, B.finished ? 0 : B.v);
        speedA.textContent = Math.round(A.v);
        speedB.textContent = Math.round(B.v);

        if (!A.finished || !B.finished) {
            if (A.started && B.started && !A.finished && !B.finished) {
                const lead = A.s - B.s;
                gapText.textContent = (lead >= 0 ? 'Vous +' : 'Rival +') + Math.abs(lead).toFixed(1) + ' m';
            }
            raf = requestAnimationFrame(() => { if (my === session) frame(); else raf = null; });
        } else {
            raf = null;
            finishDuel();
        }
    }

    function finishDuel() {
        state = 'done';
        stage.classList.remove('running');
        const win = A.finishTime <= B.finishTime;
        const gap = Math.abs(A.finishTime - B.finishTime);
        verdict.textContent = win ? 'VICTOIRE' : 'DÉFAITE';
        verdict.classList.toggle('win', win);
        verdict.classList.toggle('lose', !win);
        detail.textContent = win
            ? `Votre ${MODELS[modelA].name} coupe la ligne en ${A.finishTime.toFixed(2)} s — ${gap.toFixed(2)} s d'avance.`
            : `La ${MODELS[modelB].name} l'emporte en ${B.finishTime.toFixed(2)} s — vous concédez ${gap.toFixed(2)} s.`;
        finishLine.textContent = `400 m : vous ${A.finishTime.toFixed(2)} s · rival ${B.finishTime.toFixed(2)} s`;
        gapText.textContent = '';
        banner.hidden = false;
        armBtn.disabled = false;
        armLabel.textContent = 'Rejouer';
    }

    // ---------- Entrées ----------
    document.addEventListener('keydown', (e) => {
        if (e.code !== 'Space') return;
        if (state === 'staging' || state === 'green' || (state === 'running' && !A.started)) {
            e.preventDefault();
            playerInput();
        }
    });
    stage.addEventListener('pointerdown', () => {
        if (state === 'staging' || state === 'green' || (state === 'running' && !A.started)) playerInput();
    });

    armBtn.addEventListener('click', arm);
    resetBtn.addEventListener('click', fullReset);

    // ---------- Sélecteurs ----------
    function bindPicker(id, set) {
        document.querySelectorAll('#' + id + ' .pick-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('#' + id + ' .pick-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                set(tab.dataset.model);
                fullReset();
                refreshNames();
            });
        });
    }
    bindPicker('pickA', m => { modelA = m; });
    bindPicker('pickB', m => { modelB = m; });

    // ---------- Init ----------
    distanceMarks();
    refreshNames();
    resetVisual();
})();
