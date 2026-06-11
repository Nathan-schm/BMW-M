// ===== BMW M — Launch Control =====
(function () {
    const MODELS = {
        m2: { name: 'M2', power: 460, zero100: 4.1, vmax: 285 },
        m3: { name: 'M3', power: 510, zero100: 3.9, vmax: 290 },
        m4: { name: 'M4', power: 510, zero100: 3.9, vmax: 290 }
    };

    // Gauge geometry
    const CX = 160, CY = 160, R = 120, START = 225, SWEEP = 270;
    const TACH_MAX = 8000, REDLINE = 7000, IDLE_RPM = 900, REV_TOP = 7600, REV_BOTTOM = 2900;

    let current = 'm2';
    let session = 0;        // invalidates any in-flight run/staging
    let raf = null;

    // ---------- SVG helpers ----------
    function polar(cx, cy, r, deg) {
        const a = (deg - 90) * Math.PI / 180;
        return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    }
    function arcPath(cx, cy, r, a0, a1) {
        if (a1 - a0 < 0.01) return '';
        const s = polar(cx, cy, r, a0), e = polar(cx, cy, r, a1);
        const large = (a1 - a0) % 360 > 180 ? 1 : 0;
        return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
    }
    function angleFor(v, max) { return START + (Math.min(Math.max(v, 0), max) / max) * SWEEP; }

    function buildGauge(prefix, max, step, redlineFrom, divisor) {
        document.getElementById(prefix + 'Track').setAttribute('d', arcPath(CX, CY, R, START, START + SWEEP));
        const ticks = document.getElementById(prefix + 'Ticks');
        const labels = document.getElementById(prefix + 'Labels');
        ticks.innerHTML = '';
        labels.innerHTML = '';
        for (let val = 0; val <= max + 0.001; val += step) {
            const a = angleFor(val, max);
            const o = polar(CX, CY, R, a), i = polar(CX, CY, R - 15, a);
            const red = redlineFrom != null && val >= redlineFrom;
            ticks.insertAdjacentHTML('beforeend',
                `<line x1="${o.x.toFixed(1)}" y1="${o.y.toFixed(1)}" x2="${i.x.toFixed(1)}" y2="${i.y.toFixed(1)}" class="tick${red ? ' tick-red' : ''}"/>`);
            const lp = polar(CX, CY, R - 30, a);
            const label = divisor ? (val / divisor) : val;
            labels.insertAdjacentHTML('beforeend',
                `<text x="${lp.x.toFixed(1)}" y="${(lp.y + 4).toFixed(1)}" class="gtick-label${red ? ' red' : ''}">${label}</text>`);
        }
        const rl = document.getElementById(prefix + 'Redline');
        rl.setAttribute('d', redlineFrom != null ? arcPath(CX, CY, R, angleFor(redlineFrom, max), START + SWEEP) : '');
    }

    function setGauge(prefix, value, max, bigText) {
        const a = angleFor(value, max);
        document.getElementById(prefix + 'Fill').setAttribute('d', arcPath(CX, CY, R, START, a));
        document.getElementById(prefix + 'Needle').setAttribute('transform', `rotate(${a.toFixed(2)} ${CX} ${CY})`);
        document.getElementById(prefix + 'Big').textContent = bigText;
    }

    // ---------- Drivetrain model (gear + rpm from speed) ----------
    function drivetrain(v, vmax) {
        const sc = vmax / 290;
        const tops = [62 * sc, 112 * sc, 162 * sc, 210 * sc, 252 * sc, vmax];
        let g = 0;
        while (g < tops.length - 1 && v > tops[g]) g++;
        const prev = g === 0 ? 0 : tops[g - 1];
        const span = (tops[g] - prev) || 1;
        const frac = Math.max(0, Math.min(1, (v - prev) / span));
        const rpm = REV_BOTTOM + frac * (REV_TOP - REV_BOTTOM);
        return { gear: g + 1, rpm };
    }

    // ---------- DOM refs ----------
    const launchBtn = document.getElementById('launchBtn');
    const launchLabel = document.getElementById('launchLabel');
    const resetBtn = document.getElementById('resetBtn');
    const gearNum = document.getElementById('gearNum');
    const chrono = document.getElementById('chrono');
    const lamps = Array.from(document.querySelectorAll('#tree .lamp'));
    const r100 = document.getElementById('r100'), r200 = document.getElementById('r200');
    const r400 = document.getElementById('r400'), rvmax = document.getElementById('rvmax');
    const bestModel = document.getElementById('bestModel'), bestTime = document.getElementById('bestTime');

    function flash(id) {
        const card = document.getElementById(id);
        card.classList.remove('pop');
        void card.offsetWidth;
        card.classList.add('pop');
    }

    function clearLamps() { lamps.forEach(l => l.classList.remove('on')); }

    function resetResults() {
        r100.textContent = '—'; r200.textContent = '—';
        r400.textContent = '—'; rvmax.textContent = '—';
    }

    function idleCluster() {
        const m = MODELS[current];
        setGauge('tach', IDLE_RPM, TACH_MAX, IDLE_RPM);
        setGauge('speed', 0, m.vmax, '0');
        gearNum.textContent = 'N';
        chrono.textContent = '0.00';
    }

    // ---------- Best time (per model) ----------
    function bestKey(model) { return 'mPerfBest_' + model; }
    const memBest = {};
    function getBest(model) {
        try { const v = localStorage.getItem(bestKey(model)); if (v) return parseFloat(v); } catch (e) {}
        return memBest[model] != null ? memBest[model] : null;
    }
    function saveBest(model, time) {
        const prev = getBest(model);
        if (prev == null || time < prev) {
            memBest[model] = time;
            try { localStorage.setItem(bestKey(model), time.toFixed(2)); } catch (e) {}
        }
    }
    function showBest() {
        bestModel.textContent = MODELS[current].name;
        const b = getBest(current);
        bestTime.textContent = b != null ? b.toFixed(2) + ' s' : '—';
    }

    // ---------- Son moteur (engine-audio.js : vrais fichiers si présents, sinon synthèse I6) ----------
    let soundOn = true;
    const engines = {};
    let engine = null;
    let engineWanted = false;

    function ensureEngine() {
        const key = current;
        if (engines[key]) {
            engine = engines[key];
            engine.setMuted(!soundOn);
            if (engineWanted) engine.start();
            return;
        }
        engine = null;
        window.MEngineAudio.forModel(key, { volume: 0.14 }).then(e => {
            engines[key] = e;
            if (current === key) {
                engine = e;
                e.setMuted(!soundOn);
                if (engineWanted) e.start();
            }
        });
    }
    function engineOn() { engineWanted = true; ensureEngine(); if (engine) engine.start(); }
    function engineUpdate(rpm) { if (engine) engine.setRpm(rpm); }
    function engineOff() { engineWanted = false; if (engine) engine.stop(); }

    // ---------- Staging tree then run ----------
    function arm() {
        if (launchBtn.disabled) return;
        session++;
        const my = session;
        launchBtn.disabled = true;
        resetBtn.disabled = false;
        resetResults();
        clearLamps();
        idleCluster();
        launchLabel.textContent = 'Staging…';

        const ambers = lamps.slice(0, 3);
        let i = 0;
        (function step() {
            if (my !== session) return;
            if (i < ambers.length) {
                ambers[i].classList.add('on');
                i++;
                setTimeout(step, 600);
            } else {
                lamps[3].classList.add('on');
                launchLabel.textContent = 'Run en cours…';
                run(my);
            }
        })();
    }

    function run(my) {
        const m = MODELS[current];
        const vmax = m.vmax;
        // Parabolic accel curve: hits rated 0-100 time, slope -> 0 exactly at vmax (time T).
        const u = 1 - Math.sqrt(1 - 100 / vmax);
        const T = m.zero100 / u;
        const t0 = performance.now();
        let last = t0, dist = 0, topV = 0, lastGear = 1;
        let hit100 = false, hit200 = false, hit400 = false;
        engineOn();

        function frame(now) {
            if (my !== session) return;
            const t = (now - t0) / 1000;
            const v = t >= T ? vmax : vmax * (1 - Math.pow(1 - t / T, 2));
            const dt = Math.min((now - last) / 1000, 0.1); last = now;
            dist += (v / 3.6) * dt;
            if (v > topV) topV = v;

            if (!hit100 && v >= 100) { hit100 = true; r100.textContent = t.toFixed(2) + ' s'; flash('card100'); }
            if (!hit200 && v >= 200) { hit200 = true; r200.textContent = t.toFixed(2) + ' s'; flash('card200'); }
            if (!hit400 && dist >= 400) { hit400 = true; r400.textContent = t.toFixed(2) + ' s'; flash('card400'); }

            const d = drivetrain(v, vmax);
            if (d.gear !== lastGear) {
                if (engine) engine.shiftCrackle();
                lastGear = d.gear;
            }
            setGauge('tach', d.rpm, TACH_MAX, Math.round(d.rpm));
            setGauge('speed', v, vmax, Math.round(v));
            gearNum.textContent = d.gear;
            chrono.textContent = t.toFixed(2);
            rvmax.textContent = Math.round(topV) + ' km/h';
            engineUpdate(d.rpm);

            if (t >= T) { finish(my, vmax, hit100 ? t : null); return; }
            raf = requestAnimationFrame(frame);
        }
        raf = requestAnimationFrame(frame);
    }

    function finish(my, topV, t100) {
        if (my !== session) return;
        engineOff();
        rvmax.textContent = Math.round(topV) + ' km/h';
        flash('cardVmax');
        if (t100 != null) { saveBest(current, t100); showBest(); }
        launchLabel.textContent = 'Rejouer';
        launchBtn.disabled = false;
    }

    function reset() {
        session++;                 // cancels staging/run
        if (raf) cancelAnimationFrame(raf);
        engineOff();
        clearLamps();
        resetResults();
        idleCluster();
        launchLabel.textContent = 'Armer le départ';
        launchBtn.disabled = false;
    }

    // ---------- Model switch ----------
    document.querySelectorAll('.perf-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.perf-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            current = tab.dataset.model;
            reset();
            buildGauge('speed', MODELS[current].vmax, 50, null, null);
            idleCluster();
            showBest();
        });
    });

    // ---------- Sound toggle ----------
    document.getElementById('soundToggle').addEventListener('click', (e) => {
        soundOn = !soundOn;
        e.currentTarget.classList.toggle('is-on', soundOn);
        e.currentTarget.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
        Object.values(engines).forEach(en => en.setMuted(!soundOn));
    });

    launchBtn.addEventListener('click', arm);
    resetBtn.addEventListener('click', reset);

    // ---------- Init ----------
    buildGauge('tach', TACH_MAX, 1000, REDLINE, 1000);
    buildGauge('speed', MODELS[current].vmax, 50, null, null);
    idleCluster();
    showBest();
})();
