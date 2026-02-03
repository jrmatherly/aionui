# i18n Configuration

## Framework
- **Library**: i18next with react-i18next
- **Key Style**: Nested (e.g., `common.send`, `login.errors.empty`)
- **Source Language**: en-US (fallback language)

## Supported Locales
- en-US (English)
- zh-CN (Simplified Chinese)
- zh-TW (Traditional Chinese)
- ja-JP (Japanese)
- ko-KR (Korean)

## File Structure
```
src/renderer/i18n/
├── index.ts              # i18next configuration
├── locales/
│   ├── en-US.json        # English (source)
│   ├── zh-CN.json        # Simplified Chinese
│   ├── zh-TW.json        # Traditional Chinese
│   ├── ja-JP.json        # Japanese
│   └── ko-KR.json        # Korean
└── README.md
```

## IDE Configuration (i18n Ally)
VS Code settings required for i18n Ally extension (`.vscode/settings.json`):

```json
{
  "i18n-ally.localesPaths": ["src/renderer/i18n/locales"],
  "i18n-ally.enabledFrameworks": ["i18next"],
  "i18n-ally.keystyle": "nested",
  "i18n-ally.sourceLanguage": "en-US",
  "i18n-ally.displayLanguage": "en-US",
  "i18n-ally.pathMatcher": "{locale}.json",
  "i18n-ally.namespace": false
}
```

## Usage
```tsx
import { useTranslation } from 'react-i18next';

const Component = () => {
  const { t } = useTranslation();
  return <span>{t('common.send')}</span>;
};
```
