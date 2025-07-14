import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';

// Runtime validation with TypeScript types
export const ConfigSchema = z.object({
  scanner: z.object({
    include: z.array(z.string()),
    exclude: z.array(z.string()),
    maxDepth: z.number().default(10),
    followImports: z.boolean().default(true),
    detectPatterns: z.object({
      queries: z.boolean().default(true),
      mutations: z.boolean().default(true),
      subscriptions: z.boolean().default(true),
      fragments: z.boolean().default(true)
    })
  }),

  analyzer: z.object({
    schemaPath: z.string(),
    enableFederation: z.boolean().default(false),
    customScalars: z.record(z.string(), z.string()).optional(),
    deprecationHandling: z.enum(['ignore', 'warn', 'error']).default('warn')
  }),

  transformer: z.object({
    preserveFormatting: z.boolean().default(true),
    addSafetyComments: z.boolean().default(true),
    generateTypeAnnotations: z.boolean().default(false),
    targetVersion: z.enum(['legacy', 'modern']).default('modern')
  }),

  output: z.object({
    format: z.enum(['json', 'markdown', 'html']).default('markdown'),
    generateDiff: z.boolean().default(true),
    generateTests: z.boolean().default(false)
  })
});

export type Config = z.infer<typeof ConfigSchema>;

// Type-safe config loader
export async function loadConfig(path?: string): Promise<Config> {
  const explorer = cosmiconfigSync('graphql-migration');

  const result = path
    ? explorer.load(path)
    : explorer.search();

  if (!result) {
    throw new Error('No configuration found');
  }

  // Validates and returns typed config
  return ConfigSchema.parse(result.config);
}

// Default configuration
export const defaultConfig: Config = {
  scanner: {
    include: ['src/**/*.{js,jsx,ts,tsx}'],
    exclude: ['**/node_modules/**', '**/__tests__/**'],
    maxDepth: 10,
    followImports: true,
    detectPatterns: {
      queries: true,
      mutations: true,
      subscriptions: true,
      fragments: true
    }
  },
  analyzer: {
    schemaPath: './schema.graphql',
    enableFederation: false,
    deprecationHandling: 'warn'
  },
  transformer: {
    preserveFormatting: true,
    addSafetyComments: true,
    generateTypeAnnotations: false,
    targetVersion: 'modern'
  },
  output: {
    format: 'markdown',
    generateDiff: true,
    generateTests: false
  }
};