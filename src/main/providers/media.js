'use strict';
const { run, powershell } = require('../exec');
const win = process.platform === 'win32';

const WIN_NOW_PLAYING = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(4000) | Out-Null; $t.Result }
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$s = $mgr.GetCurrentSession()
if ($s) {
  $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  @{ status = "$($s.GetPlaybackInfo().PlaybackStatus)"; artist = $p.Artist; title = $p.Title } | ConvertTo-Json -Compress
}
`;

// Windows virtual-key codes for the keyboard media keys.
const KEYS = { 'play-pause': 0xb3, next: 0xb0, previous: 0xb1, mute: 0xad, 'volume-down': 0xae, 'volume-up': 0xaf };

function pressKey(code) {
  return powershell(`$t = Add-Type -PassThru -Name K -Namespace W -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, System.UIntPtr e);'
$t::keybd_event(${code},0,1,[UIntPtr]::Zero); $t::keybd_event(${code},0,3,[UIntPtr]::Zero)`);
}

function parsePlayerctl(stdout) {
  const [status = '', artist = '', title = ''] = stdout.replace(/\n$/, '').split('\t');
  return { status, artist, title };
}

async function media() {
  if (win) {
    const out = (await powershell(WIN_NOW_PLAYING)).trim();
    return out ? JSON.parse(out) : { status: 'Stopped', artist: '', title: '' };
  }
  try {
    return parsePlayerctl(await run('playerctl', ['metadata', '--format', '{{status}}\t{{artist}}\t{{title}}']));
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error('Install playerctl to see media');
    return { status: 'Stopped', artist: '', title: '' };
  }
}

function parseWpctl(stdout) {
  const m = stdout.match(/Volume:\s*([\d.]+)/);
  return m ? { percent: Math.round(Number(m[1]) * 100), muted: stdout.includes('[MUTED]') } : null;
}

async function volume() {
  // Windows has no built-in command to read the level; the buttons still work.
  if (win) return { percent: null, muted: false };
  try {
    const v = parseWpctl(await run('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@']));
    if (v) return v;
  } catch { /* fall back to PulseAudio tools */ }
  try {
    const level = await run('pactl', ['get-sink-volume', '@DEFAULT_SINK@']);
    const mute = await run('pactl', ['get-sink-mute', '@DEFAULT_SINK@']);
    return { percent: Number(level.match(/(\d+)%/)?.[1] ?? 0), muted: /yes/.test(mute) };
  } catch {
    throw new Error('No audio control found (needs wpctl or pactl)');
  }
}

async function control(action) {
  if (!Object.hasOwn(KEYS, action)) throw new Error('Unknown media action');
  if (win) return pressKey(KEYS[action]);
  if (!action.startsWith('volume') && action !== 'mute') return run('playerctl', [action]);
  const step = action === 'volume-up' ? '+' : '-';
  try {
    return await (action === 'mute'
      ? run('wpctl', ['set-mute', '@DEFAULT_AUDIO_SINK@', 'toggle'])
      : run('wpctl', ['set-volume', '-l', '1.0', '@DEFAULT_AUDIO_SINK@', `5%${step}`]));
  } catch {
    return action === 'mute'
      ? run('pactl', ['set-sink-mute', '@DEFAULT_SINK@', 'toggle'])
      : run('pactl', ['set-sink-volume', '@DEFAULT_SINK@', `${step}5%`]);
  }
}

module.exports = { media, volume, control, parsePlayerctl, parseWpctl };
