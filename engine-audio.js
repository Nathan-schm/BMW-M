// ===== BMW M — Moteur audio partagé =====
// 1) Si un fichier media/audio/<modele>.mp3 (ou .wav) existe : il est utilisé
//    (boucle moteur enregistrée à régime stable ~4000 tr/min, pitch calé sur le régime).
// 2) Sinon : synthèse procédurale d'un 6-en-ligne (ordres moteur 0.5 / 1 / 1.5 / 3 / 4.5,
//    distorsion tanh, filtre qui s'ouvre avec le régime, souffle d'admission).
window.MEngineAudio = (function () {
    let ctx = null;
    function getCtx() {
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            ctx = new AC();
        }
        return ctx;
    }

    function noiseBuffer(c) {
        const len = c.sampleRate;
        const b = c.createBuffer(1, len, c.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        return b;
    }

    // ---------- Synthèse 6-en-ligne ----------
    function createSynthEngine(opts) {
        const c = getCtx();
        const vol = (opts && opts.volume != null) ? opts.volume : 0.14;

        const out = c.createGain(); out.gain.value = 0; out.connect(c.destination);

        // Distorsion douce -> corps -> présence
        const shaper = c.createWaveShaper();
        const N = 1024, curve = new Float32Array(N);
        for (let i = 0; i < N; i++) {
            const x = (i / (N - 1)) * 2 - 1;
            curve[i] = Math.tanh(2.6 * x);
        }
        shaper.curve = curve;

        const body = c.createBiquadFilter();
        body.type = 'lowpass'; body.frequency.value = 860; body.Q.value = 0.9;

        const presence = c.createBiquadFilter();
        presence.type = 'peaking'; presence.frequency.value = 1300;
        presence.gain.value = 5; presence.Q.value = 1.1;

        shaper.connect(body); body.connect(presence); presence.connect(out);

        const pre = c.createGain(); pre.gain.value = 0.55; pre.connect(shaper);

        // Ordres moteur (I6 4 temps : allumage dominant = ordre 3)
        const ORDERS = [
            { mult: 0.5, type: 'sawtooth', g: 0.22 },
            { mult: 1.0, type: 'sawtooth', g: 0.34 },
            { mult: 1.5, type: 'square',   g: 0.16 },
            { mult: 3.0, type: 'sawtooth', g: 0.52 },
            { mult: 4.5, type: 'sawtooth', g: 0.12 }
        ];
        const oscs = ORDERS.map(o => {
            const osc = c.createOscillator(); osc.type = o.type;
            const g = c.createGain(); g.gain.value = o.g;
            osc.connect(g); g.connect(pre); osc.start();
            return { osc, mult: o.mult };
        });

        // Souffle admission / échappement
        const noise = c.createBufferSource();
        noise.buffer = noiseBuffer(c); noise.loop = true;
        const nf = c.createBiquadFilter(); nf.type = 'bandpass';
        nf.frequency.value = 900; nf.Q.value = 0.7;
        const ng = c.createGain(); ng.gain.value = 0;
        noise.connect(nf); nf.connect(ng); ng.connect(shaper); noise.start();

        let muted = false, running = false;

        function applyGain() {
            out.gain.setTargetAtTime((muted || !running) ? 0 : vol, c.currentTime, 0.06);
        }

        return {
            setRpm(rpm) {
                const rotHz = rpm / 60;
                const t = c.currentTime;
                oscs.forEach(o => o.osc.frequency.setTargetAtTime(Math.max(rotHz * o.mult, 4), t, 0.02));
                body.frequency.setTargetAtTime(500 + (rpm / 8000) * 3200, t, 0.04);
                ng.gain.setTargetAtTime(0.03 + (rpm / 8000) * 0.24, t, 0.05);
            },
            start() {
                if (c.state === 'suspended') c.resume();
                running = true; applyGain();
            },
            stop() { running = false; applyGain(); },
            setMuted(m) { muted = m; applyGain(); },
            shiftCrackle() {
                if (muted || !running) return;
                const t = c.currentTime;
                // Coupure d'injection : creux de volume + burst d'échappement
                out.gain.cancelScheduledValues(t);
                out.gain.setValueAtTime(out.gain.value, t);
                out.gain.linearRampToValueAtTime(vol * 0.22, t + 0.035);
                out.gain.linearRampToValueAtTime(vol, t + 0.13);
                const burst = c.createBufferSource(); burst.buffer = noiseBuffer(c);
                const bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1500; bf.Q.value = 1.4;
                const bg = c.createGain();
                bg.gain.setValueAtTime(muted ? 0 : 0.16, t);
                bg.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
                burst.connect(bf); bf.connect(bg); bg.connect(c.destination);
                burst.start(t); burst.stop(t + 0.16);
            }
        };
    }

    // ---------- Boucle enregistrée (vrais sons en drop-in) ----------
    function createSampleEngine(buffer, opts) {
        const c = getCtx();
        const vol = (opts && opts.volume != null) ? opts.volume : 0.5;
        const baseRpm = (opts && opts.baseRpm) || 4000;
        const src = c.createBufferSource();
        src.buffer = buffer; src.loop = true;
        const g = c.createGain(); g.gain.value = 0;
        src.connect(g); g.connect(c.destination); src.start();
        let muted = false, running = false;
        function applyGain() {
            g.gain.setTargetAtTime((muted || !running) ? 0 : vol, c.currentTime, 0.07);
        }
        return {
            setRpm(rpm) {
                const rate = Math.min(Math.max(rpm / baseRpm, 0.35), 2.4);
                src.playbackRate.setTargetAtTime(rate, c.currentTime, 0.03);
            },
            start() { if (c.state === 'suspended') c.resume(); running = true; applyGain(); },
            stop() { running = false; applyGain(); },
            setMuted(m) { muted = m; applyGain(); },
            shiftCrackle() {
                const t = c.currentTime;
                const cur = src.playbackRate.value;
                src.playbackRate.cancelScheduledValues(t);
                src.playbackRate.setValueAtTime(cur, t);
                src.playbackRate.linearRampToValueAtTime(cur * 0.85, t + 0.05);
                src.playbackRate.linearRampToValueAtTime(cur, t + 0.14);
            }
        };
    }

    async function tryLoad(url) {
        try {
            const r = await fetch(url);
            if (!r.ok) return null;
            const ab = await r.arrayBuffer();
            return await getCtx().decodeAudioData(ab);
        } catch (e) { return null; }
    }

    async function forModel(model, opts) {
        const buf = await tryLoad(`media/audio/${model}.mp3`)
                 || await tryLoad(`media/audio/${model}.wav`);
        if (buf) return createSampleEngine(buf, opts);
        return createSynthEngine(opts);
    }

    // Petit bip utilitaire (faux départ, etc.)
    function beep(o) {
        const c = getCtx();
        if (c.state === 'suspended') c.resume();
        const osc = c.createOscillator();
        osc.type = (o && o.type) || 'square';
        osc.frequency.value = (o && o.freq) || 110;
        const g = c.createGain();
        const vol = (o && o.vol) || 0.18, dur = (o && o.dur) || 0.3;
        g.gain.setValueAtTime(vol, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
        osc.connect(g); g.connect(c.destination);
        osc.start(); osc.stop(c.currentTime + dur + 0.02);
    }

    return { forModel, beep };
})();
