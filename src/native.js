import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

window.NativeAPI = {
  isNative: Capacitor.isNativePlatform(),
  LocalNotifications,
  App,
  Filesystem,
  Directory,
  Encoding,
  Share,
};
