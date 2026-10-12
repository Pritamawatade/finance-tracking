import { registerWebModule, NativeModule } from 'expo';

class SmsBridgeModule extends NativeModule<{}> {}

export default registerWebModule(SmsBridgeModule, 'SmsBridgeModule');
