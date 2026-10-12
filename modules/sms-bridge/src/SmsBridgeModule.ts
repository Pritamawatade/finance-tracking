import { NativeModule, requireNativeModule } from 'expo';

declare class SmsBridgeModule extends NativeModule<{}> {}

export default requireNativeModule<SmsBridgeModule>('SmsBridge');
