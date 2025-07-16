# RAD (Recommendation and Discovery) Audit Documentation

This folder contains a comprehensive audit and analysis toolkit for understanding RAD synthesizer data usage patterns. The tools analyze 144 RAD synthesizers to identify data dependencies, usage patterns, and optimization opportunities.

## Overview

The RAD audit system provides:

- **144 total RAD synthesizers** analyzed
- **104 unique data fields** identified across all synthesizers
- **5 entity types** examined: mktgasst, o365, uce, vnextgraph, wsbvnext
- Comprehensive data usage patterns and field analysis
- Visual reports and data dictionaries
- Pattern recognition and optimization recommendations

## File Structure and Purpose

### Core Analysis Scripts

#### 1. `analyze_rad_fields.py`

**Main analysis engine** that parses RAD synthesizer functions.

- Extracts fields from entityPick calls, property access, and destructuring
- Identifies entity types and join patterns
- Calculates complexity scores
- Normalizes field paths
- **Input**: RAD markdown file
- **Output**: Comprehensive JSON report (`rad-field-analysis.json`)

#### 2. `analyze_unique_data_fields.py`

**Deep field analysis** with normalization and categorization.

- Performs deep normalization (e.g., 'vnextAccount.billing' → 'billing')
- Categorizes fields into business domains
- Generates human-readable descriptions
- Analyzes data overlap between synthesizers
- **Input**: JSON from analyze_rad_fields.py
- **Output**: `unique-data-fields.md` and `unique-data-fields.csv`

#### 3. `consolidated_data_list.py`

**Simple field listing** with usage indicators.

- Groups fields by category
- Visual usage frequency markers (🔴 high, 🟡 medium, 🟢 low)
- Summary statistics
- **Input**: JSON from analyze_rad_fields.py
- **Output**: `consolidated-data-fields.md`

#### 4. `create_data_summary.py`

**Visual summary generator** with charts and insights.

- ASCII bar charts for common data
- Category breakdowns with icons
- Mermaid diagrams
- Key insights and recommendations
- **Input**: JSON from analyze_rad_fields.py
- **Output**: `rad-data-visual-summary.md`

#### 5. `generate_data_dictionary.py`

**Comprehensive data dictionary** generator.

- Documents all fields with descriptions and usage
- Groups synthesizers by pattern
- Shows data requirements per synthesizer
- **Input**: JSON from analyze_rad_fields.py
- **Output**: `rad-data-dictionary.md` and `rad-data-dictionary.csv`

#### 6. `visualize_rad_patterns.py`

**Pattern visualization** and analysis.

- Field usage mapping tables
- Entity relationship diagrams
- Common synthesizer patterns
- Standardization recommendations
- **Input**: JSON from analyze_rad_fields.py
- **Output**: `rad-visualization-report.md`

### Utility Scripts

#### 7. `extract_fields_rad_use.py`

JavaScript-based RAD analyzer (alternative implementation).

- Note: Despite .py extension, contains JavaScript code
- Similar functionality to analyze_rad_fields.py

#### 8. `graphql-to-mermaid-python.py`

**CSV to documentation converter** for RAD configurations.

- Reads CSV exports from WAM
- Extracts JavaScript/GraphQL queries
- Generates Mermaid diagrams
- **Input**: CSV file (e.g., `wam-general-Jun 30, 2025, 11_50 AM.csv`)
- **Output**: `.mmd` and `.md` files

### Test Scripts

#### 9. `test_graphql_extraction.py`

Unit tests for graphql-to-mermaid-python.py

- Tests query pattern extraction
- Validates CSV processing
- Edge case testing

#### 10. `test_integration.py`

Integration tests for conversion pipeline

- Verifies script execution
- Validates output file creation
- Content structure checks

#### 11. `test_output_validation.py`

Output format validation

- Markdown formatting checks
- JavaScript syntax validation
- Mermaid diagram verification

### Generated Documentation Files

#### Analysis Reports

