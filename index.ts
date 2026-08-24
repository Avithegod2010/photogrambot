import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

if (Platform.OS === 'android') {
  import('react-native-android-widget')
    .then(({ registerWidgetTaskHandler }) => {
      import('./widget-task-handler').then(({ widgetTaskHandler }) => {
        registerWidgetTaskHandler(widgetTaskHandler);
      });
    })
    .catch(() => {
      // react-native-android-widget native module not available (e.g. Expo Go)
    });
}
