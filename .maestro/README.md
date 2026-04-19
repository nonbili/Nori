# Maestro Screenshots

Take app screenshots with [Maestro](https://maestro.mobile.dev/) and frame them with [fastlane frameit](https://docs.fastlane.tools/actions/frameit/).

## Setup

Install Maestro (one-time):

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

## Taking Screenshots

Ensure you have the target simulators created, then run the script with the platform and device name:

```bash
./scripts/maestro-screenshots.sh ios "iPhone 11 Pro Max"
./scripts/maestro-screenshots.sh ios "iPad Pro 13-inch (M5)"
```

The script automatically:

1. Boots the specified simulator (iOS only).
2. Runs the Maestro flow.
3. Prefixes the resulting PNGs with the device name (e.g., `iPhone 17 Pro-01_home.png`) in the `fastlane/screenshots/{platform}/en-US/` directory.

For localized screenshots:

```bash
LOCALE=ja ./scripts/maestro-screenshots.sh ios "iPhone 17 Pro"
```

## Framing with frameit

Frameit uses the device name prefix to automatically select the correct device frame.

```bash
# Navigate to the platform directory containing the Framefile.json
cd fastlane/screenshots/ios
bundle exec fastlane frameit
```

Framing configuration is located in `fastlane/screenshots/{platform}/Framefile.json`. Shared assets like `background.jpg` and `Regular.ttf` should be placed in the same platform directory to be inherited by screenshots in all locale subdirectories.

## Adding More Screenshots

Edit `.maestro/screenshots.yaml` to navigate and capture additional screens:

```yaml
- takeScreenshot: 01_home

- tapOn:
    id: 'settings_button'
- waitForAnimationToEnd
- takeScreenshot: 02_settings
```

Then add matching entries in the corresponding `Framefile.json`:

```json
{
  "filter": "02_settings",
  "keyword": { "text": "CUSTOMIZE" },
  "title": { "text": "Personalize your experience" }
}
```

Use `testID` props in React Native components to target elements reliably:

```tsx
<Button testID="settings_button" />
```
