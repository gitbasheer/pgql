#!/usr/bin/env python3
"""
Create a simple consolidated list of all unique data fields
"""

import json
import argparse
from collections import defaultdict

def create_consolidated_list(json_report_path: str):
    """Create a simple, organized list of all unique data"""
    
    with open(json_report_path, 'r') as f:
        report = json.load(f)
    
    # Collect and organize all unique fields
    data_by_category = defaultdict(lambda: defaultdict(list))
    
    # Process each synthesizer to get unique fields
    unique_fields = {}
    for synth in report['synthesizer_details']:
        for field_access in synth['field_accesses']:
            field = field_access['normalized']
            entity = field_access['entity_type']
            
            if field not in unique_fields:
                unique_fields[field] = {
                    'count': 0,
                    'entities': set(),
                    'synthesizers': []
                }
            
            unique_fields[field]['count'] += 1
            unique_fields[field]['entities'].add(entity)
            unique_fields[field]['synthesizers'].append(synth['name'])
    
    # Categorize fields with better logic
    for field, info in unique_fields.items():
        # Determine category and subcategory
        if field in ['accountId', 'id', 'type'] or 'accountId' in field or '.id' in field or '.type' in field:
            category = '1. Core Identity & References'
            if 'accountId' in field:
                subcategory = 'Account IDs'
            elif field == 'id' or '.id' in field:
                subcategory = 'Entity IDs'
            elif field == 'type' or '.type' in field:
                subcategory = 'Entity Types'
            else:
                subcategory = 'Other Identity'
                
        elif 'entitlement' in field.lower() or field.startswith('entitlementData'):
            category = '2. Entitlements & Permissions'
            if '.current' in field:
                subcategory = 'Current Entitlements'
            elif '.transitionable' in field or '.available' in field:
                subcategory = 'Available Entitlements'
            else:
                subcategory = 'General Entitlements'
                
        elif any(x in field for x in ['billing', 'payment', 'commitment', 'autoRenew', 'shopperId']):
            category = '3. Billing & Account Management'
            subcategory = 'Billing Details'
            
        elif any(x in field for x in ['website', 'published', 'widget', 'domain', 'features.']):
            category = '4. Website Configuration'
            if 'widget' in field:
                subcategory = 'Widgets & Features'
            elif 'published' in field:
                subcategory = 'Publishing Status'
            elif 'websiteType' in field:
                subcategory = 'Website Type'
            else:
                subcategory = 'Other Settings'
                
        elif any(x in field for x in ['facebook', 'instagram', 'social', 'gem', 'email', 'subscriber']):
            category = '5. Marketing & Social Media'
            if 'facebook' in field:
                subcategory = 'Facebook'
            elif 'instagram' in field:
                subcategory = 'Instagram'
            elif 'gem' in field or 'email' in field or 'subscriber' in field:
                subcategory = 'Email Marketing'
            elif 'gmb' in field:
                subcategory = 'Google Business'
            elif 'yelp' in field:
                subcategory = 'Yelp'
            else:
                subcategory = 'Other Social'
                
        elif any(x in field for x in ['product', 'commerce', 'ols', 'marketplace', 'store']):
            category = '6. E-commerce'
            if 'product' in field:
                subcategory = 'Products'
            elif 'marketplace' in field:
                subcategory = 'Marketplaces'
            else:
                subcategory = 'Store Settings'
                
        elif any(x in field for x in ['appointment', 'ola', 'service', 'calendar', 'booking']):
            category = '7. Appointments & Services'
            if 'service' in field:
                subcategory = 'Services'
            elif 'calendar' in field or 'booking' in field:
                subcategory = 'Scheduling'
            else:
                subcategory = 'General Appointments'
                
        elif field.startswith('links.'):
            category = '8. Navigation & Links'
            subcategory = 'Action Links'
            
        elif any(x in field for x in ['customer', 'contact', 'intention']):
            category = '9. Customer Data'
            subcategory = 'Customer Info'
            
        else:
            category = '10. Other Data'
            subcategory = 'Miscellaneous'
        
        data_by_category[category][subcategory].append({
            'field': field,
            'count': info['count'],
            'entities': sorted(info['entities']),
            'synthesizer_count': len(set(info['synthesizers']))
        })
    
    # Generate output
    output = "# Complete List of Unique Data Fields Used by RAD Synthesizers\n\n"
    output += f"**Total: {len(unique_fields)} unique data fields** across 144 synthesizers\n\n"
    
    # Sort categories
    for category in sorted(data_by_category.keys()):
        output += f"## {category}\n\n"
        
        subcategories = data_by_category[category]
        
        for subcategory in sorted(subcategories.keys()):
            fields = subcategories[subcategory]
            
            # Sort fields by usage count
            fields.sort(key=lambda x: x['count'], reverse=True)
            
            output += f"### {subcategory}\n\n"
            
            for field_info in fields:
                field = field_info['field']
                count = field_info['synthesizer_count']
                entities = field_info['entities']
                
                # Format based on usage
                if count >= 20:
                    marker = "🔴"  # High usage
                elif count >= 5:
                    marker = "🟡"  # Medium usage
                else:
                    marker = "🟢"  # Low usage
                
                output += f"{marker} **`{field}`** - Used by {count} synthesizers"
                
                if entities and entities != ['unknown']:
                    output += f" [{', '.join(entities)}]"
                
                output += "\n"
            
            output += "\n"
    
    # Add summary table
    output += "## Summary by Usage Frequency\n\n"
    
    # Group by usage frequency
    frequency_groups = {
        'Very Common (20+ synthesizers)': [],
        'Common (10-19 synthesizers)': [],
        'Moderate (5-9 synthesizers)': [],
        'Uncommon (2-4 synthesizers)': [],
        'Rare (1 synthesizer)': []
    }
    
    for field, info in unique_fields.items():
        count = len(set(info['synthesizers']))
        if count >= 20:
            frequency_groups['Very Common (20+ synthesizers)'].append(field)
        elif count >= 10:
            frequency_groups['Common (10-19 synthesizers)'].append(field)
        elif count >= 5:
            frequency_groups['Moderate (5-9 synthesizers)'].append(field)
        elif count >= 2:
            frequency_groups['Uncommon (2-4 synthesizers)'].append(field)
        else:
            frequency_groups['Rare (1 synthesizer)'].append(field)
    
    for group, fields in frequency_groups.items():
        if fields:
            output += f"### {group} ({len(fields)} fields)\n"
            
            # Show first 10 and count
            for field in sorted(fields)[:10]:
                output += f"- `{field}`\n"
            
            if len(fields) > 10:
                output += f"- _... and {len(fields) - 10} more_\n"
            
            output += "\n"
    
    return output

def main():
    parser = argparse.ArgumentParser(description='Create consolidated list of unique data fields')
    parser.add_argument('input', help='JSON analysis report')
    parser.add_argument('-o', '--output', default='consolidated-data-fields.md',
                       help='Output file')
    
    args = parser.parse_args()
    
    # Generate list
    consolidated_list = create_consolidated_list(args.input)
    
    with open(args.output, 'w') as f:
        f.write(consolidated_list)
    
    print(f"Consolidated list saved to: {args.output}")

if __name__ == '__main__':
    main()