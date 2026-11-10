import { XRDevice, metaQuest3 } from 'iwer';

/**
 * Desktop testing only: installs an emulated Quest 3 as `navigator.xr`, so
 * the game can enter VR in a normal browser. The device is exposed as
 * `window.xrDevice` so poses and buttons can be driven from the console or
 * from a script, e.g.
 *   xrDevice.position.set(0, 1.5, 1)
 *   xrDevice.controllers.right.position.set(0.3, 1.2, -0.4)
 *   xrDevice.controllers.right.updateButtonValue('trigger', 1)
 */
export function installEmulator(): void {
  const device = new XRDevice(metaQuest3, { stereoEnabled: false });
  device.installRuntime({ forceInstall: true });
  device.position.set(0, 1.6, 0);
  device.controllers.left?.position.set(-0.25, 1.2, -0.45);
  device.controllers.right?.position.set(0.25, 1.2, -0.45);
  (window as unknown as { xrDevice: XRDevice }).xrDevice = device;
}
