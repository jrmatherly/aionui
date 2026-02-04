# Theme Color Migration Guide

## 🎨 Usage

### 1. UnoCSS Atomic Classes (Recommended) ✨

```tsx
// ✅ Background Colors - Simple & Intuitive
<div className="bg-base">     // Main background (White/Black)
<div className="bg-1">        // Secondary background (#F7F8FA)
<div className="bg-2">        // Tertiary background (#F2F3F5)
<div className="bg-brand">    // Brand background (#7583B2)

// ✅ Text Colors - Semantic
<div className="text-t-primary">    // Primary text (#1D2129)
<div className="text-t-secondary">  // Secondary text (#86909C)
<div className="text-brand">        // Brand text

// ✅ Border Colors
<div className="border-b-base">     // Base border (#E5E6EB)
<div className="border-b-light">    // Light border

// ✅ Brand Color Series
<div className="bg-aou-1">           // AOU Palette 1-10
<div className="hover:bg-brand-hover"> // Brand hover
```

### 2. Inline Styles (CSS Variables)

```tsx
<div style={{ backgroundColor: 'var(--bg-base)' }}>
<div style={{ color: 'var(--text-primary)' }}>
<div style={{ borderColor: 'var(--border-base)' }}>
<div style={{ backgroundColor: 'var(--brand)' }}>
```

## 📋 Common Color Mapping Table

| Original (Hex) | UnoCSS Class                  | CSS Variable            | Description               |
| -------------- | ----------------------------- | ----------------------- | ------------------------- |
| `#FFFFFF`      | `bg-base`                     | `var(--bg-base)`        | Main Background           |
| `#F7F8FA`      | `bg-1`                        | `var(--bg-1)`           | Secondary Background/Fill |
| `#F2F3F5`      | `bg-2`                        | `var(--bg-2)`           | Tertiary Background       |
| `#E5E6EB`      | `bg-3` or `border-b-base`     | `var(--border-base)`    | Border/Divider            |
| `#7583B2`      | `bg-brand` / `text-brand`     | `var(--brand)`          | Brand Color               |
| `#EFF0F6`      | `bg-aou-1` / `bg-brand-light` | `var(--aou-1)`          | Brand Light Background    |
| `#E5E7F0`      | `bg-aou-2`                    | `var(--aou-2)`          | AOU Palette 2             |
| `#1D2129`      | `text-t-primary`              | `var(--text-primary)`   | Primary Text              |
| `#86909C`      | `text-t-secondary` / `bg-6`   | `var(--text-secondary)` | Secondary Text            |
| `#165DFF`      | `bg-primary` / `text-primary` | `var(--primary)`        | Primary Color             |

## 🔄 Migration Steps

1. **Search** for hardcoded colors: `bg-#`, `text-#`, `color-#`, `border-#`
2. **Lookup** corresponding theme variables in the table
3. **Replace** with UnoCSS classes
4. **Test** light/dark theme switching

## 💡 Migration Examples

### Before (Hardcoded):

```tsx
<div className='bg-#EFF0F6 hover:bg-#E5E7F0'>
  <span className='text-#1D2129'>Text</span>
  <div className='border border-#E5E6EB'></div>
</div>
```

### After (Theme Variables):

```tsx
<div className='bg-aou-1 hover:bg-aou-2'>
  <span className='text-t-primary'>Text</span>
  <div className='border border-b-base'></div>
</div>
```

### Common Patterns:

```tsx
// ❌ Not Recommended
<div className="bg-#F7F8FA text-#86909C border-#E5E6EB">

// ✅ Recommended
<div className="bg-1 text-t-secondary border-b-base">
```

## 🎯 Quick Reference

- **Background**: `bg-base`, `bg-1`, `bg-2`, `bg-3`
- **Text**: `text-t-primary`, `text-t-secondary`, `text-t-disabled`
- **Border**: `border-b-base`, `border-b-light`
- **Brand**: `bg-brand`, `bg-brand-light`, `bg-brand-hover`
- **Status**: `bg-primary`, `bg-success`, `bg-warning`, `bg-danger`
- **AOU Palette**: `bg-aou-1` ~ `bg-aou-10`
