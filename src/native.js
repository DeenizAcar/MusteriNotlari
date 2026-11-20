import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';

window.NativeAPI = {
  isNative: Capacitor.isNativePlatform(),
  LocalNotifications,
  App,
};
