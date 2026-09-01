# FPL Assistant Development & Testing Guidelines

## Development Build ONLY
- Testing is done exclusively via `npx expo start --dev-client` and opening the installed "FPL Assistant" development build app on the Android emulator or device.
- Expo Go is PERMANENTLY UNUSED and blocked by a root layout execution guard (`Constants.executionEnvironment === ExecutionEnvironment.StoreClient`).
- Native modules (`@react-native-cookies/cookies`, `react-native-webview`) are fully active in the dev build.

