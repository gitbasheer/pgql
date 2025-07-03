#!/usr/bin/env python3
"""
Generate a comprehensive data dictionary from RAD analysis
Shows exactly what data each synthesizer needs in an organized format
"""

import json
import argparse
from collections import defaultdict
from typing import Dict, List, Set

class DataDictionaryGenerator:
    def __init__(self, analysis_report: Dict):
        self.report = analysis_report
        self.data_dictionary = defaultdict(lambda: {
            'description': '',
            'entity_types': set(),
            'used_by_synthesizers': [],
            'access_methods': set(),
            'variations': set(),
            'category': ''
        })
        
    def build_dictionary(self):
        """Build comprehensive data dictionary from analysis"""
        
        # Process each synthesizer
        for synth in self.report['synthesizer_details']:
            synth_name = synth['name']
            
            for field_access in synth['field_accesses']:
                field = field_access['normalized']
                original = field_access['field']
                entity_type = field_access['entity_type']
                method = field_access['access_method']
                
                # Update dictionary entry
                self.data_dictionary[field]['entity_types'].add(entity_type)
                self.data_dictionary[field]['used_by_synthesizers'].append(synth_name)
                self.data_dictionary[field]['access_methods'].add(method)
                self.data_dictionary[field]['variations'].add(original)
                
                # Assign category
                if not self.data_dictionary[field]['category']:
                    self.data_dictionary[field]['category'] = self._categorize_field(field)
                
                # Generate description
                if not self.data_dictionary[field]['description']:
                    self.data_dictionary[field]['description'] = self._describe_field(field)
    
    def _categorize_field(self, field: str) -> str:
        """Categorize field based on its name and usage"""
        field_lower = field.lower()
        
        if any(term in field_lower for term in ['account', 'shopper', 'id']):
            return 'Identity & Authentication'
        elif any(term in field_lower for term in ['billing', 'payment', 'commitment', 'autorenew']):
            return 'Billing & Payments'
        elif any(term in field_lower for term in ['entitlement', 'current', 'transitionable']):
            return 'Entitlements & Permissions'
        elif any(term in field_lower for term in ['feature', 'widget', 'published']):
            return 'Features & Configuration'
        elif any(term in field_lower for term in ['facebook', 'instagram', 'social', 'gem']):
            return 'Social Media & Marketing'
        elif any(term in field_lower for term in ['product', 'commerce', 'ols', 'marketplace']):
            return 'Commerce & Products'
        elif any(term in field_lower for term in ['appointment', 'ola', 'service', 'calendar']):
            return 'Appointments & Services'
        elif any(term in field_lower for term in ['type', 'status']):
            return 'Status & Types'
        else:
            return 'Other'
    
    def _describe_field(self, field: str) -> str:
        """Generate human-readable description for field"""
        descriptions = {
            'accountId': 'Unique identifier for the account',
            'id': 'Entity unique identifier',
            'type': 'Entity type identifier (e.g., wsbvnext, mktgasst)',
            'entitlementData': 'Complete entitlement information for the account',
            'entitlements.current': 'Currently active entitlements',
            'websiteType': 'Type of website (e.g., gocentral)',
            'features.published': 'Whether the website is published',
            'features.widgets': 'List of enabled widgets on the website',
            'billing.commitment': 'Billing commitment type',
            'account.paymentStatus': 'Current payment status of the account',
            'social.lastFacebookPost': 'Date of last Facebook post',
            'social.lastInstagramPost': 'Date of last Instagram post',
            'commerce.productCount': 'Number of products in the commerce store',
            'appointments.serviceCount': 'Number of services available for appointments',
            'appointments.status': 'Status of the appointments system',
            'customerIntentions': 'Customer intent data for personalization',
            'features.planType': 'Type of plan the customer is on',
        }
        
        return descriptions.get(field, f'Data field: {field}')
    
    def generate_markdown_dictionary(self) -> str:
        """Generate markdown formatted data dictionary"""
        output = "# RAD Data Dictionary\n\n"
        output += "This dictionary documents all data fields used by RAD synthesizers.\n\n"
        
        # Group by category
        categories = defaultdict(list)
        for field, info in self.data_dictionary.items():
            categories[info['category']].append((field, info))
        
        # Sort categories by importance
        category_order = [
            'Identity & Authentication',
            'Entitlements & Permissions',
            'Features & Configuration',
            'Billing & Payments',
            'Commerce & Products',
            'Appointments & Services',
            'Social Media & Marketing',
            'Status & Types',
            'Other'
        ]
        
        for category in category_order:
            if category in categories:
                output += f"## {category}\n\n"
                
                # Sort fields within category by usage
                sorted_fields = sorted(
                    categories[category], 
                    key=lambda x: len(x[1]['used_by_synthesizers']), 
                    reverse=True
                )
                
                for field, info in sorted_fields:
                    output += f"### `{field}`\n\n"
                    output += f"**Description:** {info['description']}\n\n"
                    output += f"**Used by:** {len(info['used_by_synthesizers'])} synthesizers\n\n"
                    
                    if len(info['entity_types']) > 0:
                        output += f"**Entity Types:** {', '.join(sorted(info['entity_types']))}\n\n"
                    
                    if len(info['variations']) > 1:
                        output += "**Access Variations:**\n"
                        for var in sorted(info['variations']):
                            output += f"- `{var}`\n"
                        output += "\n"
                    
                    if len(info['used_by_synthesizers']) <= 5:
                        output += "**Used in:**\n"
                        for synth in sorted(info['used_by_synthesizers']):
                            output += f"- {synth}\n"
                        output += "\n"
                    
                    output += "---\n\n"
        
        return output
    
    def generate_synthesizer_requirements(self) -> str:
        """Generate a view showing what each synthesizer needs"""
        output = "\n# Synthesizer Data Requirements\n\n"
        output += "This section shows exactly what data each synthesizer requires.\n\n"
        
        # Group synthesizers by pattern
        patterns = {
            'Simple Entity Query': [],
            'Entity Join Query': [],
            'Static/Empty Return': [],
            'Complex Logic': []
        }
        
        for synth in self.report['synthesizer_details']:
            if synth['return_pattern']['type'] in ['empty_array', 'static_none']:
                patterns['Static/Empty Return'].append(synth)
            elif synth['join_info']['uses_join']:
                patterns['Entity Join Query'].append(synth)
            elif synth['complexity']['level'] == 'complex':
                patterns['Complex Logic'].append(synth)
            else:
                patterns['Simple Entity Query'].append(synth)
        
        for pattern_name, synthesizers in patterns.items():
            if synthesizers:
                output += f"## {pattern_name}\n\n"
                
                # Show first 10 synthesizers in detail
                for synth in synthesizers[:10]:
                    output += f"### {synth['name']}\n\n"
                    
                    if synth['entity_types']:
                        output += f"**Entity Types:** {', '.join(synth['entity_types'])}\n\n"
                    
                    if synth['all_fields']:
                        output += "**Required Fields:**\n"
                        # Group fields by entity
                        fields_by_entity = defaultdict(list)
                        for field_access in synth['field_accesses']:
                            entity = field_access['entity_type']
                            field = field_access['normalized']
                            fields_by_entity[entity].append(field)
                        
                        for entity, fields in sorted(fields_by_entity.items()):
                            if fields:
                                output += f"\n*{entity}:*\n"
                                for field in sorted(set(fields)):
                                    output += f"- `{field}`\n"
                    
                    output += "\n---\n\n"
                
                if len(synthesizers) > 10:
                    output += f"*... and {len(synthesizers) - 10} more synthesizers with this pattern*\n\n"
        
        return output
    
    def generate_csv_export(self) -> str:
        """Generate CSV for easy spreadsheet analysis"""
        import csv
        import io
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            'Field Name',
            'Category',
            'Description',
            'Entity Types',
            'Used By Count',
            'Access Methods',
            'Has Variations'
        ])
        
        # Data rows
        for field, info in sorted(self.data_dictionary.items()):
            writer.writerow([
                field,
                info['category'],
                info['description'],
                ', '.join(sorted(info['entity_types'])),
                len(info['used_by_synthesizers']),
                ', '.join(sorted(info['access_methods'])),
                'Yes' if len(info['variations']) > 1 else 'No'
            ])
        
        return output.getvalue()

def main():
    parser = argparse.ArgumentParser(description='Generate data dictionary from RAD analysis')
    parser.add_argument('input', help='JSON analysis report')
    parser.add_argument('-o', '--output', help='Output file base name', default='rad-data-dictionary')
    
    args = parser.parse_args()
    
    # Load analysis report
    with open(args.input, 'r') as f:
        report = json.load(f)
    
    # Generate data dictionary
    generator = DataDictionaryGenerator(report)
    generator.build_dictionary()
    
    # Generate markdown dictionary
    md_output = generator.generate_markdown_dictionary()
    md_output += generator.generate_synthesizer_requirements()
    
    with open(f"{args.output}.md", 'w') as f:
        f.write(md_output)
    print(f"Data dictionary saved to: {args.output}.md")
    
    # Generate CSV
    csv_output = generator.generate_csv_export()
    with open(f"{args.output}.csv", 'w') as f:
        f.write(csv_output)
    print(f"CSV export saved to: {args.output}.csv")

if __name__ == '__main__':
    main()