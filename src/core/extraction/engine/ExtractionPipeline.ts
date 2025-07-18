import { logger } from '../../../utils/logger.js';
import { parse, print } from 'graphql';
import {
  ExtractedQuery,
  ResolvedQuery,
  ExtractionResult,
  QueryVariant,
  VariantSwitch,
  PatternExtractedQuery,
} from '../types/index.js';
import { ExtractionContext } from './ExtractionContext.js';

// Analyzers
import { VariantAnalyzer } from '../analyzers/VariantAnalyzer.js';
import { ContextAnalyzer } from '../analyzers/ContextAnalyzer.js';
import { QueryNameAnalyzer } from '../analyzers/QueryNameAnalyzer.js';
import { TemplateResolver } from '../analyzers/TemplateResolver.js';

// Resolvers
import { FragmentResolver } from '../utils/FragmentResolver.js';
import { NameResolver } from '../resolvers/NameResolver.js';

// Transformers
import { NameNormalizer } from '../transformers/NameNormalizer.js';
import { VariantGenerator } from '../transformers/VariantGenerator.js';
import { FragmentInliner } from '../transformers/FragmentInliner.js';

// Reporters
import { JSONReporter } from '../reporters/JSONReporter.js';
import { HTMLReporter } from '../reporters/HTMLReporter.js';
import { FileReporter } from '../reporters/FileReporter.js';

export class ExtractionPipeline {
  private context: ExtractionContext;

  // Analyzers
  private variantAnalyzer: VariantAnalyzer;
  private contextAnalyzer: ContextAnalyzer;
  private queryNameAnalyzer: QueryNameAnalyzer;
  private templateResolver: TemplateResolver;

  // Resolvers
  private fragmentResolver: FragmentResolver;
  private nameResolver: NameResolver;

  // Transformers
  private nameNormalizer: NameNormalizer;
  private variantGenerator: VariantGenerator;
  private fragmentInliner: FragmentInliner;

  // Reporters
  private reporters: Map<string, JSONReporter | HTMLReporter | FileReporter>;

  constructor(context: ExtractionContext) {
    this.context = context;

    // Initialize components
    this.variantAnalyzer = new VariantAnalyzer(context);
    this.contextAnalyzer = new ContextAnalyzer(context);
    this.queryNameAnalyzer = new QueryNameAnalyzer(context);
    this.templateResolver = new TemplateResolver(context);

    this.fragmentResolver = new FragmentResolver();
    this.nameResolver = new NameResolver(context);

    this.nameNormalizer = new NameNormalizer(context);
    this.variantGenerator = new VariantGenerator(context);
    this.fragmentInliner = new FragmentInliner(context);

    this.reporters = new Map<string, JSONReporter | HTMLReporter | FileReporter>([
      ['json', new JSONReporter(context)],
      ['html', new HTMLReporter(context)],
      ['files', new FileReporter(context)],
    ]);
  }

  async process(queries: ExtractedQuery[]): Promise<ExtractionResult> {
    logger.info('Starting extraction pipeline processing with pattern-aware approach');

    let processedQueries = queries;
    const variants: QueryVariant[] = [];
    const switches = new Map<string, VariantSwitch>();

    // Phase 1: Pattern-Aware Analysis
    // Initialize query naming service
    await this.context.initializeQueryNaming();

    // Apply pattern-based processing first
    logger.info('Processing queries with pattern awareness...');
    const namingService = this.context.getQueryNamingService();
    const patternQueries = namingService.processQueries(processedQueries);
    processedQueries = patternQueries;

    // Log pattern analysis results
    const dynamicPatterns = patternQueries.filter((q) => q.namePattern).length;
    const staticQueries = patternQueries.length - dynamicPatterns;
    logger.info(
      `Pattern analysis: ${dynamicPatterns} dynamic patterns, ${staticQueries} static queries`,
    );

    // First resolve template interpolations to get clean queries
    logger.info('Resolving template interpolations...');
    processedQueries = await this.templateResolver.resolveTemplates(processedQueries);

    if (this.context.options.analyzeContext) {
      logger.info('Analyzing query context...');
      processedQueries = await this.contextAnalyzer.analyze(processedQueries);
    }

    if (this.context.options.resolveNames) {
      logger.info('Enhancing query names (pattern-aware)...');
      processedQueries = await this.queryNameAnalyzer.analyze(processedQueries);
    }

    if (this.context.options.detectVariants) {
      logger.info('Detecting query variants...');
      const variantAnalysis = await this.variantAnalyzer.analyze(processedQueries);
      // variantAnalysis is an array of VariantAnalysisResult

      // Collect switches from analysis
      variantAnalysis.forEach((result) => {
        result.switches.forEach((sw) => {
          switches.set(sw.variable, sw);
        });
      });
    }

    // Phase 2: Resolution
    let resolvedQueries: ResolvedQuery[] = processedQueries as ResolvedQuery[];

    if (this.context.options.resolveFragments) {
      logger.info('Resolving fragments...');
      // Convert to compatible format
      const fragmentResults = await this.fragmentResolver.resolveQueriesWithFragments(processedQueries);
      resolvedQueries = fragmentResults.map(fragResult => ({
        ...fragResult,
        resolvedContent: fragResult.content,
        resolvedFragments: fragResult.fragments.map(frag => ({
          name: frag.name.value,
          content: print(frag),
          ast: parse(print(frag)),
          filePath: fragResult.filePath,
          dependencies: fragResult.imports,
        })),
        allDependencies: fragResult.imports,
        ast: processedQueries.find(q => q.id === fragResult.id)?.ast || parse(fragResult.content),
        location: processedQueries.find(q => q.id === fragResult.id)?.location!,
        fragments: fragResult.fragments.map(frag => frag.name.value),
        imports: fragResult.imports.map(imp => ({ source: imp, imported: [], type: 'es6' as const })),
      }));
      this.context.stats.totalFragments = this.context.fragments.size;
    }

    if (this.context.options.resolveNames) {
      logger.info('Finalizing name resolution...');
      resolvedQueries = await this.nameResolver.resolve(resolvedQueries);
    }

    // Phase 3: Transformation
    if (this.context.options.normalizeNames) {
      logger.info('Normalizing query names...');
      resolvedQueries = await this.nameNormalizer.transform(resolvedQueries);
    }

    if (this.context.options.generateVariants) {
      logger.info('Generating query variants...');
      const generatedVariants = await this.variantGenerator.generate(resolvedQueries, switches);
      variants.push(...generatedVariants);
      this.context.stats.totalVariants = variants.length;
    }

    if (this.context.options.inlineFragments) {
      logger.info('Inlining fragments...');
      resolvedQueries = await this.fragmentInliner.transform(resolvedQueries);
    }

    // Phase 4: Reporting
    const result: ExtractionResult = {
      queries: resolvedQueries,
      variants,
      fragments: this.context.fragments,
      switches,
      errors: this.context.errors,
      stats: this.context.finalizeStats(),
    };

    if (this.context.options.reporters) {
      await this.generateReports(result);
    }

    return result;
  }

  private async generateReports(result: ExtractionResult): Promise<void> {
    const reporters = this.context.options.reporters || [];

    for (const reporterType of reporters) {
      const reporter = this.reporters.get(reporterType);
      if (reporter) {
        logger.info(`Generating ${reporterType} report...`);
        try {
          await reporter.generate(result);
        } catch (error) {
          logger.error(`Failed to generate ${reporterType} report:`, error);
        }
      }
    }
  }
}