- **`rad-field-analysis.md`** - High-level analysis summary
- **`rad-visualization-report.md`** - Detailed visual report with patterns
- **`rad-data-visual-summary.md`** - Charts and visual analytics
- **`unique-data-fields.md`** - Normalized field catalog

#### Data References

- **`rad-data-dictionary.md`** - Complete field documentation
- **`consolidated-data-fields.md`** - Simple field listing
- **`graphql-queries-simple.md`** - All 144 synthesizer queries

#### Data Files

- **`rad-field-analysis.json`** - Primary analysis output
- **`rad-field-analysis.csv`** - Synthesizer complexity data
- **`rad-data-dictionary.csv`** - Machine-readable dictionary
- **`unique-data-fields.csv`** - Normalized field mapping
- **`wam-general-Jun 30, 2025, 11_50 AM.csv`** - WAM export source

#### Visualizations

- **`graphql-queries.mmd`** - Mermaid query flow diagrams
- **`graphql-queries-alternative.mmd`** - Alternative visualizations

## Analysis Pipeline

### Primary Workflow

```
1. Start with RAD markdown file containing synthesizer definitions
   ↓
2. Run analyze_rad_fields.py → generates rad-field-analysis.json
   ↓
3. Run subsequent analysis scripts (in any order):
   - analyze_unique_data_fields.py → unique field analysis
   - consolidated_data_list.py → simple field list
   - create_data_summary.py → visual summaries
   - generate_data_dictionary.py → data dictionary
   - visualize_rad_patterns.py → pattern analysis
```

### CSV Processing Workflow

```
1. Export RAD configuration from WAM as CSV
   ↓
2. Run graphql-to-mermaid-python.py
   ↓
3. Generates Mermaid diagrams and markdown documentation
```

## Key Findings

### Most Common Fields

1. **accountId** - 120 uses (83%)
2. **type** - 100 uses (69%)
3. **id** - 71 uses (49%)
4. **entityUrn** - 70 uses (49%)
5. **entityType** - 64 uses (44%)

### Data Categories

- **Core Identity & Authentication** (18 fields)
- **Entitlements & Permissions** (12 fields)
- **Website Configuration** (14 fields)
- **Marketing & Social** (10 fields)
- **E-commerce** (8 fields)
- **Services & Appointments** (7 fields)

### Complexity Distribution

- **Simple** (1-5 fields): 49 synthesizers (34%)
- **Medium** (6-10 fields): 52 synthesizers (36%)
- **Complex** (11+ fields): 43 synthesizers (30%)

### Important Notes

- 34 synthesizers return static/empty data (may need review)
- Field access inconsistencies exist (e.g., billing accessed 3 different ways)
- Strong dependency on accountId and entity type fields

## Usage Instructions

### Running a Complete Analysis

```bash
# 1. Analyze RAD markdown file
python analyze_rad_fields.py

# 2. Generate all reports (run any/all as needed)
python analyze_unique_data_fields.py
python consolidated_data_list.py
python create_data_summary.py
python generate_data_dictionary.py
python visualize_rad_patterns.py
```

### Processing WAM CSV Exports

```bash
# Convert CSV to documentation
python graphql-to-mermaid-python.py "wam-general-Jun 30, 2025, 11_50 AM.csv"
```

### Running Tests

```bash
# Run all tests
python test_graphql_extraction.py
python test_integration.py
python test_output_validation.py
```

## Recommendations

1. **Standardize field access patterns** - Multiple ways to access same data (e.g., billing)
2. **Review static synthesizers** - 34 synthesizers return empty/static data
3. **Optimize complex queries** - 43 synthesizers use 11+ fields
4. **Consider entity consolidation** - High overlap in data requirements
5. **Implement consistent naming** - Various field name formats exist

## Technical Requirements

- Python 3.x
- No external dependencies (uses standard library only)
- Input files must be properly formatted (markdown or CSV)

## Contributing

When adding new analysis scripts:

1. Follow the existing pattern of reading from `rad-field-analysis.json`
2. Generate both human-readable (.md) and machine-readable (.csv) outputs
3. Include appropriate test coverage
4. Update this README with the new script's purpose and usage
