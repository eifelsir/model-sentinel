const { contextBridge, ipcRenderer } = require('electron');

const invoke = (name, ...args) => ipcRenderer.invoke(`sentinel:${name}`, ...args).then(result => {
  if (!result.ok) throw new Error(result.error);
  return result.value;
});
contextBridge.exposeInMainWorld('sentinel', {
  getState: () => invoke('getState'),
  saveConfig: config => invoke('saveConfig', config),
  listModels: connection => invoke('listModels', connection),
  run: ids => invoke('run', ids),
  stop: id => invoke('stop', id),
  setAuto: enabled => invoke('setAuto', enabled),
  setFloatVisible: visible => invoke('setFloatVisible', visible),
  expandFloat: expanded => invoke('expandFloat', expanded),
  openMain: roundId => invoke('openMain', roundId),
  exportData: () => invoke('exportData'),
  htmlThumbnail: (roundId, index) => invoke('htmlThumbnail', roundId, index),
  openHtml: (roundId, index) => invoke('openHtml', roundId, index),
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('sentinel:state', listener);
    return () => ipcRenderer.removeListener('sentinel:state', listener);
  },
});
