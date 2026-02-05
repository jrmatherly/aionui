import type { PresetAgentType } from '@/types/acpTypes';

/**
 * Assistant preset configuration.
 *
 * Note: The `*I18n` suffix on property names is historical. This project is now
 * English-only. The Record<string, string> structure uses 'en-US' as the key
 * for backward compatibility with stored user data.
 */
export type AssistantPreset = {
  id: string;
  avatar: string;
  presetAgentType?: PresetAgentType;
  /**
   * Directory containing all resources for this preset (relative to project root).
   * If set, both ruleFiles and skillFiles will be resolved from this directory.
   * Default: rules/ for rules, skills/ for skills
   */
  resourceDir?: string;
  ruleFiles: Record<string, string>;
  skillFiles?: Record<string, string>;
  /**
   * Default enabled skills for this assistant (skill names from skills/ directory).
   */
  defaultEnabledSkills?: string[];
  nameI18n: Record<string, string>;
  descriptionI18n: Record<string, string>;
  promptsI18n?: Record<string, string[]>;
};

export const ASSISTANT_PRESETS: AssistantPreset[] = [
  {
    id: 'cowork',
    avatar: 'cowork.svg',
    presetAgentType: 'gemini',
    resourceDir: 'assistant/cowork',
    ruleFiles: {
      'en-US': 'cowork.md',
    },
    skillFiles: {
      'en-US': 'cowork-skills.md',
    },
    defaultEnabledSkills: ['skill-creator', 'pptx', 'docx', 'pdf', 'xlsx'],
    nameI18n: {
      'en-US': 'Cowork',
    },
    descriptionI18n: {
      'en-US': 'Autonomous task execution with file operations, document processing, and multi-step workflow planning.',
    },
    promptsI18n: {
      'en-US': ['Analyze the project structure', 'Automate the build process'],
    },
  },
  {
    id: 'pptx-generator',
    avatar: '📊',
    presetAgentType: 'gemini',
    resourceDir: 'assistant/pptx-generator',
    ruleFiles: {
      'en-US': 'pptx-generator.md',
    },
    nameI18n: {
      'en-US': 'PPTX Generator',
    },
    descriptionI18n: {
      'en-US': 'Generate local PPTX assets and structure for pptxgenjs.',
    },
    promptsI18n: {
      'en-US': ['Create a slide deck about AI trends', 'Generate a PPT for quarterly report'],
    },
  },
  {
    id: 'pdf-to-ppt',
    avatar: '📄',
    presetAgentType: 'gemini',
    resourceDir: 'assistant/pdf-to-ppt',
    ruleFiles: {
      'en-US': 'pdf-to-ppt.md',
    },
    nameI18n: {
      'en-US': 'PDF to PPT',
    },
    descriptionI18n: {
      'en-US': 'Convert PDF to PPT with watermark removal rules.',
    },
    promptsI18n: {
      'en-US': ['Convert report.pdf to slides', 'Extract charts from whitepaper.pdf'],
    },
  },
  {
    id: 'game-3d',
    avatar: '🎮',
    presetAgentType: 'gemini',
    resourceDir: 'assistant/game-3d',
    ruleFiles: {
      'en-US': 'game-3d.md',
    },
    nameI18n: {
      'en-US': '3D Game',
    },
    descriptionI18n: {
      'en-US': 'Generate a complete 3D platform collection game in one HTML file.',
    },
    promptsI18n: {
      'en-US': ['Create a 3D platformer game', 'Make a coin collection game'],
    },
  },
  {
    id: 'ui-ux-pro-max',
    avatar: '🎨',
    presetAgentType: 'gemini',
    resourceDir: 'assistant/ui-ux-pro-max',
    ruleFiles: {
      'en-US': 'ui-ux-pro-max.md',
    },
    nameI18n: {
      'en-US': 'UI/UX Pro Max',
    },
    descriptionI18n: {
      'en-US': 'Professional UI/UX design intelligence with 57 styles, 95 color palettes, 56 font pairings, and stack-specific best practices.',
    },
    promptsI18n: {
      'en-US': ['Design a login page for a fintech app', 'Create a color palette for a nature theme'],
    },
  },
  {
    id: 'planning-with-files',
    avatar: '📋',
    presetAgentType: 'gemini',
    resourceDir: 'assistant/planning-with-files',
    ruleFiles: {
      'en-US': 'planning-with-files.md',
    },
    nameI18n: {
      'en-US': 'Planning with Files',
    },
    descriptionI18n: {
      'en-US': 'Manus-style file-based planning for complex tasks. Uses task_plan.md, findings.md, and progress.md to maintain persistent context.',
    },
    promptsI18n: {
      'en-US': ['Plan a refactoring task', 'Break down the feature implementation'],
    },
  },
  {
    id: 'human-3-coach',
    avatar: '🧭',
    presetAgentType: 'gemini',
    resourceDir: 'assistant/human-3-coach',
    ruleFiles: {
      'en-US': 'human-3-coach.md',
    },
    nameI18n: {
      'en-US': 'HUMAN 3.0 Coach',
    },
    descriptionI18n: {
      'en-US': 'Personal development coach based on HUMAN 3.0 framework: 4 Quadrants (Mind/Body/Spirit/Vocation), 3 Levels, 3 Growth Phases.',
    },
    promptsI18n: {
      'en-US': ['Help me set quarterly goals', 'Reflect on my career progress'],
    },
  },
  {
    id: 'social-job-publisher',
    avatar: '📣',
    presetAgentType: 'gemini',
    resourceDir: 'assistant/social-job-publisher',
    ruleFiles: {
      'en-US': 'social-job-publisher.md',
    },
    skillFiles: {
      'en-US': 'social-job-publisher-skills.md',
    },
    defaultEnabledSkills: ['x-recruiter'],
    nameI18n: {
      'en-US': 'Social Job Publisher',
    },
    descriptionI18n: {
      'en-US': 'Expand hiring requests into a full JD, images, and publish to social platforms via connectors.',
    },
    promptsI18n: {
      'en-US': ['Create a job post for Senior Engineer', 'Draft a hiring tweet'],
    },
  },
  {
    id: 'moltbook',
    avatar: '🦞',
    presetAgentType: 'gemini',
    resourceDir: 'assistant/moltbook',
    ruleFiles: {
      'en-US': 'moltbook.md',
    },
    skillFiles: {
      'en-US': 'moltbook-skills.md',
    },
    defaultEnabledSkills: ['moltbook'],
    nameI18n: {
      'en-US': 'moltbook',
    },
    descriptionI18n: {
      'en-US': 'The social network for AI agents. Post, comment, upvote, and create communities.',
    },
    promptsI18n: {
      'en-US': ['Check my moltbook feed', 'Post something to moltbook', 'Check for new DMs'],
    },
  },
  {
    id: 'beautiful-mermaid',
    avatar: '📈',
    presetAgentType: 'gemini',
    resourceDir: 'assistant/beautiful-mermaid',
    ruleFiles: {
      'en-US': 'beautiful-mermaid.md',
    },
    defaultEnabledSkills: ['mermaid'],
    nameI18n: {
      'en-US': 'Beautiful Mermaid',
    },
    descriptionI18n: {
      'en-US': 'Create flowcharts, sequence diagrams, state diagrams, class diagrams, and ER diagrams with beautiful themes.',
    },
    promptsI18n: {
      'en-US': ['Draw a user login flowchart', 'Create an API sequence diagram', 'Draw a TCP state diagram'],
    },
  },
];
