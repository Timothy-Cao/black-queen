// Web Audio OST: gapless looping tracks with crossfade between "scenes"
// (menu vs gameplay), sharing the SFX module's AudioContext so there is a
// single audio graph and one clean place to manage volume.
//
// Tracks are real assets the user drops into public/audio/. If a file is
// missing (not generated yet), loading fails silently and the game is simply
// music-less — never an error.

import { getSharedAudioContext } from "./sfx";

export type MusicScene = "menu" | "game" | null;

// Real Suno exports live in public/music/. URLs are pre-encoded (filenames have
// spaces). To swap tracks, just change these paths.
const TRACKS: Record<Exclude<MusicScene, null>, string> = {
  menu: "/music/Candlelit%20Card%20Room.mp3",
  game: "/music/Candlelit%20Cards.mp3",
};

const FADE = 1.2; // crossfade seconds

let musicVolume = 0.6;
let masterMusicGain: GainNode | null = null;
let currentScene: MusicScene = null;

// url -> decoded buffer, or sentinel states
const buffers: Record<string, AudioBuffer | "loading" | "failed" | undefined> = {};

interface Voice { src: AudioBufferSourceNode; gain: GainNode; }
const voices: Partial<Record<Exclude<MusicScene, null>, Voice>> = {};

function ensureMaster(ctx: AudioContext): GainNode {
  if (!masterMusicGain) {
    masterMusicGain = ctx.createGain();
    masterMusicGain.gain.value = musicVolume;
    masterMusicGain.connect(ctx.destination);
  }
  return masterMusicGain;
}

async function loadBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  const cached = buffers[url];
  if (cached instanceof AudioBuffer) return cached;
  if (cached === "failed") return null;
  if (cached === "loading") return null;
  buffers[url] = "loading";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const arr = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr);
    buffers[url] = buf;
    return buf;
  } catch {
    buffers[url] = "failed"; // file not present yet → stay silent
    return null;
  }
}

export function setMusicVolume(v: number) {
  musicVolume = Math.max(0, Math.min(1, v));
  if (masterMusicGain) masterMusicGain.gain.value = musicVolume;
}
export function getMusicVolume() { return musicVolume; }

/**
 * Crossfade to the given scene's loop. Passing null fades music out.
 * Safe to call repeatedly; a no-op if already on that scene.
 */
export async function playScene(scene: MusicScene) {
  if (scene === currentScene) return;
  const prev = currentScene;
  currentScene = scene;

  const ctx = getSharedAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* ignore */ } }
  const master = ensureMaster(ctx);

  // Fade out the previous voice and retire it.
  if (prev && voices[prev]) {
    const v = voices[prev]!;
    const now = ctx.currentTime;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(v.gain.gain.value, now);
    v.gain.gain.linearRampToValueAtTime(0, now + FADE);
    const dying = v.src;
    window.setTimeout(() => { try { dying.stop(); } catch { /* ignore */ } }, FADE * 1000 + 100);
    delete voices[prev];
  }

  if (!scene) return;

  const buf = await loadBuffer(ctx, TRACKS[scene]);
  if (!buf) return;                    // missing/decoding-failed → silent
  if (currentScene !== scene) return;  // scene changed while we were loading

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(g).connect(master);
  src.start();
  const now = ctx.currentTime;
  g.gain.linearRampToValueAtTime(1, now + FADE); // voice gain is relative to master
  voices[scene] = { src, gain: g };
}

/** Briefly dip the music under a fanfare/stinger, then restore. */
export function duckMusic(durationMs = 1800, depth = 0.35) {
  const ctx = getSharedAudioContext();
  if (!ctx || !masterMusicGain) return;
  const g = masterMusicGain.gain;
  const now = ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(musicVolume * depth, now + 0.12);
  g.linearRampToValueAtTime(musicVolume, now + durationMs / 1000);
}

export function stopMusic() { void playScene(null); }

/** Resume the audio context after a user gesture (browsers block autoplay until then). */
export async function resumeAudio() {
  const ctx = getSharedAudioContext();
  if (ctx && ctx.state === "suspended") {
    try { await ctx.resume(); } catch { /* ignore */ }
  }
}
