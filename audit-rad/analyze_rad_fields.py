#!/usr/bin/env python3
"""
Enhanced RAD Synthesizer Field Analyzer
Analyzes GraphQL-like queries to extract all field access patterns and data requirements
"""

import re
import json
from collections import defaultdict, Counter
from typing import Dict, List, Set, Tuple
import argparse

class RADFieldAnalyzer:
    def __init__(self):
        self.results = []
        self.all_fields = set()
        self.entity_types = set()
        self.field_variations = defaultdict(set)  # Track different ways to access same data
        self.field_by_entity = defaultdict(set)  # Track which fields belong to which entity
        
    def normalize_field_path(self, field: str) -> str:
        """Normalize field paths to identify common data accessed differently"""
        # Remove quotes and clean up
        field = field.strip().strip('"\'`')
        
        # Normalize common variations
        normalizations = {
            'entitlementData.current': 'entitlements.current',
            'entitlementData.used': 'entitlements.used',
            'entitlementData.transitionable': 'entitlements.transitionable',
            'vnextAccount.billing': 'billing',
            'vnextAccount.account': 'account',
            'features.websiteType': 'websiteType',
            'gem.subscriberCount': 'email.subscriberCount',
            'gem.hasSent': 'email.hasSent',
            'gem.lastFbPostDate': 'social.lastFacebookPost',
            'gem.lastIgPostDate': 'social.lastInstagramPost',
            'ols.products.count': 'commerce.productCount',
            'ola.service.total': 'appointments.serviceCount',
            'ola.account.status': 'appointments.status',
        }
        
        for old, new in normalizations.items():
            if field.startswith(old):
                normalized = field.replace(old, new, 1)
                self.field_variations[new].add(field)
                return normalized
                
        return field
    
    def extract_entity_pick_fields(self, code: str) -> List[Dict]:
        """Extract fields from entityPick calls with context"""
        fields_with_context = []
        
        # Match entityPick with capturing the entity variable
        pattern = r'entityPick\s*\(\s*(\w+)\s*,\s*\[([\s\S]*?)\]\s*\)'
        
        for match in re.finditer(pattern, code):
            entity_var = match.group(1)
            fields_str = match.group(2)
            
            # Extract individual fields
            field_pattern = r'[\'"`]([^\'"`]+)[\'"`]'
            fields = re.findall(field_pattern, fields_str)
            
            # Determine entity type from context
            entity_type = self._infer_entity_type(code, entity_var)
            
            for field in fields:
                normalized = self.normalize_field_path(field)
                self.all_fields.add(normalized)
                
                if entity_type:
                    self.field_by_entity[entity_type].add(normalized)
                
                fields_with_context.append({
                    'field': field,
                    'normalized': normalized,
                    'entity_type': entity_type,
                    'access_method': 'entityPick'
                })
                
        return fields_with_context
    
    def _infer_entity_type(self, code: str, entity_var: str) -> str:
        """Infer entity type from variable usage context"""
        # Look for filter patterns
        filter_pattern = rf'entity\.type\s*===\s*[\'"`](\w+)[\'"`].*?{entity_var}'
        match = re.search(filter_pattern, code, re.DOTALL)
        if match:
            return match.group(1)
            
        # Look for explicit type checks
        type_pattern = rf'{entity_var}\.type\s*===\s*[\'"`](\w+)[\'"`]'
        match = re.search(type_pattern, code)
        if match:
            return match.group(1)
            
        # Common variable name patterns
        if 'wsbv' in entity_var.lower():
            return 'wsbvnext'
        elif 'mktg' in entity_var.lower():
            return 'mktgasst'
        elif 'uce' in entity_var.lower():
            return 'uce'
            
        return 'unknown'
    
    def extract_direct_property_access(self, code: str) -> List[Dict]:
        """Extract direct property access patterns"""
        access_patterns = []
        
        # Profile request query access
        query_pattern = r'profile\.request\.query\.(\w+)'
        for match in re.finditer(query_pattern, code):
            field = f'request.query.{match.group(1)}'
            access_patterns.append({
                'field': field,
                'normalized': field,
                'entity_type': 'profile',
                'access_method': 'direct'
            })
        
        # Entity property access with optional chaining
        prop_pattern = r'(\w+)\.([a-zA-Z0-9_.?]+)(?:\s*[=!<>]|\s*\?\?|\s*&&|\s*\|\||\s*\))'
        for match in re.finditer(prop_pattern, code):
            var_name = match.group(1)
            prop_path = match.group(2).replace('?.', '.')
            
            if var_name not in ['profile', 'entity', 'console', 'Object', 'Array', 'Math']:
                entity_type = self._infer_entity_type(code, var_name)
                normalized = self.normalize_field_path(prop_path)
                
                access_patterns.append({
                    'field': prop_path,
                    'normalized': normalized,
                    'entity_type': entity_type,
                    'access_method': 'direct'
                })
                
                if entity_type != 'unknown':
                    self.field_by_entity[entity_type].add(normalized)
                    
        return access_patterns
    
    def extract_destructuring_patterns(self, code: str) -> List[Dict]:
        """Extract fields from destructuring assignments"""
        patterns = []
        
        # Match destructuring patterns
        destruct_pattern = r'const\s*\{([^}]+)\}\s*=\s*(\w+)'
        
        for match in re.finditer(destruct_pattern, code):
            fields_str = match.group(1)
            source_var = match.group(2)
            
            # Parse nested destructuring
            fields = self._parse_destructuring(fields_str)
            entity_type = self._infer_entity_type(code, source_var)
            
            for field_path in fields:
                normalized = self.normalize_field_path(field_path)
                patterns.append({
                    'field': field_path,
                    'normalized': normalized,
                    'entity_type': entity_type,
                    'access_method': 'destructuring'
                })
                
                if entity_type != 'unknown':
                    self.field_by_entity[entity_type].add(normalized)
                    
        return patterns
    
    def _parse_destructuring(self, destruct_str: str) -> List[str]:
        """Parse destructuring pattern to extract field paths"""
        fields = []
        
        # Simple parsing - could be enhanced for deeper nesting
        parts = destruct_str.split(',')
        for part in parts:
            part = part.strip()
            if ':' in part:
                # Handle aliasing
                field_name = part.split(':')[0].strip()
            else:
                field_name = part.strip()
            
            if field_name and not field_name.startswith('{'):
                fields.append(field_name)
                
        return fields
    
    def extract_entity_types(self, code: str) -> Set[str]:
        """Extract all entity types referenced in the code"""
        types = set()
        
        # Type equality checks
        type_patterns = [
            r'entity\.type\s*===\s*[\'"`](\w+)[\'"`]',
            r'type\s*===\s*[\'"`](\w+)[\'"`]',
            r'\.type\s*===\s*[\'"`](\w+)[\'"`]'
        ]
        
        for pattern in type_patterns:
            for match in re.finditer(pattern, code):
                entity_type = match.group(1)
                types.add(entity_type)
                self.entity_types.add(entity_type)
                
        return types
    
    def detect_join_patterns(self, code: str) -> Dict:
        """Detect entity join patterns and relationships"""
        join_info = {
            'uses_join': False,
            'join_conditions': [],
            'joined_entities': []
        }
        
        if 'joinEntities' in code:
            join_info['uses_join'] = True
            
            # Extract join condition
            join_pattern = r'joinEntities.*?\((.*?)\)\s*=>\s*\(([\s\S]*?)\)'
            match = re.search(join_pattern, code)
            
            if match:
                condition = match.group(2)
                # Extract entity relationships
                rel_pattern = r'(\w+)\.type\s*===\s*[\'"`](\w+)[\'"`]'
                for rel_match in re.finditer(rel_pattern, condition):
                    join_info['joined_entities'].append(rel_match.group(2))
                    
                # Extract join keys
                key_pattern = r'(\w+)\.(\w+)\s*===\s*(\w+)\.(\w+)'
                for key_match in re.finditer(key_pattern, condition):
                    join_info['join_conditions'].append({
                        'left': f"{key_match.group(1)}.{key_match.group(2)}",
                        'right': f"{key_match.group(3)}.{key_match.group(4)}"
                    })
                    
        return join_info
    
    def analyze_return_pattern(self, code: str) -> Dict:
        """Analyze what the synthesizer returns"""
        if 'return []' in code or 'return[];' in code:
            return {'type': 'empty_array', 'dynamic': False}
            
        if re.search(r'return\s*\[\s*\{\s*type\s*:\s*["\']none["\']', code):
            return {'type': 'static_none', 'dynamic': False}
            
        if re.search(r'return\s*\[\s*\{\s*\.\.\.', code):
            return {'type': 'spread_operator', 'dynamic': True}
            
        if re.search(r'return.*?ventureId', code):
            return {'type': 'venture_based', 'dynamic': True}
            
        return {'type': 'dynamic', 'dynamic': True}
    
    def calculate_complexity_score(self, analysis: Dict) -> Dict:
        """Calculate complexity metrics"""
        score = 0
        factors = []
        
        if analysis['join_info']['uses_join']:
            score += 3
            factors.append('uses_join_entities')
            
        if len(analysis['all_fields']) > 10:
            score += 2
            factors.append('many_fields')
            
        if len(analysis['entity_types']) > 1:
            score += 2
            factors.append('multiple_entities')
            
        if analysis['code_length'] > 1000:
            score += 2
            factors.append('long_code')
            
        if 'conditional_logic' in analysis and analysis['conditional_logic']:
            score += 1
            factors.append('complex_conditions')
            
        complexity = 'simple' if score <= 2 else 'medium' if score <= 5 else 'complex'
        
        return {
            'score': score,
            'level': complexity,
            'factors': factors
        }
    
    def analyze_synthesizer(self, name: str, code: str) -> Dict:
        """Comprehensive analysis of a single synthesizer"""
        # Extract all field access patterns
        entity_pick_fields = self.extract_entity_pick_fields(code)
        direct_access = self.extract_direct_property_access(code)
        destructured = self.extract_destructuring_patterns(code)
        
        # Combine all field accesses
        all_field_accesses = entity_pick_fields + direct_access + destructured
        
        # Extract unique fields
        all_fields = set(f['normalized'] for f in all_field_accesses)
        
        # Analyze patterns
        analysis = {
            'name': name,
            'entity_types': list(self.extract_entity_types(code)),
            'all_fields': list(all_fields),
            'field_accesses': all_field_accesses,
            'join_info': self.detect_join_patterns(code),
            'return_pattern': self.analyze_return_pattern(code),
            'code_length': len(code),
            'conditional_logic': 'if' in code or '?' in code,
            'uses_spread': '...' in code,
            'uses_optional_chaining': '?.' in code,
        }
        
        # Calculate complexity
        analysis['complexity'] = self.calculate_complexity_score(analysis)
        
        self.results.append(analysis)
        return analysis
    
    def generate_comprehensive_report(self) -> Dict:
        """Generate detailed analysis report"""
        # Field usage statistics
        field_counter = Counter()
        entity_field_map = defaultdict(Counter)
        access_method_stats = Counter()
        
        for result in self.results:
            for field_access in result['field_accesses']:
                field = field_access['normalized']
                entity = field_access['entity_type']
                method = field_access['access_method']
                
                field_counter[field] += 1
                entity_field_map[entity][field] += 1
                access_method_stats[method] += 1
        
        # Common field patterns
        common_patterns = self._identify_common_patterns(field_counter)
        
        report = {
            'summary': {
                'total_synthesizers': len(self.results),
                'total_unique_fields': len(self.all_fields),
                'total_entity_types': len(self.entity_types),
                'entity_types': sorted(self.entity_types),
                'complexity_distribution': self._get_complexity_distribution(),
                'return_patterns': self._get_return_pattern_distribution(),
            },
            'field_analysis': {
                'most_used_fields': field_counter.most_common(20),
                'fields_by_entity': {k: v.most_common(10) for k, v in entity_field_map.items()},
                'field_variations': dict(self.field_variations),
                'access_methods': dict(access_method_stats),
                'common_patterns': common_patterns,
            },
            'entity_relationships': self._analyze_entity_relationships(),
            'synthesizer_details': self.results,
        }
        
        return report
    
    def _identify_common_patterns(self, field_counter: Counter) -> Dict:
        """Identify common data access patterns"""
        patterns = {
            'authentication': [],
            'billing': [],
            'features': [],
            'entitlements': [],
            'social_media': [],
            'commerce': [],
            'appointments': [],
            'content': [],
        }
        
        for field, count in field_counter.items():
            if 'billing' in field or 'payment' in field:
                patterns['billing'].append((field, count))
            elif 'entitlement' in field or 'current' in field:
                patterns['entitlements'].append((field, count))
            elif 'feature' in field or 'widget' in field:
                patterns['features'].append((field, count))
            elif 'facebook' in field or 'instagram' in field or 'social' in field:
                patterns['social_media'].append((field, count))
            elif 'product' in field or 'commerce' in field or 'ols' in field:
                patterns['commerce'].append((field, count))
            elif 'appointment' in field or 'ola' in field or 'service' in field:
                patterns['appointments'].append((field, count))
            elif 'account' in field or 'shopper' in field:
                patterns['authentication'].append((field, count))
                
        # Sort each pattern list by usage count
        for key in patterns:
            patterns[key] = sorted(patterns[key], key=lambda x: x[1], reverse=True)[:5]
            
        return patterns
    
    def _analyze_entity_relationships(self) -> List[Dict]:
        """Analyze how entities are related in joins"""
        relationships = []
        
        for result in self.results:
            if result['join_info']['uses_join']:
                for condition in result['join_info']['join_conditions']:
                    relationships.append({
                        'synthesizer': result['name'],
                        'relationship': condition,
                        'entities': result['join_info']['joined_entities']
                    })
                    
        return relationships
    
    def _get_complexity_distribution(self) -> Dict:
        """Get distribution of complexity levels"""
        dist = Counter(r['complexity']['level'] for r in self.results)
        return dict(dist)
    
    def _get_return_pattern_distribution(self) -> Dict:
        """Get distribution of return patterns"""
        dist = Counter(r['return_pattern']['type'] for r in self.results)
        return dict(dist)
    
    def parse_rad_file(self, filepath: str) -> List[Tuple[str, str]]:
        """Parse RAD file and extract synthesizer name and code pairs"""
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        synthesizers = []
        sections = content.split('## ')
        
        for section in sections[1:]:  # Skip the header
            lines = section.strip().split('\n')
            if lines:
                name = lines[0].strip()
                
                # Find JavaScript code block
                code_start = section.find('```javascript')
                code_end = section.find('```', code_start + 1)
                
                if code_start != -1 and code_end != -1:
                    code = section[code_start + 13:code_end].strip()
                    synthesizers.append((name, code))
                    
        return synthesizers
    
    def export_report(self, report: Dict, format: str = 'json') -> str:
        """Export report in various formats"""
        if format == 'json':
            # Convert sets to lists for JSON serialization
            def convert_sets(obj):
                if isinstance(obj, set):
                    return list(obj)
                elif isinstance(obj, dict):
                    return {k: convert_sets(v) for k, v in obj.items()}
                elif isinstance(obj, list):
                    return [convert_sets(item) for item in obj]
                return obj
            
            serializable_report = convert_sets(report)
            return json.dumps(serializable_report, indent=2)
        
        elif format == 'markdown':
            md = "# RAD Synthesizer Analysis Report\n\n"
            
            # Summary
            md += "## Summary\n"
            md += f"- Total Synthesizers: {report['summary']['total_synthesizers']}\n"
            md += f"- Unique Fields: {report['summary']['total_unique_fields']}\n"
            md += f"- Entity Types: {', '.join(report['summary']['entity_types'])}\n\n"
            
            # Complexity Distribution
            md += "### Complexity Distribution\n"
            for level, count in report['summary']['complexity_distribution'].items():
                md += f"- {level}: {count}\n"
            md += "\n"
            
            # Most Used Fields
            md += "## Most Used Fields\n"
            for field, count in report['field_analysis']['most_used_fields']:
                md += f"- `{field}`: {count} times\n"
            md += "\n"
            
            # Common Patterns
            md += "## Common Data Access Patterns\n"
            for category, fields in report['field_analysis']['common_patterns'].items():
                if fields:
                    md += f"\n### {category.title()}\n"
                    for field, count in fields:
                        md += f"- `{field}`: {count} times\n"
            
            # Field Variations
            if report['field_analysis']['field_variations']:
                md += "\n## Field Access Variations\n"
                md += "Fields accessed in different ways:\n"
                for normalized, variations in report['field_analysis']['field_variations'].items():
                    if len(variations) > 1:
                        md += f"\n### {normalized}\n"
                        for var in variations:
                            md += f"- `{var}`\n"
            
            return md
        
        elif format == 'csv':
            import csv
            import io
            
            output = io.StringIO()
            writer = csv.writer(output)
            
            # Header
            writer.writerow(['Synthesizer', 'Complexity', 'Entity Types', 'Field Count', 'Uses Join', 'Return Type'])
            
            # Data rows
            for synth in report['synthesizer_details']:
                writer.writerow([
                    synth['name'],
                    synth['complexity']['level'],
                    ', '.join(synth['entity_types']),
                    len(synth['all_fields']),
                    synth['join_info']['uses_join'],
                    synth['return_pattern']['type']
                ])
                
            return output.getvalue()
        
        return ""

