# Multi-language Support (i18n)

This project uses i18next and react-i18next to implement multi-language support.

## Supported Languages

- Chinese (zh-CN) - Default language
- English (en-US)

## File Structure

```text
src/renderer/i18n/
├── index.ts              # i18next configuration file
├── locales/
│   ├── zh-CN.json        # Chinese language pack
│   └── en-US.json        # English language pack
└── README.md             # Documentation
```

## Usage

### Using Translations in Components

```tsx
import { useTranslation } from 'react-i18next';

const MyComponent = () => {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('common.title')}</h1>
      <p>{t('common.description')}</p>
    </div>
  );
};
```

### Switching Languages

```tsx
import { useTranslation } from 'react-i18next';

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div>
      <button onClick={() => changeLanguage('zh-CN')}>中文</button>
      <button onClick={() => changeLanguage('en-US')}>English</button>
    </div>
  );
};
```

## Adding New Translations

1. Add Chinese translation in `src/renderer/i18n/locales/zh-CN.json`
2. Add corresponding English translation in `src/renderer/i18n/locales/en-US.json`
3. Use `t('key')` in components to get the translation

### Translation Key Naming Convention

- Use dot-separated hierarchical structure
- Use lowercase letters and underscores
- Group by functional module

Example:

```json
{
  "common": {
    "send": "Send",
    "cancel": "Cancel"
  },
  "conversation": {
    "welcome": {
      "title": "What's on your schedule today?"
    }
  }
}
```

## Language Switcher

The project has a language switcher integrated in the top navigation bar, allowing users to switch the interface language at any time. The language selection is saved in localStorage and will be automatically applied on the next visit.

## Important Notes

1. All user-visible text should use translation functions
2. Translation keys should be descriptive for easy maintenance
3. When adding translations, ensure both Chinese and English have corresponding translations
4. Avoid hardcoding text content in code
