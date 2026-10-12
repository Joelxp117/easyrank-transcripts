(function () {
  "use strict";

  const entry      = document.getElementById("entry");
  const enterBtn   = document.getElementById("enterBtn");
  const batsLayer  = document.getElementById("bats");

  let audioCtx = null;
  let masterBus = null;

  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterBus = audioCtx.createGain();
      masterBus.gain.value = 0.85;
      masterBus.connect(audioCtx.destination);
    } catch (e) {
      console.warn("AudioContext unavailable", e);
    }
  }

  function startAmbientDrone() {
    if (!audioCtx || !masterBus) return;
    const now = audioCtx.currentTime;

    const drone = audioCtx.createOscillator();
    const droneGain = audioCtx.createGain();
    drone.type = "sine";
    drone.frequency.value = 55;
    droneGain.gain.setValueAtTime(0.0001, now);
    droneGain.gain.linearRampToValueAtTime(0.035, now + 3);

    const drone2 = audioCtx.createOscillator();
    drone2.type = "sine";
    drone2.frequency.value = 58.3;

    const drone3 = audioCtx.createOscillator();
    drone3.type = "triangle";
    drone3.frequency.value = 110;
    const drone3Gain = audioCtx.createGain();
    drone3Gain.gain.value = 0.012;

    drone.connect(droneGain);
    drone2.connect(droneGain);
    drone3.connect(drone3Gain).connect(masterBus);
    droneGain.connect(masterBus);

    drone.start(now);
    drone2.start(now);
    drone3.start(now);

    setInterval(() => {
      if (!audioCtx) return;
      const t = audioCtx.currentTime;
      droneGain.gain.linearRampToValueAtTime(
        0.02 + Math.random() * 0.03,
        t + 3
      );
    }, 4000);
  }

  function spawnBats(count) {
    if (!batsLayer) return;
    const emojis = ["🦇", "🦇", "🦇", "🕸️", "🕷️"];
    for (let i = 0; i < count; i++) {
      const bat = document.createElement("div");
      bat.className = "bat";
      bat.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      bat.style.top = (Math.random() * 80) + "vh";
      bat.style.fontSize = (18 + Math.random() * 22) + "px";
      const dur = 12 + Math.random() * 14;
      bat.style.animationDuration = dur + "s";
      bat.style.animationDelay = (-Math.random() * dur) + "s";
      batsLayer.appendChild(bat);
    }
  }

  function enterSite() {
    initAudio();
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    startAmbientDrone();

    entry.classList.add("hidden");

    setTimeout(() => {
      document.body.animate(
        [
          { transform: "translate(0,0)" },
          { transform: "translate(-4px, 3px)" },
          { transform: "translate(3px, -3px)" },
          { transform: "translate(0,0)" }
        ],
        { duration: 260, easing: "ease-out" }
      );
    }, 400);
  }

  enterBtn.addEventListener("click", enterSite, { once: true });

  spawnBats(14);

  document.addEventListener(
    "click",
    () => {
      initAudio();
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    },
    { once: true }
  );

})();