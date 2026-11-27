'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dock', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (patch) => ipcRenderer.invoke('config:save', patch),
  saveNotes: (notes) => ipcRenderer.invoke('notes:save', notes),
  getData: (id) => ipcRenderer.invoke('data:get', id),
  media: (action) => ipcRenderer.invoke('media:control', action),
  timer: (command, minutes) => ipcRenderer.invoke('timer:command', command, minutes),
  launch: (index) => ipcRenderer.invoke('app:launch', index),
  open: (id, x) => ipcRenderer.send('popover:open', id, x),
  close: () => ipcRenderer.send('popover:close'),
  menu: () => ipcRenderer.send('menu:show'),
  onConfig: (fn) => ipcRenderer.on('config:changed', (_e, c) => fn(c))
});
