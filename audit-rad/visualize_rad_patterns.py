#!/usr/bin/env python3
"""
Visualize and summarize RAD field usage patterns
Creates easy-to-understand summaries and visualizations
"""

import json
import argparse
from collections import defaultdict, Counter
from typing import Dict, List

class RADPatternVisualizer:
    def __init__(self, report_data: Dict):
        self.report = report_data
        
    def generate_field_mapping_table(self) -> str:
        """Generate a table showing how fields map across entities"""
        output = "# Field Usage Mapping Table\n\n"
        output += "This table shows which fields are used by which entity types and how often.\n\n"
        
        # Get fields by entity
        fields_by_entity = self.report['field_analysis']['fields_by_entity']
        
        # Collect all unique fields
        all_fields = set()
        for entity_fields in fields_by_entity.values():
            all_fields.update(field for field, _ in entity_fields)
        
        # Create matrix
        output += "| Field | " + " | ".join(fields_by_entity.keys()) + " | Total |\n"
        output += "|-------|" + "|".join(["-------"] * (len(fields_by_entity) + 1)) + "|\n"
        
        field_totals = Counter()
        for entity, fields in fields_by_entity.items():
            for field, count in fields:
                field_totals[field] += count
        
        # Sort fields by total usage
        for field, total in field_totals.most_common(30):
            row = f"| `{field}` |"
            for entity in fields_by_entity.keys():
                count = next((c for f, c in fields_by_entity[entity] if f == field), 0)
                row += f" {count if count > 0 else '-'} |"
            row += f" {total} |\n"
            output += row
            
        return output
    
    def generate_entity_relationship_diagram(self) -> str:
        """Generate a simple diagram showing entity relationships"""
        output = "\n# Entity Relationships\n\n"
        output += "```mermaid\ngraph LR\n"
        
        relationships = defaultdict(set)
        for rel in self.report['entity_relationships']:
            if rel['entities']:
                for i in range(len(rel['entities']) - 1):
                    relationships[rel['entities'][i]].add(rel['entities'][i + 1])
        
        # Add nodes
        for entity in self.report['summary']['entity_types']:
            output += f"    {entity}[{entity}]\n"
        
        # Add relationships
        for source, targets in relationships.items():
            for target in targets:
                output += f"    {source} --> {target}\n"
                
        output += "```\n"
        return output
    
    def generate_field_categories_summary(self) -> str:
        """Generate a summary of fields organized by business category"""
        output = "\n# Fields by Business Category\n\n"
        
        categories = self.report['field_analysis']['common_patterns']
        
        for category, fields in categories.items():
            if fields:
                output += f"## {category.replace('_', ' ').title()}\n\n"
                total_usage = sum(count for _, count in fields)
                output += f"Total field accesses in this category: **{total_usage}**\n\n"
                
                for field, count in fields:
                    percentage = (count / self.get_total_field_accesses()) * 100
                    output += f"- `{field}`: {count} times ({percentage:.1f}% of all accesses)\n"
                output += "\n"
                
        return output
    
    def get_total_field_accesses(self) -> int:
        """Calculate total field accesses across all synthesizers"""
        total = 0
        for field, count in self.report['field_analysis']['most_used_fields']:
            total += count
        return total
    
    def generate_synthesizer_patterns(self) -> str:
        """Identify and document common synthesizer patterns"""
        output = "\n# Common Synthesizer Patterns\n\n"
        
        patterns = {
            'simple_entity_filter': [],
            'entity_join': [],
            'conditional_return': [],
            'static_return': [],
            'venture_based': [],
            'complex_logic': []
        }
        
        for synth in self.report['synthesizer_details']:
            name = synth['name']
            
            if synth['return_pattern']['type'] in ['empty_array', 'static_none']:
                patterns['static_return'].append(name)
            elif synth['return_pattern']['type'] == 'venture_based':
                patterns['venture_based'].append(name)
            elif synth['join_info']['uses_join']:
                patterns['entity_join'].append(name)
            elif synth['complexity']['score'] >= 5:
                patterns['complex_logic'].append(name)
            elif synth['conditional_logic']:
                patterns['conditional_return'].append(name)
            else:
                patterns['simple_entity_filter'].append(name)
        
        # Document patterns
        pattern_docs = {
            'simple_entity_filter': 'Simple filtering of entities with field selection',
            'entity_join': 'Joins multiple entity types (e.g., mktgasst + wsbvnext)',
            'conditional_return': 'Returns data based on conditions',
            'static_return': 'Always returns empty or static data',
            'venture_based': 'Returns venture-specific data',
            'complex_logic': 'Complex business logic with multiple conditions'
        }
        
        for pattern, synthesizers in patterns.items():
            if synthesizers:
                output += f"## {pattern.replace('_', ' ').title()}\n"
                output += f"**Description:** {pattern_docs.get(pattern, 'Unknown pattern')}\n"
                output += f"**Count:** {len(synthesizers)} synthesizers\n\n"
                
                # Show first 5 examples
                output += "Examples:\n"
                for synth in synthesizers[:5]:
                    output += f"- {synth}\n"
                if len(synthesizers) > 5:
                    output += f"- ... and {len(synthesizers) - 5} more\n"
                output += "\n"
                
        return output
    
    def generate_field_variations_analysis(self) -> str:
        """Analyze how the same data is accessed differently"""
        output = "\n# Field Access Variations Analysis\n\n"
        output += "This shows how the same logical data is accessed through different field paths.\n\n"
        
        variations = self.report['field_analysis']['field_variations']
        
        if variations:
            for normalized, actual_fields in variations.items():
                if len(actual_fields) > 1:
                    output += f"## {normalized}\n"
                    output += f"This data is accessed in **{len(actual_fields)}** different ways:\n\n"
                    for field in sorted(actual_fields):
                        output += f"- `{field}`\n"
                    output += "\n"
        
        return output
    
    def generate_recommendations(self) -> str:
        """Generate recommendations based on the analysis"""
        output = "\n# Recommendations\n\n"
        
        # Check for inconsistent field access
        variations = self.report['field_analysis']['field_variations']
        inconsistent_fields = [k for k, v in variations.items() if len(v) > 2]
        
        if inconsistent_fields:
            output += "## Standardize Field Access\n"
            output += "The following fields are accessed inconsistently:\n\n"
            for field in inconsistent_fields[:5]:
                output += f"- `{field}` has {len(variations[field])} variations\n"
            output += "\nConsider standardizing these to reduce complexity.\n\n"
        
        # Check for overly complex synthesizers
        complex_count = sum(1 for s in self.report['synthesizer_details'] 
                          if s['complexity']['level'] == 'complex')
        if complex_count > 5:
            output += "## Simplify Complex Synthesizers\n"
            output += f"Found **{complex_count}** complex synthesizers that might benefit from simplification.\n\n"
        
        # Check for unused static returns
        static_count = sum(1 for s in self.report['synthesizer_details'] 
                         if s['return_pattern']['type'] in ['empty_array', 'static_none'])
        if static_count > 10:
            output += "## Review Static Returns\n"
            output += f"Found **{static_count}** synthesizers that always return empty/static data.\n"
            output += "Consider if these are still needed.\n\n"
        
        return output
    
    def generate_full_report(self) -> str:
        """Generate complete analysis report"""
        output = "# RAD Field Usage Analysis - Detailed Report\n\n"
        
        # Summary stats
        output += "## Overview\n"
        output += f"- **Total Synthesizers:** {self.report['summary']['total_synthesizers']}\n"
        output += f"- **Unique Fields:** {self.report['summary']['total_unique_fields']}\n"
        output += f"- **Entity Types:** {len(self.report['summary']['entity_types'])}\n"
        output += f"- **Total Field Accesses:** {self.get_total_field_accesses()}\n\n"
        
        # Add all sections
        output += self.generate_field_mapping_table()
        output += self.generate_entity_relationship_diagram()
        output += self.generate_field_categories_summary()
        output += self.generate_synthesizer_patterns()
        output += self.generate_field_variations_analysis()
        output += self.generate_recommendations()
        
        return output

def main():
    parser = argparse.ArgumentParser(description='Visualize RAD field usage patterns')
    parser.add_argument('input', help='JSON analysis report from analyze_rad_fields.py')
    parser.add_argument('-o', '--output', help='Output file path', 
                       default='rad-visualization-report.md')
    
    args = parser.parse_args()
    
    # Load JSON report
    with open(args.input, 'r') as f:
        report_data = json.load(f)
    
    # Generate visualization
    visualizer = RADPatternVisualizer(report_data)
    output = visualizer.generate_full_report()
    
    # Save output
    with open(args.output, 'w') as f:
        f.write(output)
    
    print(f"Visualization report saved to: {args.output}")

if __name__ == '__main__':
    main()