def main():
    parser = argparse.ArgumentParser(description='Analyze RAD synthesizer field usage patterns')
    parser.add_argument('input', help='Input RAD file (markdown format)')
    parser.add_argument('-o', '--output', help='Output file path')
    parser.add_argument('-f', '--format', choices=['json', 'markdown', 'csv'], 
                       default='markdown', help='Output format')
    parser.add_argument('-v', '--verbose', action='store_true', help='Verbose output')
    
    args = parser.parse_args()
    
    # Initialize analyzer
    analyzer = RADFieldAnalyzer()
    
    # Parse and analyze
    if args.verbose:
        print(f"Analyzing RAD file: {args.input}")
        
    synthesizers = analyzer.parse_rad_file(args.input)
    
    if args.verbose:
        print(f"Found {len(synthesizers)} synthesizers")
    
    for name, code in synthesizers:
        analyzer.analyze_synthesizer(name, code)
    
    # Generate report
    report = analyzer.generate_comprehensive_report()
    
    # Export report
    output = analyzer.export_report(report, args.format)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output)
        print(f"Report saved to: {args.output}")
    else:
        print(output)
    
    # Print summary to console if verbose
    if args.verbose:
        print("\n=== Quick Summary ===")
        print(f"Total synthesizers: {report['summary']['total_synthesizers']}")
        print(f"Unique fields: {report['summary']['total_unique_fields']}")
        print(f"Entity types: {', '.join(report['summary']['entity_types'])}")
        print("\nTop 5 most used fields:")
        for field, count in report['field_analysis']['most_used_fields'][:5]:
            print(f"  - {field}: {count} times")

if __name__ == '__main__':
    main()